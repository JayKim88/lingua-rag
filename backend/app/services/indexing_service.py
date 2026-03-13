"""
PDF indexing service for RAG.

Extracts text from PDF pages, chunks by page, embeds via OpenAI,
and stores in document_chunks table.

Designed to run as a FastAPI BackgroundTask.
"""

import logging
from uuid import UUID

import fitz  # PyMuPDF

from app.core.storage import object_path, storage_download
from app.db.connection import get_pool
from app.services.embedding_service import get_embedding_service
from app.services.language_detect import detect_language

logger = logging.getLogger(__name__)

# OpenAI embedding API limit: 8191 tokens per input.
# ~3000 chars is a safe ceiling for one chunk.
MAX_CHUNK_CHARS = 3000


def _extract_pages(pdf_bytes: bytes) -> list[tuple[int, str]]:
    """Extract text from each page of a PDF.

    Returns list of (page_number, text) tuples (1-indexed).
    Skips pages with no extractable text.
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages: list[tuple[int, str]] = []
    for i in range(len(doc)):
        text = doc[i].get_text().strip()
        if text:
            pages.append((i + 1, text))
    doc.close()
    return pages


def _chunk_page(page_number: int, text: str) -> list[dict]:
    """Split a single page's text into chunks.

    Strategy:
    - If text <= MAX_CHUNK_CHARS: 1 chunk = 1 page (simple, preserves context)
    - If text > MAX_CHUNK_CHARS: split by paragraphs, merge until limit
    """
    if len(text) <= MAX_CHUNK_CHARS:
        return [{"page_number": page_number, "content": text}]

    paragraphs = text.split("\n\n")
    chunks: list[dict] = []
    current = ""

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        if current and len(current) + len(para) + 2 > MAX_CHUNK_CHARS:
            chunks.append({"page_number": page_number, "content": current})
            current = para
        else:
            current = f"{current}\n\n{para}" if current else para

    if current:
        chunks.append({"page_number": page_number, "content": current})

    return chunks


async def index_pdf(user_id: UUID, pdf_id: str) -> None:
    """Full indexing pipeline: download → extract → chunk → embed → store.

    Updates pdf_files.index_status throughout the process.
    """
    pool = get_pool()

    async def _set_status(status: str) -> None:
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE pdf_files SET index_status = $1 WHERE id = $2 AND user_id = $3",
                status,
                pdf_id,
                user_id,
            )

    await _set_status("indexing")

    try:
        # 1. Download PDF from Supabase Storage
        path = object_path(str(user_id), pdf_id)
        pdf_bytes = await storage_download(path)
        logger.info("Indexing %s: downloaded %d bytes", pdf_id, len(pdf_bytes))

        # 2. Extract text by page
        pages = _extract_pages(pdf_bytes)
        if not pages:
            logger.warning("Indexing %s: no extractable text", pdf_id)
            await _set_status("ready")  # empty but not failed
            return

        # 2b. Auto-detect language (only if not already set by user)
        async with pool.acquire() as conn:
            current_lang = await conn.fetchval(
                "SELECT language FROM pdf_files WHERE id = $1 AND user_id = $2",
                pdf_id,
                user_id,
            )
        if not current_lang:
            sample_text = " ".join(text for _, text in pages[:5])
            detected = detect_language(sample_text)
            if detected:
                async with pool.acquire() as conn:
                    await conn.execute(
                        "UPDATE pdf_files SET language = $1 WHERE id = $2 AND user_id = $3",
                        detected,
                        pdf_id,
                        user_id,
                    )
                logger.info("Indexing %s: auto-detected language %s", pdf_id, detected)

        # 3. Chunk pages
        all_chunks: list[dict] = []
        for page_num, text in pages:
            all_chunks.extend(_chunk_page(page_num, text))

        logger.info("Indexing %s: %d chunks from %d pages", pdf_id, len(all_chunks), len(pages))

        # 4. Embed in batches (OpenAI allows up to 2048 inputs per call,
        #    but we batch at 50 to stay safe on token limits)
        embedding_svc = get_embedding_service()
        BATCH_SIZE = 50
        all_embeddings: list[list[float]] = []

        failed_batches = 0
        successful_chunks: list[dict] = []
        for i in range(0, len(all_chunks), BATCH_SIZE):
            batch = all_chunks[i : i + BATCH_SIZE]
            batch_texts = [c["content"] for c in batch]
            try:
                batch_embeddings = await embedding_svc.embed_batch(batch_texts)
                all_embeddings.extend(batch_embeddings)
                successful_chunks.extend(batch)
            except Exception as e:
                failed_batches += 1
                batch_num = i // BATCH_SIZE + 1
                logger.warning(
                    "Indexing %s: batch %d failed (chunks %d-%d), skipping. Error: %s",
                    pdf_id,
                    batch_num,
                    i,
                    min(i + BATCH_SIZE, len(all_chunks)) - 1,
                    e,
                )

        if failed_batches:
            logger.warning("Indexing %s: %d batch(es) skipped due to errors", pdf_id, failed_batches)
        all_chunks = successful_chunks

        if not all_chunks:
            raise RuntimeError(f"All embedding batches failed for {pdf_id}")

        # 5. Delete old chunks for this PDF, then insert new ones
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM document_chunks WHERE pdf_id = $1", pdf_id)

            for idx, (chunk, embedding) in enumerate(zip(all_chunks, all_embeddings)):
                embedding_str = f"[{','.join(map(str, embedding))}]"
                await conn.execute(
                    """
                    INSERT INTO document_chunks
                      (id, pdf_id, chunk_index, page_number, content, embedding, tsv, metadata, created_at)
                    VALUES
                      (gen_random_uuid(), $1, $2, $3, $4, $5::vector,
                       to_tsvector('simple', $4), $6::jsonb, NOW())
                    """,
                    pdf_id,
                    idx,
                    chunk["page_number"],
                    chunk["content"],
                    embedding_str,
                    f'{{"page_number": {chunk["page_number"]}}}',
                )

        await _set_status("ready")
        logger.info("Indexing %s: complete (%d chunks stored)", pdf_id, len(all_chunks))

    except Exception:
        logger.exception("Indexing failed for %s", pdf_id)
        await _set_status("failed")
