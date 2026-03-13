"""Guest (unauthenticated) endpoints for freemium PDF upload and chat.

POST /api/guest/pdfs/upload  — Upload a PDF (< 100 pages) without auth.
POST /api/guest/chat         — Chat with a guest PDF via SSE streaming.

Guest PDFs use a sentinel user_id and are stored under guest/{pdf_id}.pdf.
Chat responses are streamed but NOT persisted to the database.
"""

import asyncio
import collections
import json
import logging
import time
import uuid as uuid_mod
from uuid import UUID

import fitz  # PyMuPDF
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.core.storage import object_path, storage_upload
from app.db.repositories import PdfFileRepository, VectorSearchRepository
from app.services.claude_service import ClaudeService
from app.services.embedding_service import get_embedding_service
from app.services.indexing_service import index_pdf

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/guest")

# Sentinel UUID for all guest uploads (matches migration 003)
GUEST_USER_ID = UUID("00000000-0000-0000-0000-000000000000")

GUEST_MAX_PAGES = 100

pdf_repo = PdfFileRepository()

# ---------------------------------------------------------------------------
# Rate limiting: simple in-memory per-IP tracker
# ---------------------------------------------------------------------------
_UPLOAD_LIMIT = 3  # max uploads per window
_UPLOAD_WINDOW = 86400  # 24 hours
_upload_tracker: dict[str, list[float]] = {}


def _check_upload_rate(ip: str) -> None:
    """Raise 429 if IP has exceeded the daily upload limit."""
    now = time.time()
    timestamps = _upload_tracker.get(ip, [])
    # Prune entries outside the window
    timestamps = [t for t in timestamps if now - t < _UPLOAD_WINDOW]
    _upload_tracker[ip] = timestamps

    if len(timestamps) >= _UPLOAD_LIMIT:
        raise HTTPException(
            429,
            f"Upload limit reached ({_UPLOAD_LIMIT} per day). Please sign in to upload more PDFs.",
        )


def _record_upload(ip: str) -> None:
    """Record a successful upload for rate limiting."""
    _upload_tracker.setdefault(ip, []).append(time.time())


# Per-session streaming lock (prevent concurrent streams for same guest pdf)
_SESSION_LOCK_LIMIT = 500
_session_locks: collections.OrderedDict[str, asyncio.Lock] = collections.OrderedDict()
_session_locks_mutex = asyncio.Lock()


async def _get_session_lock(key: str) -> asyncio.Lock:
    async with _session_locks_mutex:
        if key in _session_locks:
            _session_locks.move_to_end(key)
            return _session_locks[key]
        lock = asyncio.Lock()
        _session_locks[key] = lock
        if len(_session_locks) > _SESSION_LOCK_LIMIT:
            _session_locks.popitem(last=False)
        return lock


# ---------------------------------------------------------------------------
# Guest PDF upload
# ---------------------------------------------------------------------------


@router.post("/pdfs/upload")
async def guest_upload_pdf(
    request: Request,
    file: UploadFile,
    background_tasks: BackgroundTasks,
):
    """Upload a PDF without authentication. Limited to < 100 pages, 10MB, 3/day per IP."""
    # Rate limit by IP
    forwarded = request.headers.get("x-forwarded-for")
    host = request.client.host if request.client else "unknown"
    client_ip = (forwarded or host).split(",")[0].strip()
    _check_upload_rate(client_ip)

    content_type = file.content_type or ""
    if "pdf" not in content_type and not (file.filename or "").endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are accepted")

    content = await file.read()

    # File size limit: 10MB
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(
            413,
            "File size exceeds 10MB limit. Please sign in to upload larger files.",
        )

    # Validate page count
    total_pages = 0
    try:
        doc = fitz.open(stream=content, filetype="pdf")
        total_pages = len(doc)
        doc.close()
    except Exception:
        raise HTTPException(400, "Could not read PDF file")

    if total_pages >= GUEST_MAX_PAGES:
        raise HTTPException(
            403,
            f"Guest uploads are limited to PDFs under {GUEST_MAX_PAGES} pages. "
            f"This PDF has {total_pages} pages. Please sign in to upload larger files.",
        )

    pdf_id = str(uuid_mod.uuid4())

    # Upload to Supabase Storage (use sentinel UUID to match indexing path)
    path = object_path(str(GUEST_USER_ID), pdf_id)
    try:
        await storage_upload(path, content)
    except Exception:
        logger.exception("Guest storage upload failed for %s", pdf_id)
        raise HTTPException(500, "Failed to store PDF")

    # Save metadata to DB (uses sentinel guest UUID)
    meta = await pdf_repo.create(GUEST_USER_ID, pdf_id, file.filename or "document.pdf", len(content), total_pages)

    # Record successful upload for rate limiting
    _record_upload(client_ip)

    # Auto-trigger RAG indexing in background
    background_tasks.add_task(index_pdf, GUEST_USER_ID, pdf_id)

    return {
        "id": meta["id"],
        "name": meta["name"],
        "size": meta["size"],
        "total_pages": meta["total_pages"],
        "index_status": meta.get("index_status", "pending"),
        "created_at": (
            meta["created_at"].timestamp() if hasattr(meta["created_at"], "timestamp") else meta["created_at"]
        ),
    }


