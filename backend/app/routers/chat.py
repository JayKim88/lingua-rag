"""
Chat router.

POST /api/chat  — SSE streaming Q&A with Claude.

SSE event format:
  data: {"type": "token",       "content": "..."}
  data: {"type": "truncated"}
  data: {"type": "done",        "conversation_id": "...", "message_id": "..."}
  data: {"type": "error",       "message": "..."}
  data: [DONE]

FR-5: Per-session asyncio.Lock prevents concurrent streams for the same
session from interleaving their responses.  The queue is managed on the
frontend (useChat hook); the lock here is the server-side safety net.
"""

import asyncio
import collections
import json
import logging
from uuid import UUID

from fastapi import APIRouter, Request, Response
from fastapi.responses import StreamingResponse

from app.core.config import settings
from app.core.constants import SESSION_COOKIE
from app.db.repositories import (
    ConversationRepository,
    MessageRepository,
    SessionRepository,
)
from app.models.schemas import ChatRequest
from app.services.claude_service import ClaudeService
from app.services.session_service import SessionService

logger = logging.getLogger(__name__)
router = APIRouter()

# ---------------------------------------------------------------------------
# FR-5: Per-session streaming lock (OrderedDict LRU, capped at 1 000 entries)
#
# Keyed by session UUID string.  A new Lock is created on first use and
# held for the entire SSE stream duration — including history read and
# user-message persist, so concurrent requests for the same session cannot
# race on history snapshot.  The 1 000-entry cap is conservative for a
# Railway v0.1 deployment; bump in v0.2 when traffic justifies it.
# ---------------------------------------------------------------------------
_SESSION_LOCK_LIMIT = 1_000
_session_locks: collections.OrderedDict[str, asyncio.Lock] = collections.OrderedDict()
_session_locks_mutex = asyncio.Lock()


async def _get_session_lock(session_id: str) -> asyncio.Lock:
    """Return (or create) the asyncio.Lock for a given session, with LRU eviction."""
    async with _session_locks_mutex:
        if session_id in _session_locks:
            _session_locks.move_to_end(session_id)
            return _session_locks[session_id]
        lock = asyncio.Lock()
        _session_locks[session_id] = lock
        if len(_session_locks) > _SESSION_LOCK_LIMIT:
            _session_locks.popitem(last=False)  # evict LRU
        return lock


def _sse(payload: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _sse_done() -> str:
    return "data: [DONE]\n\n"


@router.post("/chat")
async def chat_endpoint(request: Request, body: ChatRequest, response: Response):
    """
    Accept a chat message and stream Claude's response via SSE.

    Flow:
    1. Resolve or create session (cookie)
    2. Resolve or create conversation for (session, unit)
    3. Acquire per-session lock (FR-5)
    4. [INSIDE lock] Fetch last 10 messages as history context
    5. [INSIDE lock] Persist user message
    6. [INSIDE lock] Stream from Claude
    7. [INSIDE lock] Persist assistant message on stream completion
    8. Emit done / error events

    History fetch and user-message persist are intentionally inside the lock
    so that two concurrent requests for the same session cannot race on the
    history snapshot, ensuring Claude always sees a consistent conversation.
    """
    session_svc = SessionService()
    session_repo = SessionRepository()
    conv_repo = ConversationRepository()
    msg_repo = MessageRepository()
    claude_svc = ClaudeService()

    # ------------------------------------------------------------------
    # 1. Session resolution
    # ------------------------------------------------------------------
    session_id_raw = request.cookies.get(SESSION_COOKIE)
    session = await session_svc.resolve_session(session_id_raw, session_repo)
    session_id: UUID = session["id"]

    # ------------------------------------------------------------------
    # 2. Conversation resolution
    # ------------------------------------------------------------------
    unit_id = body.unit_id or "A1-1"
    level = body.level or "A1"
    textbook_id = body.textbook_id or "dokdokdok-a1"

    conversation = await conv_repo.get_or_create(
        session_id=session_id,
        unit_id=unit_id,
        level=level,
        textbook_id=textbook_id,
        force_new=body.force_new_conversation,
    )
    conversation_id: UUID = conversation["id"]

    # ------------------------------------------------------------------
    # 3–8. Stream generator (holds per-session lock for FR-5)
    # History fetch and user-message persist are INSIDE the lock.
    # ------------------------------------------------------------------
    session_lock = await _get_session_lock(str(session_id))

    async def event_generator():
        full_response = ""
        was_truncated = False
        assistant_msg_id = None

        async with session_lock:
            # 4. Fetch history INSIDE lock — prevents race with concurrent tab
            history = await msg_repo.get_recent(
                conversation_id=conversation_id,
                limit=10,
            )
            # 5. Persist user message INSIDE lock — atomic with history read
            await msg_repo.create(
                conversation_id=conversation_id,
                role="user",
                content=body.message,
            )
            # 6. Stream from Claude
            try:
                async for event in claude_svc.stream(
                    user_message=body.message,
                    history=history,
                    unit_id=unit_id,
                    level=level,
                    textbook_id=textbook_id,
                ):
                    if event["type"] == "token":
                        full_response += event["content"]
                        yield _sse(event)
                    elif event["type"] == "truncated":
                        was_truncated = True
                        yield _sse(event)
                    elif event["type"] == "error":
                        yield _sse(event)
                        yield _sse_done()
                        return

                # Persist assistant message only when stream completes fully
                if full_response:
                    saved = await msg_repo.create(
                        conversation_id=conversation_id,
                        role="assistant",
                        content=full_response,
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
                yield _sse(
                    {
                        "type": "error",
                        "message": "서버에서 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
                    }
                )
            finally:
                yield _sse_done()

    streaming_response = StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )

    # Set session cookie on the streaming response
    streaming_response.set_cookie(
        key=SESSION_COOKIE,
        value=str(session_id),
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        max_age=60 * 60 * 24 * 30,  # 30 days
    )
    return streaming_response