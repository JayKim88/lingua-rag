"""
PDF Indexing Script for LinguaRAG v0.2.

Extracts text from the Zusammen A1 textbook PDF, splits into chunks,
generates embeddings via OpenAI, and stores in Supabase document_chunks table.

Usage:
    cd backend
    python -m scripts.index_pdf --pdf "/path/to/Zusammen-A1.pdf"

Options:
    --pdf       Path to the PDF file (required)
    --textbook  Textbook ID (default: dokdokdok-a1)
    --clear     Delete existing chunks before indexing (default: False)
    --dry-run   Parse and chunk only, do not insert into DB
"""

import argparse
import asyncio
import logging
import os
import re
import sys
from pathlib import Path

# Allow running as `python -m scripts.index_pdf` from backend/
sys.path.insert(0, str(Path(__file__).parent.parent))

import subprocess
import asyncpg
from openai import AsyncOpenAI

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

CHUNK_SIZE_CHARS = 1800      # ~450 tokens (text-embedding-3-small input limit: 8191 tokens)
CHUNK_OVERLAP_CHARS = 200    # overlap between adjacent chunks
EMBED_BATCH_SIZE = 20        # OpenAI allows up to 2048 inputs per request
EMBED_MODEL = "text-embedding-3-small"

# Pages before this number are cover/TOC/intro — skip unit detection.
LESSON_START_PAGE = 10

# Pages from this number onward are appendix (answer key, listening scripts).
# They are not lesson content and should not be indexed under the last unit.
LESSON_END_PAGE = 178

# Maximum allowed jump in unit number between two consecutive detections.
# Lessons appear in order (1→2→3…), so a jump of >5 is almost certainly a
# page-number false positive.  A value of 5 tolerates up to 4 missed headers
# while still rejecting large jumps like "1 → 11" or "17 → 56".
MAX_UNIT_STEP = 5

# Unit ID patterns to detect in PDF text.
#
# 독독독 A1 lesson pages use the format:
#   "18                기간을 묻는 의문문 Wie lange ~"
#   (lesson number + large gap + Korean title, NO "강" character)
#
# TOC pages use "1강  알파벳과..." format — the "강" distinguishes them
# from lesson headers, so the KO pattern safely ignores TOC pages.
#
# German patterns kept as fallback for non-Korean textbooks.
UNIT_HEADER_PATTERNS_KO = [
    # Format A: number + large gap + title on same line (10+ spaces required).
    #   "18                기간을 묻는 의문문 Wie lange ~"
    #   "35               W-의문문 만들기"  ← title may start with a Latin char
    # Page footers ("10\nZusammen A1") are NOT a risk here because the page
    # number stands alone on its own line with nothing after it on that line.
    re.compile(r"(?:^|\n)\s{0,6}(\d{1,2})[ \t]{10,}\S"),
    # Format B: number alone on its own line, title on next indented line.
    #   "36\n                 의지와 바람을 나타내는\n                 화법조동사..."
    # Require Korean first char to exclude page footers:
    #   "11\n    Zusammen A1"  →  "Z" is Latin → no match.
    re.compile(r"(?:^|\n)\s{0,6}(\d{1,2})[ \t]*\n[ \t]{15,}[\uAC00-\uD7A3]"),
]

UNIT_HEADER_PATTERNS_DE = [
    re.compile(r"Einheit\s+(\d+)", re.IGNORECASE),
    re.compile(r"Lektion\s+(\d+)", re.IGNORECASE),
    re.compile(r"Kapitel\s+(\d+)", re.IGNORECASE),
    re.compile(r"Unit\s+(\d+)", re.IGNORECASE),
]

# ---------------------------------------------------------------------------
# Noise filtering
# ---------------------------------------------------------------------------

# Minimum characters a chunk must contain to be indexed.
MIN_CHUNK_CHARS = 60

# Lines/chunks containing any of these substrings are stripped or discarded.
# Used in two places:
#   1. build_chunks — strips matching LINES from page text before chunking.
#   2. is_noise_chunk — discards any chunk whose content still contains these
#      (safety net in case a phrase spans a line-break).
SKIP_IF_CONTAINS = [
    "저작권법에 의해 보호",        # copyright notice (page header)
    "무단 전재와 복제를 금합니다",  # copyright notice variant
    "무단전재와 복제를 금합니다",   # copyright notice no-space variant
    "All rights reserved",
    "License Number",              # per-user watermark (footer)
    "Zusammen A1",                 # book title in page footer
    "독독독 독일어",                # brand name in page footer
]


def is_noise_chunk(text: str) -> bool:
    """Return True if the chunk should be skipped (boilerplate / too short)."""
    if len(text) < MIN_CHUNK_CHARS:
        return True
    for phrase in SKIP_IF_CONTAINS:
        if phrase in text:
            return True
    return False



# ---------------------------------------------------------------------------
# Text extraction
# ---------------------------------------------------------------------------

