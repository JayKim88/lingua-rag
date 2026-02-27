"""
Conversations router.

GET /api/conversations                     — List conversations for current user
GET /api/conversations/{id}/messages       — Get messages in a conversation
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.db.repositories import ConversationRepository, MessageRepository
from app.deps.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/conversations")
async def list_conversations(user_id: UUID = Depends(get_current_user)):
    """List all conversations for the authenticated user."""
    conv_repo = ConversationRepository()
    conversations = await conv_repo.list_by_user(user_id=user_id)
    return {"conversations": conversations}


@router.get("/conversations/{conversation_id}/messages")
async def get_messages(
    conversation_id: UUID,
    user_id: UUID = Depends(get_current_user),
):
    """
    Return all messages for a conversation.

    Validates that the conversation belongs to the authenticated user.
    """
    conv_repo = ConversationRepository()
    msg_repo = MessageRepository()

    conversation = await conv_repo.get_by_id(conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    if conversation["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Access denied.")

    messages = await msg_repo.get_all(conversation_id=conversation_id)
    return {
        "conversation_id": str(conversation_id),
        "messages": messages,
    }
