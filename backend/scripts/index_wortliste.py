"""
WORTLISTE-A1 Indexing Script for LinguaRAG.

Indexes the WORTLISTE-A1 vocabulary PDF into the document_chunks table.
Unlike the main textbook, WORTLISTE is organized by topic (not lesson number),
so all chunks get unit_id=None and textbook_id='wortliste-a1'.

Usage:
    cd backend
    python -m scripts.index_wortliste --pdf "../resources/WORTLISTE-A1_digital_6775f15047392.pdf"
    python -m scripts.index_wortliste --pdf "../resources/WORTLISTE-A1_digital_6775f15047392.pdf" --dry-run
    python -m scripts.index_wortliste --pdf "../resources/WORTLISTE-A1_digital_6775f15047392.pdf" --clear
"""

import argparse
import asyncio
import logging
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import subprocess
import asyncpg
from openai import AsyncOpenAI

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

TEXTBOOK_ID = "wortliste-a1"
CHUNK_SIZE_CHARS = 1200   # smaller than textbook — vocab entries are short
CHUNK_OVERLAP_CHARS = 150
EMBED_BATCH_SIZE = 20
EMBED_MODEL = "text-embedding-3-small"
MIN_CHUNK_CHARS = 60

# Skip intro/TOC pages (안내, 범례, 목차)
LESSON_START_PAGE = 7

SKIP_IF_CONTAINS = [
    "License Number :",      # per-user watermark
    "Licensed to",           # per-user email watermark
    "저작권법에 의해 보호",
    "무단 전재와 복제를 금합니다",
    "All rights reserved",
    "WORTLISTE A1",          # page footer
    "독독독 독일어",
]


def is_noise_chunk(text: str) -> bool:
    if len(text) < MIN_CHUNK_CHARS:
        return True
    for phrase in SKIP_IF_CONTAINS:
        if phrase in text:
            return True
    return False


def extract_pages(pdf_path: str) -> list[dict]:
    result = subprocess.run(["pdfinfo", pdf_path], capture_output=True, text=True, check=True)
    total = 0
    for line in result.stdout.splitlines():
        if line.startswith("Pages:"):
            total = int(line.split(":")[1].strip())
            break
    logger.info("Opened PDF: %d pages", total)

    pages = []
    for i in range(1, total + 1):
        result = subprocess.run(
            ["pdftotext", "-layout", "-f", str(i), "-l", str(i), pdf_path, "-"],
            capture_output=True, text=True
        )
        text = result.stdout.strip()
        if text:
            pages.append({"page": i, "text": text})
        if i % 30 == 0:
            logger.info("  Extracted page %d/%d", i, total)

    logger.info("Extracted text from %d non-empty pages", len(pages))
    return pages


def chunk_text(text: str, chunk_size: int, overlap: int) -> list[str]:
    chunks = []
    start = 0
    length = len(text)

    while start < length:
        end = min(start + chunk_size, length)
        if end < length:
            search_begin = end - 150
            if search_begin > start:
                break_search = text[search_begin:end]
                for sep in ["\n\n", "\n"]:
                    pos = break_search.rfind(sep)
                    if pos != -1:
                        end = search_begin + pos + len(sep)
                        break
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= length:
            break
        start = end - overlap

    return chunks


def build_chunks(pages: list[dict]) -> list[dict]:
    chunk_records = []
    chunk_index = 0

    for page_data in pages:
        page_num = page_data["page"]
        if page_num < LESSON_START_PAGE:
            continue

        text = "\n".join(
            line for line in page_data["text"].split("\n")
            if not any(phrase in line for phrase in SKIP_IF_CONTAINS)
        )

        for chunk in chunk_text(text, CHUNK_SIZE_CHARS, CHUNK_OVERLAP_CHARS):
            if is_noise_chunk(chunk):
                continue
            chunk_records.append({
                "textbook_id": TEXTBOOK_ID,
                "unit_id": None,
                "chunk_index": chunk_index,
                "content": chunk,
                "metadata": {"page_start": page_num, "page_end": page_num},
            })
            chunk_index += 1

    logger.info("Built %d chunks", len(chunk_records))
    return chunk_records


