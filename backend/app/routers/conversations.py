"""
Conversations router.

GET /api/conversations                     — List conversations for current session
GET /api/conversations/{id}/messages       — Get messages in a conversation
"""

import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, Response

from app.core.config import settings
from app.core.constants import SESSION_COOKIE
from app.db.repositories import ConversationRepository, MessageRepository, SessionRepository
from app.services.session_service import SessionService

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/conversations")
async def list_conversations(request: Request, response: Response):
    """
    List all conversations for the current session.

    If no valid session cookie is present, a new session is created and the
    cookie is set on the response (consistent with how /api/chat behaves).
    """
    session_svc = SessionService()
    session_repo = SessionRepository()
    conv_repo = ConversationRepository()

    session_id_raw = request.cookies.get(SESSION_COOKIE)

    # Resolve (or create) session — never return 401 for a GET on conversations
    try:
        session = await session_svc.resolve_session(session_id_raw, session_repo)
    except Exception:
        logger.exception("Failed to resolve session for list_conversations.")
        return {"conversations": []}

    session_id = session["id"]
    is_new_session = session_id_raw is None or str(session_id) != session_id_raw

    conversations = await conv_repo.list_by_session(session_id=session_id)

    # Set cookie if a new session was created (parallel to /api/chat behaviour)
    if is_new_session:
        response.set_cookie(
            key=SESSION_COOKIE,
            value=str(session_id),
            httponly=True,
            samesite="lax",
            secure=settings.cookie_secure,
            max_age=60 * 60 * 24 * 30,  # 30 days
        )

    return {"conversations": conversations}


@router.get("/conversations/{conversation_id}/messages")
async def get_messages(conversation_id: UUID, request: Request):
    """
    Return all messages for a conversation.

    Validates that the conversation belongs to the current session.
    Requires a valid session cookie — returns 401 if missing or invalid.
    """
    session_svc = SessionService()
    session_repo = SessionRepository()
    conv_repo = ConversationRepository()
    msg_repo = MessageRepository()

    session_id_raw = request.cookies.get(SESSION_COOKIE)
    if not session_id_raw:
        raise HTTPException(status_code=401, detail="No session found.")

    try:
        session = await session_svc.resolve_session(session_id_raw, session_repo)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid session.")

    conversation = await conv_repo.get_by_id(conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    if conversation["session_id"] != session["id"]:
        raise HTTPException(status_code=403, detail="Access denied.")

    messages = await msg_repo.get_all(conversation_id=conversation_id)
    return {
        "conversation_id": str(conversation_id),
        "messages": messages,
    }