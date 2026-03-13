"""PDF storage and serving endpoints.

Uploaded PDFs are stored in Supabase Storage:
  bucket: pdfs
  path:   {user_id}/{pdf_id}.pdf

Metadata is persisted in the pdf_files table (PostgreSQL via asyncpg).
All write/delete operations require a valid JWT.
"""

import base64
import logging
import uuid as uuid_mod
from typing import Annotated
from uuid import UUID

import fitz  # PyMuPDF
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, UploadFile
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from app.core.storage import object_path, storage_delete, storage_download, storage_signed_url, storage_upload
from app.db.repositories import AnnotationRepository, PdfFileRepository, VocabularyRepository
from app.deps.auth import get_current_user
from app.services.indexing_service import index_pdf

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pdfs")

ann_repo = AnnotationRepository()
pdf_repo = PdfFileRepository()
vocab_repo = VocabularyRepository()


class AnnotationCreate(BaseModel):
    page_num: int
    x_pct: float = 0.0
    y_pct: float = 0.0
    text: str
    color: str = "yellow"
    type: str = "sticky"  # 'sticky' | 'highlight'
    highlighted_text: str | None = None


class AnnotationUpdate(BaseModel):
    text: str | None = None
    color: str | None = None
    x_pct: float | None = None
    y_pct: float | None = None


class LanguageUpdate(BaseModel):
    language: str | None = None


class LastPageUpdate(BaseModel):
    last_page: int


# ---------------------------------------------------------------------------
# PDF endpoints
# ---------------------------------------------------------------------------


@router.post("/upload")
async def upload_pdf(
    file: UploadFile,
    background_tasks: BackgroundTasks,
    user: Annotated[UUID, Depends(get_current_user)],
):
    content_type = file.content_type or ""
    if "pdf" not in content_type and not (file.filename or "").endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are accepted")

    pdf_id = str(uuid_mod.uuid4())
    user_id = str(user)
    content = await file.read()

    # Get page count
    total_pages = 0
    try:
        doc = fitz.open(stream=content, filetype="pdf")
        total_pages = len(doc)
        doc.close()
    except Exception:
        logger.warning("Could not read page count for %s", pdf_id)

    # Upload to Supabase Storage
    path = object_path(user_id, pdf_id)
    try:
        await storage_upload(path, content)
    except Exception:
        logger.exception("Storage upload failed for %s", pdf_id)
        raise HTTPException(500, "Failed to store PDF")

    # Save metadata to DB
    meta = await pdf_repo.create(user, pdf_id, file.filename or "document.pdf", len(content), total_pages)

    # Auto-trigger RAG indexing in background
    background_tasks.add_task(index_pdf, user, pdf_id)

    return {
        "id": meta["id"],
        "name": meta["name"],
        "size": meta["size"],
        "total_pages": meta["total_pages"],
        "language": meta.get("language"),
        "index_status": meta.get("index_status", "pending"),
        "created_at": (
            meta["created_at"].timestamp() if hasattr(meta["created_at"], "timestamp") else meta["created_at"]
        ),
    }


@router.get("")
async def list_pdfs(user: Annotated[UUID, Depends(get_current_user)]):
    metas = await pdf_repo.list_by_user(user)
    return [
        {
            "id": m["id"],
            "name": m["name"],
            "size": m["size"],
            "total_pages": m["total_pages"],
            "language": m.get("language"),
            "index_status": m.get("index_status", "pending"),
            "created_at": m["created_at"].timestamp() if hasattr(m["created_at"], "timestamp") else m["created_at"],
        }
        for m in metas
    ]


@router.post("/{pdf_id}/index")
async def trigger_index(
    pdf_id: str,
    background_tasks: BackgroundTasks,
    user: Annotated[UUID, Depends(get_current_user)],
):
    """Manually trigger or re-trigger RAG indexing for a PDF."""
    meta = await pdf_repo.get(user, pdf_id)
    if not meta:
        raise HTTPException(404, "PDF not found")

    background_tasks.add_task(index_pdf, user, pdf_id)
    return {"index_status": "indexing"}


@router.get("/{pdf_id}/language")
async def get_pdf_language(
    pdf_id: str,
    user: Annotated[UUID, Depends(get_current_user)],
):
    meta = await pdf_repo.get(user, pdf_id)
    if not meta:
        raise HTTPException(404, "PDF not found")
    return {"language": meta.get("language")}


@router.patch("/{pdf_id}/language")
async def update_pdf_language(
    pdf_id: str,
    body: LanguageUpdate,
    user: Annotated[UUID, Depends(get_current_user)],
):
    meta = await pdf_repo.get(user, pdf_id)
    if not meta:
        raise HTTPException(404, "PDF not found")
    await pdf_repo.update_language(user, pdf_id, body.language)
    return {"language": body.language}


@router.get("/{pdf_id}/last-page")
async def get_last_page(
    pdf_id: str,
    user: Annotated[UUID, Depends(get_current_user)],
):
    meta = await pdf_repo.get(user, pdf_id)
    if not meta:
        raise HTTPException(404, "PDF not found")
    return {"last_page": meta.get("last_page", 1) or 1}


