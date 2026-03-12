"""
Chat router.

POST /api/chat  — SSE streaming Q&A with Claude.

SSE event format:
  data: {"type": "token",       "content": "..."}
  data: {"type": "truncated"}
  data: {"type": "done",        "conversation_id": "...", "message_id": "..."}
  data: {"type": "error",       "message": "..."}
  data: [DONE]

FR-5: Per-user asyncio.Lock prevents concurrent streams for the same
user from interleaving their responses.  The queue is managed on the
frontend (useChat hook); the lock here is the server-side safety net.
"""

import asyncio
import collections
import json
import logging
from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.core.config import settings
from app.db.repositories import ConversationRepository, MessageRepository, PdfFileRepository, VectorSearchRepository
from app.deps.auth import get_current_user
from app.models.schemas import ChatRequest
from app.services.claude_service import ClaudeService
from app.services.embedding_service import get_embedding_service

logger = logging.getLogger(__name__)
router = APIRouter()

# ---------------------------------------------------------------------------
# FR-5: Per-user streaming lock (OrderedDict LRU, capped at 1 000 entries)
#
# Keyed by user UUID string.  A new Lock is created on first use and
# held for the entire SSE stream duration — including history read and
# user-message persist, so concurrent requests for the same user cannot
# race on history snapshot.
# ---------------------------------------------------------------------------
_SESSION_LOCK_LIMIT = 1_000
_session_locks: collections.OrderedDict[str, asyncio.Lock] = collections.OrderedDict()
_session_locks_mutex = asyncio.Lock()


async def _get_session_lock(user_id: str) -> asyncio.Lock:
    """Return (or create) the asyncio.Lock for a given user, with LRU eviction."""
    async with _session_locks_mutex:
        if user_id in _session_locks:
            _session_locks.move_to_end(user_id)
            return _session_locks[user_id]
        lock = asyncio.Lock()
        _session_locks[user_id] = lock
        if len(_session_locks) > _SESSION_LOCK_LIMIT:
            _session_locks.popitem(last=False)  # evict LRU
        return lock