def extract_pages(pdf_path: str) -> list[dict]:
    """
    Extract text from each page using pdftotext (poppler).
    pdftotext -layout -f N -l N outputs one page at a time — very low memory usage.
    Returns list of {"page": N, "text": "..."} dicts.
    """
    # Get total page count
    result = subprocess.run(
        ["pdfinfo", pdf_path],
        capture_output=True, text=True, check=True
    )
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
        if i % 20 == 0:
            logger.info("  Extracted page %d/%d", i, total)

    logger.info("Extracted text from %d non-empty pages", len(pages))
    return pages


# ---------------------------------------------------------------------------
# Unit detection
# ---------------------------------------------------------------------------

def detect_unit_id(text: str, textbook_id: str) -> str | None:
    """
    Try to find a unit header in text.

    For dokdokdok-a1: matches Korean "강" format (e.g. "1강", "15강").
    Unit numbers 1-56 map directly to A1-1 through A1-56.

    Falls back to German patterns (Einheit/Lektion) for other textbooks.
    Returns unit_id like "A1-3" if found, else None.
    """
    if textbook_id == "dokdokdok-a1":
        for pattern in UNIT_HEADER_PATTERNS_KO:
            m = pattern.search(text)
            if m:
                unit_num = int(m.group(1))
                if 1 <= unit_num <= 56:
                    return f"A1-{unit_num}"
        return None

    for pattern in UNIT_HEADER_PATTERNS_DE:
        m = pattern.search(text)
        if m:
            unit_num = int(m.group(1))
            return f"A1-{unit_num}"
    return None


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------

def chunk_text(text: str, chunk_size: int, overlap: int) -> list[str]:
    """
    Split text into overlapping character-based chunks.
    Tries to break at sentence boundaries (. or \n) when possible.
    """
    chunks = []
    start = 0
    length = len(text)

    while start < length:
        end = min(start + chunk_size, length)

        # Try to break at a sentence boundary in the last 200 chars of the window.
        # search_begin must be > start to prevent end from being set close to start
        # (which caused infinite loops in the original code).
        if end < length:
            search_begin = end - 200
            if search_begin > start:
                break_search = text[search_begin:end]
                for sep in ["\n\n", ".\n", ". ", "\n"]:
                    pos = break_search.rfind(sep)
                    if pos != -1:
                        end = search_begin + pos + len(sep)
                        break

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        if end >= length:
            break  # reached end of text — stop to prevent infinite loop

        start = end - overlap

    return chunks


# ---------------------------------------------------------------------------
# Build chunk records
# ---------------------------------------------------------------------------

def build_chunks(pages: list[dict], textbook_id: str) -> list[dict]:
    """
    Convert page dicts into chunk dicts with unit_id detection.

    Strategy:
    1. Concatenate all pages into a single text, tracking page numbers
    2. Detect unit boundaries by scanning page text
    3. Assign current unit_id to each chunk
    """
    logger.info("build_chunks: entered, pages=%d", len(pages))
    current_unit_id: str | None = None
    current_unit_num: int = 0   # highest accepted unit number (for step-guard)
    chunk_records = []
    chunk_index = 0

    total = len(pages)
    logger.info("build_chunks: starting loop")
    for idx, page_data in enumerate(pages, start=1):
        if idx == 1:
            logger.info("build_chunks: processing first page")
        page_num = page_data["page"]
        text = page_data["text"]

        # Strip boilerplate/copyright lines from page text before chunking or
        # unit detection.  The licensed PDF watermarks every page with copyright
        # notices; without this step those lines pollute the first chunk of each
        # page and cause the noise filter to discard ~70% of content.
        text = "\n".join(
            line for line in text.split("\n")
            if not any(phrase in line for phrase in SKIP_IF_CONTAINS)
        )

        # Detect if this page starts a new unit.
        # Skip early pages (cover / TOC / answer-key) — they contain bare numbers
        # in layouts that can false-match our patterns.
        if page_num >= LESSON_START_PAGE:
            detected = detect_unit_id(text, textbook_id)
            if detected:
                detected_num = int(detected.split("-")[1])
                # For dokdokdok-a1: accept only if the unit number advances by a
                # small step forward.  This rejects page-number false positives
                # (e.g. page 11 matching A1-11 while still on lesson 1) while
                # allowing the rare case of up to MAX_UNIT_STEP-1 missed headers.
                valid = (
                    textbook_id != "dokdokdok-a1"
                    or (
                        detected_num > current_unit_num
                        and detected_num <= current_unit_num + MAX_UNIT_STEP
                    )
                )
                if valid:
                    current_unit_id = detected
                    current_unit_num = detected_num
                    logger.info("  Page %d: detected unit %s", page_num, current_unit_id)

        if idx % 40 == 0:
            logger.info("  Chunking page %d/%d...", idx, total)

        # Skip appendix pages (answer key, listening scripts) — they are not
        # lesson content.  Chunks here would be indexed under the last unit.
        if page_num >= LESSON_END_PAGE:
            continue

        chunks = chunk_text(text, CHUNK_SIZE_CHARS, CHUNK_OVERLAP_CHARS)
        skipped = 0
        for chunk in chunks:
            if is_noise_chunk(chunk):
                skipped += 1
                continue
            chunk_records.append(
                {
                    "textbook_id": textbook_id,
                    "unit_id": current_unit_id,
                    "chunk_index": chunk_index,
                    "content": chunk,
                    "metadata": {"page_start": page_num, "page_end": page_num},
                }
            )
            chunk_index += 1
        if skipped:
            logger.info("  Page %d: skipped %d noise chunk(s)", page_num, skipped)

    logger.info("Built %d chunks (unit_id assigned: %d)",
                len(chunk_records),
                sum(1 for c in chunk_records if c["unit_id"]))
    return chunk_records