@router.patch("/{pdf_id}/last-page")
async def update_last_page(
    pdf_id: str,
    body: LastPageUpdate,
    user: Annotated[UUID, Depends(get_current_user)],
):
    meta = await pdf_repo.get(user, pdf_id)
    if not meta:
        raise HTTPException(404, "PDF not found")
    await pdf_repo.update_last_page(user, pdf_id, max(1, body.last_page))
    return {"last_page": body.last_page}


@router.get("/{pdf_id}/file")
async def serve_pdf(
    pdf_id: str,
    user: Annotated[UUID, Depends(get_current_user)],
):
    meta = await pdf_repo.get(user, pdf_id)
    if not meta:
        raise HTTPException(404, "PDF not found")

    path = object_path(str(user), pdf_id)
    try:
        signed_url = await storage_signed_url(path)
    except Exception:
        logger.exception("Failed to create signed URL for %s", pdf_id)
        raise HTTPException(500, "Failed to serve PDF")

    return RedirectResponse(url=signed_url, status_code=302)


@router.get("/{pdf_id}/page/{page_num}/image")
async def get_page_image(
    pdf_id: str,
    page_num: int,
    user: Annotated[UUID, Depends(get_current_user)],
):
    meta = await pdf_repo.get(user, pdf_id)
    if not meta:
        raise HTTPException(404, "PDF not found")

    path = object_path(str(user), pdf_id)
    try:
        content = await storage_download(path)
    except Exception:
        raise HTTPException(500, "Failed to fetch PDF from storage")

    try:
        doc = fitz.open(stream=content, filetype="pdf")
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
    meta = await pdf_repo.get(user, pdf_id)
    if not meta:
        raise HTTPException(404, "PDF not found")

    path = object_path(str(user), pdf_id)
    try:
        content = await storage_download(path)
    except Exception:
        raise HTTPException(500, "Failed to fetch PDF from storage")

    try:
        doc = fitz.open(stream=content, filetype="pdf")
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
    meta = await pdf_repo.get(user, pdf_id)
    if not meta:
        raise HTTPException(404, "PDF not found")

    path = object_path(str(user), pdf_id)
    await storage_delete(path)
    await pdf_repo.delete(user, pdf_id)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Annotation endpoints
# ---------------------------------------------------------------------------


@router.get("/{pdf_id}/annotations")
async def list_annotations(
    pdf_id: str,
    user: Annotated[UUID, Depends(get_current_user)],
    page_num: int | None = Query(default=None),
):
    if page_num is not None:
        return await ann_repo.list_by_page(user, pdf_id, page_num)
    return await ann_repo.list_all(user, pdf_id)


@router.post("/{pdf_id}/annotations")
async def create_annotation(
    pdf_id: str,
    body: AnnotationCreate,
    user: Annotated[UUID, Depends(get_current_user)],
):
    return await ann_repo.create(
        user,
        pdf_id,
        body.page_num,
        body.x_pct,
        body.y_pct,
        body.text,
        body.color,
        ann_type=body.type,
        highlighted_text=body.highlighted_text,
    )


@router.patch("/{pdf_id}/annotations/{ann_id}")
async def update_annotation(
    pdf_id: str,
    ann_id: UUID,
    body: AnnotationUpdate,
    user: Annotated[UUID, Depends(get_current_user)],
):
    result = await ann_repo.update(
        user,
        ann_id,
        text=body.text,
        color=body.color,
        x_pct=body.x_pct,
        y_pct=body.y_pct,
    )
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


# ── Vocabulary endpoints ──────────────────────────────────────────────────────

class VocabCreate(BaseModel):
    page_num: int
    word: str
    context: str | None = None
    meaning: str | None = None
    language: str | None = None

class VocabUpdate(BaseModel):
    word: str | None = None
    meaning: str | None = None


@router.get("/{pdf_id}/vocabulary")
async def list_vocabulary(
    pdf_id: str,
    user: Annotated[UUID, Depends(get_current_user)],
    page_num: int | None = None,
):
    if page_num is not None:
        return await vocab_repo.list_by_page(user, pdf_id, page_num)
    return await vocab_repo.list_all(user, pdf_id)


@router.post("/{pdf_id}/vocabulary", status_code=201)
async def create_vocabulary(
    pdf_id: str,
    body: VocabCreate,
    user: Annotated[UUID, Depends(get_current_user)],
):
    return await vocab_repo.create(user, pdf_id, body.page_num, body.word, body.context, body.meaning, body.language)


@router.patch("/{pdf_id}/vocabulary/{vocab_id}")
async def update_vocabulary(
    pdf_id: str,
    vocab_id: UUID,
    body: VocabUpdate,
    user: Annotated[UUID, Depends(get_current_user)],
):
    result = await vocab_repo.update(user, vocab_id, word=body.word, meaning=body.meaning)
    if not result:
        raise HTTPException(404, "Vocabulary entry not found")
    return result


@router.delete("/{pdf_id}/vocabulary/{vocab_id}")
async def delete_vocabulary(
    pdf_id: str,
    vocab_id: UUID,
    user: Annotated[UUID, Depends(get_current_user)],
):
    deleted = await vocab_repo.delete(user, vocab_id)
    if not deleted:
        raise HTTPException(404, "Vocabulary entry not found")
    return {"ok": True}