async def embed_chunks(chunks: list[dict], client: AsyncOpenAI) -> list[dict]:
    total = len(chunks)
    logger.info("Generating embeddings for %d chunks...", total)
    for batch_start in range(0, total, EMBED_BATCH_SIZE):
        batch = chunks[batch_start: batch_start + EMBED_BATCH_SIZE]
        response = await client.embeddings.create(
            input=[c["content"] for c in batch], model=EMBED_MODEL
        )
        for i, item in enumerate(response.data):
            batch[i]["embedding"] = item.embedding
        logger.info("  Embedded %d/%d", min(batch_start + EMBED_BATCH_SIZE, total), total)
    return chunks


async def clear_existing(conn: asyncpg.Connection) -> None:
    deleted = await conn.execute(
        "DELETE FROM document_chunks WHERE textbook_id = $1", TEXTBOOK_ID
    )
    logger.info("Cleared existing chunks: %s", deleted)


async def insert_chunks(conn: asyncpg.Connection, chunks: list[dict]) -> None:
    import json
    records = [
        (
            c["textbook_id"],
            c["unit_id"],
            c["chunk_index"],
            c["content"],
            f"[{','.join(map(str, c['embedding']))}]",
            json.dumps(c["metadata"]),
        )
        for c in chunks
    ]
    await conn.executemany(
        """
        INSERT INTO document_chunks
            (textbook_id, unit_id, chunk_index, content, embedding, metadata)
        VALUES ($1, $2, $3, $4, $5::vector, $6::jsonb)
        """,
        records,
    )
    logger.info("Inserted %d chunks", len(records))


def _load_env(key: str) -> str:
    env_path = Path(__file__).parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith(f"{key}="):
                return line.split("=", 1)[1].strip()
    return ""


async def main(pdf_path: str, clear: bool, dry_run: bool) -> None:
    openai_key = os.environ.get("OPENAI_API_KEY") or _load_env("OPENAI_API_KEY")
    if not openai_key and not dry_run:
        logger.error("OPENAI_API_KEY not set.")
        sys.exit(1)

    database_url = os.environ.get("DATABASE_URL") or _load_env("DATABASE_URL")
    if not database_url and not dry_run:
        logger.error("DATABASE_URL not set.")
        sys.exit(1)

    pages = extract_pages(pdf_path)
    chunks = build_chunks(pages)

    if dry_run:
        logger.info("Dry run complete — no DB writes.")
        for i, c in enumerate(chunks[:5]):
            logger.info("  chunk %d [page=%s]: %s...", i, c["metadata"]["page_start"], c["content"][:120])
        return

    client = AsyncOpenAI(api_key=openai_key)
    chunks = await embed_chunks(chunks, client)

    ssl = None
    if "sslmode=require" in database_url:
        database_url = database_url.replace("?sslmode=require", "").replace("&sslmode=require", "")
        ssl = "require"

    conn = await asyncpg.connect(dsn=database_url, ssl=ssl)
    try:
        if clear:
            await clear_existing(conn)
        await insert_chunks(conn, chunks)
    finally:
        await conn.close()

    logger.info("Done! WORTLISTE-A1 indexed as textbook_id='%s'", TEXTBOOK_ID)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Index WORTLISTE-A1 into document_chunks.")
    parser.add_argument("--pdf", required=True, help="Path to WORTLISTE-A1 PDF")
    parser.add_argument("--clear", action="store_true", help="Clear existing wortliste-a1 chunks first")
    parser.add_argument("--dry-run", action="store_true", help="Parse only, no DB writes")
    args = parser.parse_args()

    asyncio.run(main(args.pdf, args.clear, args.dry_run))
