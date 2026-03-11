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
    pdf_id: Optional[str] = Field(
        default=None,
        description="Server-side PDF file ID. Used to scope conversation and RAG search.",
    )
    force_new_conversation: Optional[bool] = Field(
        default=False,
        description="If True, always starts a new conversation thread.",
    )
    page_image: Optional[str] = Field(
        default=None,
        description="Base64-encoded JPEG of the current PDF page for visual context.",
    )
    page_text: Optional[str] = Field(
        default=None,
        description="Extracted text from the current PDF page for context.",
    )

    model_config = {"json_schema_extra": {"example": {
        "message": "이 페이지의 문법을 설명해주세요",
        "pdf_id": "abc-123",
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
    pdf_id: Optional[str] = None
    pdf_name: Optional[str] = None
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

    pdf_id: str = Field(..., max_length=255)
    pdf_name: str = Field(..., max_length=255)
    content: str = Field(..., min_length=1)


class SummaryOut(BaseModel):
    """A single summary record."""

    id: UUID
    pdf_id: str
    pdf_name: str
    content: str
    saved_at: str


class SummaryListResponse(BaseModel):
    """Response for GET /api/summaries."""

    summaries: list[SummaryOut]


class NoteCreate(BaseModel):
    """Request body for POST /api/notes."""

    pdf_id: str = Field(..., max_length=255)
    pdf_name: str = Field(..., max_length=255)
    content: str = Field(..., min_length=1)


class NoteOut(BaseModel):
    """A single note record."""

    id: UUID
    pdf_id: str
    pdf_name: str
    content: str
    saved_at: str


class NoteListResponse(BaseModel):
    """Response for GET /api/notes."""

    notes: list[NoteOut]


class FeedbackUpdate(BaseModel):
    """Request body for PATCH /api/messages/{id}/feedback."""

    feedback: Optional[Literal["up", "down"]] = None  # None removes feedback