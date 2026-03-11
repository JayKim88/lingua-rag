"""
Notes router.

Endpoints:
  GET    /api/notes?pdf_id=...   List notes for a PDF
  POST   /api/notes              Create a note
  DELETE /api/notes/{id}         Delete a note
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.db.repositories import NoteRepository
from app.deps.auth import get_current_user
from app.models.schemas import NoteCreate, NoteListResponse, NoteOut

logger = logging.getLogger(__name__)
router = APIRouter()
note_repo = NoteRepository()


def _to_out(n: dict) -> NoteOut:
    saved_at = n["saved_at"]
    return NoteOut(
        id=n["id"],
        pdf_id=n["pdf_id"],
        pdf_name=n["pdf_name"],
        content=n["content"],
        saved_at=saved_at.isoformat() if hasattr(saved_at, "isoformat") else str(saved_at),
    )


@router.get("/notes", response_model=NoteListResponse)
async def list_notes(
    pdf_id: str = Query(..., max_length=255),
    user_id: UUID = Depends(get_current_user),
):
    """List all notes for the authenticated user for a given PDF."""
    rows = await note_repo.list_by_user_pdf(user_id, pdf_id)
    return {"notes": [_to_out(r) for r in rows]}


@router.post("/notes", response_model=NoteOut, status_code=201)
async def create_note(
    body: NoteCreate,
    user_id: UUID = Depends(get_current_user),
):
    """Save a new note."""
    row = await note_repo.create(user_id, body)
    return _to_out(row)


@router.delete("/notes/{note_id}", status_code=200)
async def delete_note(
    note_id: UUID,
    user_id: UUID = Depends(get_current_user),
):
    """Delete a note owned by the authenticated user."""
    deleted = await note_repo.delete(user_id, note_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Note not found")
    return {"ok": True}
