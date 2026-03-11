"""
Messages router.

Endpoints:
  PATCH  /api/messages/{id}/feedback   Set or clear feedback on a message
  DELETE /api/messages/{id}/truncate   Delete message and all subsequent messages
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.db.repositories import MessageRepository
from app.deps.auth import get_current_user
from app.models.schemas import FeedbackUpdate

logger = logging.getLogger(__name__)
router = APIRouter()


@router.patch("/messages/{message_id}/feedback")
async def update_feedback(
    message_id: UUID,
    body: FeedbackUpdate,
    user_id: UUID = Depends(get_current_user),
):
    """Set or clear thumbs up/down feedback on an assistant message."""
    repo = MessageRepository()
    found = await repo.update_feedback(user_id, message_id, body.feedback)
    if not found:
        raise HTTPException(status_code=404, detail="Message not found")
    return {"ok": True}


@router.delete("/messages/{message_id}/truncate")
async def truncate_from_message(
    message_id: UUID,
    user_id: UUID = Depends(get_current_user),
):
    """Delete the given message and all subsequent messages in the same conversation.

    Used by Retry/Edit to clean up DB history before re-sending.
    Ownership is verified via the parent conversation's user_id.
    """
    repo = MessageRepository()
    deleted = await repo.delete_from(user_id, message_id)
    if deleted == 0:
        raise HTTPException(status_code=404, detail="Message not found")
    return {"ok": True, "deleted": deleted}