# ---------------------------------------------------------------------------
# Embedding
# ---------------------------------------------------------------------------

async def embed_chunks(chunks: list[dict], client: AsyncOpenAI) -> list[dict]:
    """Generate embeddings for all chunks in batches."""
    total = len(chunks)
    logger.info("Generating embeddings for %d chunks...", total)

    for batch_start in range(0, total, EMBED_BATCH_SIZE):
        batch = chunks[batch_start : batch_start + EMBED_BATCH_SIZE]
        texts = [c["content"] for c in batch]

        response = await client.embeddings.create(input=texts, model=EMBED_MODEL)
        for i, item in enumerate(response.data):
            batch[i]["embedding"] = item.embedding

        logger.info("  Embedded %d/%d chunks", min(batch_start + EMBED_BATCH_SIZE, total), total)

    return chunks


# ---------------------------------------------------------------------------
# Database insert
# ---------------------------------------------------------------------------

async def clear_existing(conn: asyncpg.Connection, textbook_id: str) -> None:
    deleted = await conn.execute(
        "DELETE FROM document_chunks WHERE textbook_id = $1", textbook_id
    )
    logger.info("Cleared existing chunks: %s", deleted)


async def insert_chunks(conn: asyncpg.Connection, chunks: list[dict]) -> None:
    """Bulk insert chunks into document_chunks table."""
    import json

    records = [
        (
            c["textbook_id"],
            c["unit_id"],
            c["chunk_index"],
            c["content"],
            f"[{','.join(map(str, c['embedding']))}]",  # vector literal
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
    logger.info("Inserted %d chunks into document_chunks", len(records))


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main(pdf_path: str, textbook_id: str, clear: bool, dry_run: bool) -> None:
    import gc
    openai_key = os.environ.get("OPENAI_API_KEY") or _load_env_key()
    if not openai_key and not dry_run:
        logger.error("OPENAI_API_KEY not set. Add to .env or environment.")
        sys.exit(1)

    database_url = os.environ.get("DATABASE_URL") or _load_env_db()
    if not database_url and not dry_run:
        logger.error("DATABASE_URL not set. Add to .env or environment.")
        sys.exit(1)

    # 1. Extract
    pages = extract_pages(pdf_path)
    gc.collect()
    logger.info("GC done. Starting chunking of %d pages...", len(pages))

    # 2. Chunk
    chunks = build_chunks(pages, textbook_id)
    logger.info("Total chunks: %d", len(chunks))

    if dry_run:
        logger.info("Dry run complete — no DB writes.")
        for i, c in enumerate(chunks[:5]):
            logger.info("  Sample chunk %d [unit=%s, page=%s]: %s...",
                        i, c["unit_id"], c["metadata"]["page_start"], c["content"][:80])
        return

    # 3. Embed
    client = AsyncOpenAI(api_key=openai_key)
    chunks = await embed_chunks(chunks, client)

    # 4. Insert
    # Handle asyncpg sslmode quirk (same as connection.py)
    ssl = None
    if "sslmode=require" in database_url:
        database_url = database_url.replace("?sslmode=require", "").replace("&sslmode=require", "")
        ssl = "require"

    conn = await asyncpg.connect(dsn=database_url, ssl=ssl)
    try:
        if clear:
            await clear_existing(conn, textbook_id)
        await insert_chunks(conn, chunks)
    finally:
        await conn.close()

    logger.info("Done! Run the ivfflat index creation in Supabase SQL Editor:")
    logger.info("  CREATE INDEX ON document_chunks")
    logger.info("    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);")


def _load_env_key() -> str:
    """Load OPENAI_API_KEY from backend/.env if present."""
    env_path = Path(__file__).parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("OPENAI_API_KEY="):
                return line.split("=", 1)[1].strip()
    return ""


def _load_env_db() -> str:
    """Load DATABASE_URL from backend/.env if present."""
    env_path = Path(__file__).parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip()
    return ""


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Index PDF into document_chunks table.")
    parser.add_argument("--pdf", required=True, help="Path to the textbook PDF")
    parser.add_argument("--textbook", default="dokdokdok-a1", help="Textbook ID")
    parser.add_argument("--clear", action="store_true", help="Clear existing chunks first")
    parser.add_argument("--dry-run", action="store_true", help="Parse only, no DB writes")
    args = parser.parse_args()

    asyncio.run(main(args.pdf, args.textbook, args.clear, args.dry_run))
