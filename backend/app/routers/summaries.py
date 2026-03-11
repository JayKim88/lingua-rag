"""
Summaries router.

Endpoints:
  GET    /api/summaries?pdf_id=...   List summaries for a PDF
  POST   /api/summaries              Create a summary
  DELETE /api/summaries/{id}         Delete a summary
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.db.repositories import SummaryRepository
from app.deps.auth import get_current_user
from app.models.schemas import SummaryCreate, SummaryListResponse, SummaryOut

logger = logging.getLogger(__name__)
router = APIRouter()
summary_repo = SummaryRepository()


def _to_out(s: dict) -> SummaryOut:
    saved_at = s["saved_at"]
    return SummaryOut(
        id=s["id"],
        pdf_id=s["pdf_id"],
        pdf_name=s["pdf_name"],
        content=s["content"],
        saved_at=saved_at.isoformat() if hasattr(saved_at, "isoformat") else str(saved_at),
    )


@router.get("/summaries", response_model=SummaryListResponse)
async def list_summaries(
    pdf_id: str = Query(..., max_length=255),
    user_id: UUID = Depends(get_current_user),
):
    """List all summaries for the authenticated user for a given PDF."""
    rows = await summary_repo.list_by_user_pdf(user_id, pdf_id)
    return {"summaries": [_to_out(r) for r in rows]}


@router.post("/summaries", response_model=SummaryOut, status_code=201)
async def create_summary(
    body: SummaryCreate,
    user_id: UUID = Depends(get_current_user),
):
    """Save a new summary."""
    row = await summary_repo.create(user_id, body)
    return _to_out(row)


@router.delete("/summaries/{summary_id}", status_code=200)
async def delete_summary(
    summary_id: UUID,
    user_id: UUID = Depends(get_current_user),
):
    """Delete a summary owned by the authenticated user."""
    deleted = await summary_repo.delete(user_id, summary_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Summary not found")
    return {"ok": True}
