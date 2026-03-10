"""PDF storage and serving endpoints.

Uploaded PDFs are stored on the server filesystem under
  uploads/pdfs/{user_id}/{pdf_id}.pdf
with a JSON sidecar  uploads/pdfs/{user_id}/{pdf_id}.json  for metadata.

All write/delete operations require a valid JWT.
File serve and page-image endpoints also require auth (called via Next.js proxy).
"""

import base64
import json
import logging
import time
import uuid as uuid_mod
from pathlib import Path
from typing import Annotated
from uuid import UUID

import fitz  # PyMuPDF
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.db.repositories import AnnotationRepository
from app.deps.auth import get_current_user

ann_repo = AnnotationRepository()


class AnnotationCreate(BaseModel):
    page_num: int
    x_pct: float
    y_pct: float
    text: str
    color: str = "yellow"


class AnnotationUpdate(BaseModel):
    text: str
    color: str

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pdfs")

UPLOAD_DIR = Path("uploads/pdfs")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _user_dir(user_id: str) -> Path:
    d = UPLOAD_DIR / user_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def _pdf_path(user_id: str, pdf_id: str) -> Path:
    return _user_dir(user_id) / f"{pdf_id}.pdf"


def _meta_path(user_id: str, pdf_id: str) -> Path:
    return _user_dir(user_id) / f"{pdf_id}.json"


def _read_meta(user_id: str, pdf_id: str) -> dict | None:
    p = _meta_path(user_id, pdf_id)
    if not p.exists():
        return None
    return json.loads(p.read_text())


def _assert_owns(user_id: str, pdf_id: str) -> Path:
    """Return pdf path if it exists and is owned by user, else raise 404."""
    path = _pdf_path(user_id, pdf_id)
    if not path.exists():
        raise HTTPException(404, "PDF not found")
    return path


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/upload")
async def upload_pdf(
    file: UploadFile,
    user: Annotated[UUID, Depends(get_current_user)],
):
    content_type = file.content_type or ""
    if "pdf" not in content_type and not (file.filename or "").endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are accepted")

    pdf_id = str(uuid_mod.uuid4())
    user_id = str(user)

    content = await file.read()

    pdf_path = _pdf_path(user_id, pdf_id)
    pdf_path.write_bytes(content)

    # Get page count with PyMuPDF
    total_pages = 0
    try:
        doc = fitz.open(stream=content, filetype="pdf")
        total_pages = len(doc)
        doc.close()
    except Exception:
        logger.warning("Could not read page count for %s", pdf_id)

    meta = {
        "id": pdf_id,
        "name": file.filename or "document.pdf",
        "size": len(content),
        "total_pages": total_pages,
        "created_at": time.time(),
    }
    _meta_path(user_id, pdf_id).write_text(json.dumps(meta))

    return meta


@router.get("")
async def list_pdfs(user: Annotated[UUID, Depends(get_current_user)]):
    user_dir = _user_dir(str(user))
    metas = []
    for p in user_dir.glob("*.json"):
        try:
            metas.append(json.loads(p.read_text()))
        except Exception:
            pass
    return sorted(metas, key=lambda m: m.get("created_at", 0), reverse=True)


@router.get("/{pdf_id}/file")
async def serve_pdf(
    pdf_id: str,
    user: Annotated[UUID, Depends(get_current_user)],
):
    path = _assert_owns(str(user), pdf_id)
    return FileResponse(
        path,
        media_type="application/pdf",
        headers={
            "Content-Disposition": "inline",
            "Cache-Control": "private, max-age=3600",
        },
    )


@router.get("/{pdf_id}/page/{page_num}/image")
async def get_page_image(
    pdf_id: str,
    page_num: int,
    user: Annotated[UUID, Depends(get_current_user)],
):
    path = _assert_owns(str(user), pdf_id)

    try:
        doc = fitz.open(str(path))
        if page_num < 1 or page_num > len(doc):
            raise HTTPException(400, f"Page {page_num} out of range (1–{len(doc)})")
        page = doc[page_num - 1]
        mat = fitz.Matrix(1.5, 1.5)
        pix = page.get_pixmap(matrix=mat)
        img_bytes = pix.tobytes("jpeg")
        doc.close()
        return {"base64": base64.b64encode(img_bytes).decode()}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error rendering page %d of %s", page_num, pdf_id)
        raise HTTPException(500, "Failed to render page image")


@router.get("/{pdf_id}/page/{page_num}/text")
async def get_page_text(
    pdf_id: str,
    page_num: int,
    user: Annotated[UUID, Depends(get_current_user)],
):
    path = _assert_owns(str(user), pdf_id)

    try:
        doc = fitz.open(str(path))
        if page_num < 1 or page_num > len(doc):
            raise HTTPException(400, f"Page {page_num} out of range (1–{len(doc)})")
        page = doc[page_num - 1]
        text = page.get_text()
        doc.close()
        return {"text": text, "page_num": page_num}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error extracting text from page %d of %s", page_num, pdf_id)
        raise HTTPException(500, "Failed to extract page text")


@router.delete("/{pdf_id}")
async def delete_pdf(
    pdf_id: str,
    user: Annotated[UUID, Depends(get_current_user)],
):
    user_id = str(user)
    # Verify ownership
    _assert_owns(user_id, pdf_id)
    for ext in (".pdf", ".json"):
        p = _user_dir(user_id) / f"{pdf_id}{ext}"
        if p.exists():
            p.unlink()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Annotation endpoints
# SQL migration (run once in Supabase SQL editor):
#   CREATE TABLE IF NOT EXISTS pdf_annotations (
#     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
#     user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
#     pdf_id TEXT NOT NULL,
#     page_num INTEGER NOT NULL,
#     x_pct REAL NOT NULL,
#     y_pct REAL NOT NULL,
#     text TEXT NOT NULL,
#     color TEXT NOT NULL DEFAULT 'yellow',
#     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
#   );
#   CREATE INDEX IF NOT EXISTS idx_pdf_annotations_user_pdf_page
#     ON pdf_annotations(user_id, pdf_id, page_num);
# ---------------------------------------------------------------------------

@router.get("/{pdf_id}/annotations")
async def list_annotations(
    pdf_id: str,
    page_num: int = Query(...),
    user: Annotated[UUID, Depends(get_current_user)] = None,
):
    return await ann_repo.list_by_page(user, pdf_id, page_num)


@router.post("/{pdf_id}/annotations")
async def create_annotation(
    pdf_id: str,
    body: AnnotationCreate,
    user: Annotated[UUID, Depends(get_current_user)],
):
    return await ann_repo.create(
        user, pdf_id, body.page_num, body.x_pct, body.y_pct, body.text, body.color
    )


@router.patch("/{pdf_id}/annotations/{ann_id}")
async def update_annotation(
    pdf_id: str,
    ann_id: UUID,
    body: AnnotationUpdate,
    user: Annotated[UUID, Depends(get_current_user)],
):
    result = await ann_repo.update(user, ann_id, body.text, body.color)
    if not result:
        raise HTTPException(404, "Annotation not found")
    return result


@router.delete("/{pdf_id}/annotations/{ann_id}")
async def delete_annotation(
    pdf_id: str,
    ann_id: UUID,
    user: Annotated[UUID, Depends(get_current_user)],
):
    deleted = await ann_repo.delete(user, ann_id)
    if not deleted:
        raise HTTPException(404, "Annotation not found")
    return {"ok": True}