def _sse(payload: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _sse_done() -> str:
    return "data: [DONE]\n\n"


@router.post("/chat")
async def chat_endpoint(
    body: ChatRequest,
    user_id: UUID = Depends(get_current_user),
):
    """
    Accept a chat message and stream Claude's response via SSE.

    Flow:
    1. Resolve or create conversation for (user, pdf)
    2. Acquire per-user lock (FR-5)
    3. [INSIDE lock] Fetch last 10 messages as history context
    4. [INSIDE lock] Persist user message
    5. [INSIDE lock] Stream from Claude
    6. [INSIDE lock] Persist assistant message on stream completion
    7. Emit done / error events
    """
    conv_repo = ConversationRepository()
    msg_repo = MessageRepository()
    vector_repo = VectorSearchRepository()
    claude_svc = ClaudeService()

    # ------------------------------------------------------------------
    # 1. Conversation resolution
    # ------------------------------------------------------------------
    pdf_id = body.pdf_id

    conversation = await conv_repo.get_or_create(
        user_id=user_id,
        pdf_id=pdf_id,
        force_new=body.force_new_conversation,
    )
    conversation_id: UUID = conversation["id"]

    # ------------------------------------------------------------------
    # 2–7. Stream generator (holds per-user lock for FR-5)
    # ------------------------------------------------------------------
    user_lock = await _get_session_lock(str(user_id))

    async def event_generator():
        full_response = ""
        was_truncated = False
        assistant_msg_id = None
        output_tokens: int | None = None

        async with user_lock:
            # 3. Fetch history INSIDE lock — prevents race with concurrent tab
            history = await msg_repo.get_recent(
                conversation_id=conversation_id,
                limit=10,
            )
            # 4. Persist user message INSIDE lock — atomic with history read
            await msg_repo.create(
                conversation_id=conversation_id,
                role="user",
                content=body.message,
            )

            # RAG: embed user message → search similar chunks from the user's PDF
            # When Vision is active (page_image), exclude that page from RAG to avoid duplication.
            rag_chunks: list[str] = []
            if settings.RAG_ENABLED and pdf_id:
                try:
                    embedding_svc = get_embedding_service()
                    query_vec = await embedding_svc.embed(body.message)
                    exclude_page = body.page_number if body.page_image else None
                    results = await vector_repo.search(
                        query_embedding=query_vec,
                        pdf_id=pdf_id,
                        limit=3,
                        exclude_page=exclude_page,
                    )
                    rag_chunks.extend(r["content"] for r in results)
                    if rag_chunks:
                        logger.info("RAG: %d chunks for pdf %s (exclude_page=%s)", len(results), pdf_id, exclude_page)
                except Exception as exc:
                    logger.warning("RAG search failed, using base prompt: %s", exc)

            # Resolve language for the PDF (if available)
            # BCP-47 code → display name for system prompt
            _LANG_NAMES: dict[str, str] = {
                "de-DE": "독일어",
                "de-AT": "독일어",
                "de-CH": "독일어",
                "en-US": "영어",
                "en-GB": "영어",
                "fr-FR": "프랑스어",
                "es-ES": "스페인어",
                "it-IT": "이탈리아어",
                "pt-BR": "포르투갈어",
                "ja-JP": "일본어",
                "zh-CN": "중국어",
                "ko-KR": "한국어",
            }
            language = "English"  # default fallback
            if pdf_id:
                pdf_repo = PdfFileRepository()
                pdf_meta = await pdf_repo.get(user_id, pdf_id)
                if pdf_meta and pdf_meta.get("language"):
                    raw_lang = pdf_meta["language"]
                    language = _LANG_NAMES.get(raw_lang, raw_lang)

            # 5. Stream from Claude
            try:
                async for event in claude_svc.stream(
                    user_message=body.message,
                    history=history,
                    language=language,
                    rag_chunks=rag_chunks or None,
                    page_image=body.page_image or None,
                    page_text=body.page_text or None,
                ):
                    if event["type"] == "token":
                        full_response += event["content"]
                        yield _sse(event)
                    elif event["type"] == "usage":
                        output_tokens = event["output_tokens"]
                        logger.info(
                            "Token usage — pdf=%s out=%d in=%d cache_read=%d cache_write=%d",
                            pdf_id,
                            event["output_tokens"],
                            event["input_tokens"],
                            event["cache_read_tokens"],
                            event["cache_creation_tokens"],
                        )
                    elif event["type"] == "truncated":
                        was_truncated = True
                        yield _sse(event)
                    elif event["type"] == "error":
                        await msg_repo.create(
                            conversation_id=conversation_id,
                            role="assistant",
                            content=event.get("message", "오류가 발생했습니다."),
                        )
                        yield _sse(event)
                        yield _sse_done()
                        return

                # Persist assistant message only when stream completes fully
                if full_response:
                    saved = await msg_repo.create(
                        conversation_id=conversation_id,
                        role="assistant",
                        content=full_response,
                        token_count=output_tokens,
                        rag_hit=bool(rag_chunks),
                    )
                    assistant_msg_id = str(saved["id"])

                yield _sse(
                    {
                        "type": "done",
                        "conversation_id": str(conversation_id),
                        "message_id": assistant_msg_id,
                        "truncated": was_truncated,
                    }
                )
            except Exception as exc:
                logger.exception("Unhandled error in event_generator: %s", exc)
                error_message = "서버에서 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
                try:
                    await msg_repo.create(
                        conversation_id=conversation_id,
                        role="assistant",
                        content=error_message,
                    )
                except Exception:
                    logger.exception("Failed to save error message to DB")
                yield _sse({"type": "error", "message": error_message})
            finally:
                yield _sse_done()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "close",
        },
    )
