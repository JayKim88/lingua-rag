"""
Messages router.

Endpoints:
  PATCH  /api/messages/{id}/feedback   Set or clear feedback on a message
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