# ---------------------------------------------------------------------------
# Guest chat (SSE streaming, no persistence)
# ---------------------------------------------------------------------------


class GuestChatRequest(BaseModel):
    """Request body for POST /api/guest/chat.

    When pdf_id is provided and the PDF is indexed, RAG search is used.
    Falls back to page_text-only context when RAG is unavailable.
    """

    message: str = Field(..., min_length=1, max_length=2000)
    pdf_id: str | None = None
    page_text: str | None = None
    page_number: int | None = None
    # Client-managed history for multi-turn context
    history: list[dict] | None = Field(
        default=None,
        description="Previous messages as [{role, content}, ...] for context. Max 10.",
    )


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _sse_done() -> str:
    return "data: [DONE]\n\n"


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


@router.post("/chat")
async def guest_chat_endpoint(body: GuestChatRequest):
    """Guest chat via SSE. No auth, no persistence.

    Uses RAG when pdf_id is provided and indexed; falls back to page_text.
    """
    claude_svc = ClaudeService()
    vector_repo = VectorSearchRepository()

    # Acquire per-session lock to prevent concurrent streams
    lock_key = body.pdf_id or "anonymous"
    session_lock = await _get_session_lock(lock_key)

    async def event_generator():
        async with session_lock:
            # Build history from client-provided messages (max 10)
            history: list[dict] = []
            if body.history:
                for msg in body.history[-10:]:
                    if msg.get("role") in ("user", "assistant") and msg.get("content"):
                        history.append(
                            {
                                "role": msg["role"],
                                "content": msg["content"],
                            }
                        )

            # RAG: search indexed chunks when pdf_id is provided
            rag_chunks: list[str] = []
            language = "English"

            if body.pdf_id:
                try:
                    # Resolve language from PDF metadata
                    pdf_meta = await pdf_repo.get(GUEST_USER_ID, body.pdf_id)
                    if pdf_meta and pdf_meta.get("language"):
                        language = _LANG_NAMES.get(pdf_meta["language"], pdf_meta["language"])

                    # Only attempt RAG if PDF is indexed
                    if pdf_meta and pdf_meta.get("index_status") == "ready":
                        embedding_svc = get_embedding_service()
                        query_vec = await embedding_svc.embed(body.message)
                        results = await vector_repo.search(
                            query_embedding=query_vec,
                            pdf_id=body.pdf_id,
                            query_text=body.message,
                            limit=3,
                            exclude_page=body.page_number if body.page_text else None,
                        )
                        rag_chunks.extend(r["content"] for r in results)
                        if rag_chunks:
                            logger.info("Guest RAG: %d chunks for pdf %s", len(results), body.pdf_id)
                except Exception as exc:
                    # Gracefully handle invalid pdf_id (non-UUID), DB errors, etc.
                    logger.warning("Guest RAG lookup failed (pdf_id=%s): %s", body.pdf_id, exc)

            # Stream from Claude (no persistence)
            try:
                async for event in claude_svc.stream(
                    user_message=body.message,
                    history=history,
                    language=language,
                    rag_chunks=rag_chunks or None,
                    page_text=body.page_text or None,
                ):
                    if event["type"] == "token":
                        yield _sse(event)
                    elif event["type"] == "usage":
                        logger.info(
                            "Guest token usage — out=%d in=%d",
                            event["output_tokens"],
                            event["input_tokens"],
                        )
                    elif event["type"] == "truncated":
                        yield _sse(event)
                    elif event["type"] == "error":
                        yield _sse(event)
                        yield _sse_done()
                        return

                yield _sse({"type": "done"})
            except Exception as exc:
                logger.exception("Guest chat error: %s", exc)
                yield _sse(
                    {
                        "type": "error",
                        "message": "서버에서 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
                    }
                )
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


# ---------------------------------------------------------------------------
# Guest PDF index status check
# ---------------------------------------------------------------------------


@router.get("/pdfs/{pdf_id}/status")
async def guest_pdf_status(pdf_id: str):
    """Check indexing status of a guest PDF."""
    meta = await pdf_repo.get(GUEST_USER_ID, pdf_id)
    if not meta:
        raise HTTPException(404, "PDF not found")
    return {
        "id": meta["id"],
        "name": meta["name"],
        "total_pages": meta["total_pages"],
        "index_status": meta.get("index_status", "pending"),
    }
