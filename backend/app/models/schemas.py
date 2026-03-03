"""
Pydantic request/response schemas.

All external-facing models are defined here for type safety
and automatic OpenAPI documentation.
"""

from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    """Request body for POST /api/chat."""

    message: str = Field(..., min_length=1, max_length=2000, description="User's question")
    unit_id: Optional[str] = Field(
        default="A1-1",
        description="Current unit ID (e.g. 'A1-3'). Defaults to A1-1.",
    )
    level: Optional[Literal["A1", "A2"]] = Field(
        default="A1",
        description="CEFR level of the learner.",
    )
    textbook_id: Optional[str] = Field(
        default="dokdokdok-a1",
        description="Textbook identifier.",
    )
    force_new_conversation: Optional[bool] = Field(
        default=False,
        description="If True, always starts a new conversation thread.",
    )
    page_image: Optional[str] = Field(
        default=None,
        description="Base64-encoded JPEG of the current PDF page for visual context.",
    )

    model_config = {"json_schema_extra": {"example": {
        "message": "sein 동사의 현재형 변화를 알려주세요",
        "unit_id": "A1-2",
        "level": "A1",
        "textbook_id": "dokdokdok-a1",
        "force_new_conversation": False,
    }}}


class MessageOut(BaseModel):
    """A single message record."""

    id: UUID
    conversation_id: UUID
    role: Literal["user", "assistant"]
    content: str
    token_count: Optional[int] = None
    created_at: str


class ConversationOut(BaseModel):
    """A conversation record."""

    id: UUID
    session_id: UUID
    unit_id: str
    textbook_id: str
    level: str
    created_at: str
    updated_at: str


class ConversationListResponse(BaseModel):
    """Response for GET /api/conversations."""

    conversations: list[ConversationOut]


class MessagesResponse(BaseModel):
    """Response for GET /api/conversations/{id}/messages."""

    conversation_id: UUID
    messages: list[MessageOut]


class SummaryCreate(BaseModel):
    """Request body for POST /api/summaries."""

    unit_id: str = Field(..., max_length=50)
    unit_title: str = Field(..., max_length=255)
    content: str = Field(..., min_length=1)


class SummaryOut(BaseModel):
    """A single summary record."""

    id: UUID
    unit_id: str
    unit_title: str
    content: str
    saved_at: str


class SummaryListResponse(BaseModel):
    """Response for GET /api/summaries."""

    summaries: list[SummaryOut]


class NoteCreate(BaseModel):
    """Request body for POST /api/notes."""

    unit_id: str = Field(..., max_length=50)
    unit_title: str = Field(..., max_length=255)
    content: str = Field(..., min_length=1)


class NoteOut(BaseModel):
    """A single note record."""

    id: UUID
    unit_id: str
    unit_title: str
    content: str
    saved_at: str


class NoteListResponse(BaseModel):
    """Response for GET /api/notes."""

    notes: list[NoteOut]