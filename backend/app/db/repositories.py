"""
Database repositories for sessions, conversations, and messages.

Each repository encapsulates SQL queries for its domain.
All methods use asyncpg and return plain dicts for easy serialization.
"""

import logging
import uuid
from typing import Any, Optional
from uuid import UUID

import asyncpg

from app.db.connection import get_pool

logger = logging.getLogger(__name__)


def _record_to_dict(record: asyncpg.Record) -> dict[str, Any]:
    """Convert an asyncpg Record to a plain dict with UUID values as strings."""
    result = {}
    for key in record.keys():
        value = record[key]
        if isinstance(value, uuid.UUID):
            result[key] = value  # Keep as UUID internally; serialize at boundary
        else:
            result[key] = value
    return result


class ConversationRepository:
    """CRUD operations for conversations table."""

    async def get_or_create(
        self,
        user_id: UUID,
        pdf_id: Optional[str] = None,
        force_new: bool = False,
    ) -> dict[str, Any]:
        """
        Return the most recent conversation for (user, pdf),
        or create a new one.

        If force_new=True, always creates a new conversation thread.
        """
        pool = get_pool()
        async with pool.acquire() as conn:
            if not force_new and pdf_id:
                record = await conn.fetchrow(
                    """
                    SELECT * FROM conversations
                    WHERE user_id = $1 AND pdf_id = $2
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    user_id,
                    pdf_id,
                )
                if record:
                    return _record_to_dict(record)

            # Create new conversation
            record = await conn.fetchrow(
                """
                INSERT INTO conversations
                    (id, user_id, pdf_id, created_at, updated_at)
                VALUES
                    (gen_random_uuid(), $1, $2, NOW(), NOW())
                RETURNING *
                """,
                user_id,
                pdf_id,
            )
        return _record_to_dict(record)

    async def get_by_id(self, conversation_id: UUID) -> Optional[dict[str, Any]]:
        """Fetch conversation by ID."""
        pool = get_pool()
        async with pool.acquire() as conn:
            record = await conn.fetchrow(
                "SELECT * FROM conversations WHERE id = $1", conversation_id
            )
        return _record_to_dict(record) if record else None

    async def list_by_user(self, user_id: UUID) -> list[dict[str, Any]]:
        """List all conversations for a user with message count, newest first."""
        pool = get_pool()
        async with pool.acquire() as conn:
            records = await conn.fetch(
                """
                SELECT c.*, COUNT(m.id) AS message_count
                FROM conversations c
                LEFT JOIN messages m ON m.conversation_id = c.id
                WHERE c.user_id = $1
                GROUP BY c.id
                ORDER BY c.updated_at DESC
                """,
                user_id,
            )
        return [_record_to_dict(r) for r in records]

    async def update_timestamp(self, conversation_id: UUID) -> None:
        """Bump updated_at for a conversation."""
        pool = get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE conversations SET updated_at = NOW() WHERE id = $1",
                conversation_id,
            )


class MessageRepository:
    """CRUD operations for messages table."""

    async def create(
        self,
        conversation_id: UUID,
        role: str,
        content: str,
        token_count: Optional[int] = None,
        rag_hit: Optional[bool] = None,
    ) -> dict[str, Any]:
        """Insert a new message and return the record."""
        pool = get_pool()
        async with pool.acquire() as conn:
            record = await conn.fetchrow(
                """
                INSERT INTO messages
                    (id, conversation_id, role, content, token_count, rag_hit, created_at)
                VALUES
                    (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
                RETURNING *
                """,
                conversation_id,
                role,
                content,
                token_count,
                rag_hit,
            )
        return _record_to_dict(record)

    async def get_recent(
        self,
        conversation_id: UUID,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """
        Return the most recent `limit` messages for a conversation,
        ordered oldest-first (suitable for Claude message array).

        FR-3: silently truncate older messages.
        """
        pool = get_pool()
        async with pool.acquire() as conn:
            records = await conn.fetch(
                """
                SELECT * FROM (
                    SELECT * FROM messages
                    WHERE conversation_id = $1
                    ORDER BY created_at DESC
                    LIMIT $2
                ) sub
                ORDER BY created_at ASC
                """,
                conversation_id,
                limit,
            )
        return [_record_to_dict(r) for r in records]

    async def get_all(self, conversation_id: UUID) -> list[dict[str, Any]]:
        """Return all messages for a conversation, oldest first."""
        pool = get_pool()
        async with pool.acquire() as conn:
            records = await conn.fetch(
                """
                SELECT * FROM messages
                WHERE conversation_id = $1
                ORDER BY created_at ASC
                """,
                conversation_id,
            )
        return [_record_to_dict(r) for r in records]

    async def delete_from(
        self, user_id: UUID, message_id: UUID
    ) -> int:
        """Delete message with given ID and all subsequent messages in the same conversation.

        Verifies ownership via the parent conversation's user_id.
        Returns the number of deleted rows.
        """
        pool = get_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM messages
                WHERE conversation_id = (
                    SELECT m.conversation_id FROM messages m
                    JOIN conversations c ON m.conversation_id = c.id
                    WHERE m.id = $1 AND c.user_id = $2
                )
                AND created_at >= (
                    SELECT created_at FROM messages WHERE id = $1
                )
                """,
                message_id,
                user_id,
            )
        # asyncpg returns "DELETE N" string
        deleted = int(result.split()[-1]) if result else 0
        return deleted

    async def update_feedback(
        self, user_id: UUID, message_id: UUID, feedback: str | None
    ) -> bool:
        """Set or clear feedback ('up'/'down'/None) on an assistant message.

        Verifies ownership via the parent conversation's user_id.
        Returns True if the row was found and updated, False otherwise.
        """
        pool = get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE messages m
                SET feedback = $1
                FROM conversations c
                WHERE m.id = $2
                  AND m.conversation_id = c.id
                  AND c.user_id = $3
                RETURNING m.id
                """,
                feedback,
                message_id,
                user_id,
            )
        return row is not None


class SummaryRepository:
    """CRUD operations for summaries table."""

    async def list_by_user_pdf(self, user_id: UUID, pdf_id: str) -> list[dict]:
        """Return all summaries for a (user, pdf), newest first."""
        pool = get_pool()
        async with pool.acquire() as conn:
            records = await conn.fetch(
                """
                SELECT * FROM summaries
                WHERE user_id = $1 AND pdf_id = $2
                ORDER BY saved_at DESC
                """,
                user_id,
                pdf_id,
            )
        return [_record_to_dict(r) for r in records]

    async def create(self, user_id: UUID, body) -> dict:
        """Insert a new summary and return the record."""
        pool = get_pool()
        async with pool.acquire() as conn:
            record = await conn.fetchrow(
                """
                INSERT INTO summaries (id, user_id, pdf_id, pdf_name, content, saved_at)
                VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
                RETURNING *
                """,
                user_id,
                body.pdf_id,
                body.pdf_name,
                body.content,
            )
        return _record_to_dict(record)

    async def delete(self, user_id: UUID, summary_id: UUID) -> bool:
        """Delete a summary owned by user_id. Returns True if a row was deleted."""
        pool = get_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM summaries WHERE id = $1 AND user_id = $2",
                summary_id,
                user_id,
            )
        return result != "DELETE 0"


class NoteRepository:
    """CRUD operations for notes table."""

    async def list_by_user_pdf(self, user_id: UUID, pdf_id: str) -> list[dict]:
        """Return all notes for a (user, pdf), newest first."""
        pool = get_pool()
        async with pool.acquire() as conn:
            records = await conn.fetch(
                """
                SELECT * FROM notes
                WHERE user_id = $1 AND pdf_id = $2
                ORDER BY saved_at DESC
                """,
                user_id,
                pdf_id,
            )
        return [_record_to_dict(r) for r in records]

    async def create(self, user_id: UUID, body) -> dict:
        """Insert a new note and return the record."""
        pool = get_pool()
        async with pool.acquire() as conn:
            record = await conn.fetchrow(
                """
                INSERT INTO notes (id, user_id, pdf_id, pdf_name, content, saved_at)
                VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
                RETURNING *
                """,
                user_id,
                body.pdf_id,
                body.pdf_name,
                body.content,
            )
        return _record_to_dict(record)

    async def delete(self, user_id: UUID, note_id: UUID) -> bool:
        """Delete a note owned by user_id. Returns True if a row was deleted."""
        pool = get_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM notes WHERE id = $1 AND user_id = $2",
                note_id,
                user_id,
            )
        return result != "DELETE 0"


class AnnotationRepository:
    """CRUD operations for pdf_annotations table."""

    async def list_by_page(self, user_id: UUID, pdf_id: str, page_num: int) -> list[dict]:
        pool = get_pool()
        async with pool.acquire() as conn:
            records = await conn.fetch(
                """
                SELECT * FROM pdf_annotations
                WHERE user_id = $1 AND pdf_id = $2 AND page_num = $3
                ORDER BY created_at ASC
                """,
                user_id, pdf_id, page_num,
            )
        return [_record_to_dict(r) for r in records]

    async def list_all(self, user_id: UUID, pdf_id: str) -> list[dict]:
        pool = get_pool()
        async with pool.acquire() as conn:
            records = await conn.fetch(
                """
                SELECT * FROM pdf_annotations
                WHERE user_id = $1 AND pdf_id = $2
                ORDER BY page_num ASC, created_at ASC
                """,
                user_id, pdf_id,
            )
        return [_record_to_dict(r) for r in records]

    async def create(self, user_id: UUID, pdf_id: str, page_num: int,
                     x_pct: float, y_pct: float, text: str, color: str) -> dict:
        pool = get_pool()
        async with pool.acquire() as conn:
            record = await conn.fetchrow(
                """
                INSERT INTO pdf_annotations
                  (id, user_id, pdf_id, page_num, x_pct, y_pct, text, color, created_at)
                VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW())
                RETURNING *
                """,
                user_id, pdf_id, page_num, x_pct, y_pct, text, color,
            )
        return _record_to_dict(record)

    async def update(
        self,
        user_id: UUID,
        ann_id: UUID,
        text: str | None = None,
        color: str | None = None,
        x_pct: float | None = None,
        y_pct: float | None = None,
    ) -> dict | None:
        sets: list[str] = []
        params: list = []
        idx = 1
        if text is not None:
            sets.append(f"text = ${idx}"); params.append(text); idx += 1
        if color is not None:
            sets.append(f"color = ${idx}"); params.append(color); idx += 1
        if x_pct is not None:
            sets.append(f"x_pct = ${idx}"); params.append(x_pct); idx += 1
        if y_pct is not None:
            sets.append(f"y_pct = ${idx}"); params.append(y_pct); idx += 1
        if not sets:
            return None
        params.extend([ann_id, user_id])
        pool = get_pool()
        async with pool.acquire() as conn:
            record = await conn.fetchrow(
                f"UPDATE pdf_annotations SET {', '.join(sets)} WHERE id = ${idx} AND user_id = ${idx + 1} RETURNING *",
                *params,
            )
        return _record_to_dict(record) if record else None

    async def delete(self, user_id: UUID, ann_id: UUID) -> bool:
        pool = get_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM pdf_annotations WHERE id = $1 AND user_id = $2",
                ann_id, user_id,
            )
        return result != "DELETE 0"


class PdfFileRepository:
    """CRUD for pdf_files metadata table.

    SQL migration (run once in Supabase SQL editor):
      CREATE TABLE IF NOT EXISTS pdf_files (
        id TEXT PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        size BIGINT NOT NULL,
        total_pages INTEGER NOT NULL DEFAULT 0,
        language TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_pdf_files_user_id ON pdf_files(user_id);

      -- If the table already exists, add columns:
      ALTER TABLE pdf_files ADD COLUMN IF NOT EXISTS language TEXT;
      ALTER TABLE pdf_files ADD COLUMN IF NOT EXISTS last_page INTEGER NOT NULL DEFAULT 1;
    """

    async def create(self, user_id: UUID, pdf_id: str, name: str, size: int, total_pages: int) -> dict:
        pool = get_pool()
        async with pool.acquire() as conn:
            record = await conn.fetchrow(
                """
                INSERT INTO pdf_files (id, user_id, name, size, total_pages, created_at)
                VALUES ($1, $2, $3, $4, $5, NOW())
                RETURNING *
                """,
                pdf_id, user_id, name, size, total_pages,
            )
        return _record_to_dict(record)

    async def list_by_user(self, user_id: UUID) -> list[dict]:
        pool = get_pool()
        async with pool.acquire() as conn:
            records = await conn.fetch(
                "SELECT * FROM pdf_files WHERE user_id = $1 ORDER BY created_at DESC",
                user_id,
            )
        return [_record_to_dict(r) for r in records]

    async def get(self, user_id: UUID, pdf_id: str) -> dict | None:
        pool = get_pool()
        async with pool.acquire() as conn:
            record = await conn.fetchrow(
                "SELECT * FROM pdf_files WHERE id = $1 AND user_id = $2",
                pdf_id, user_id,
            )
        return _record_to_dict(record) if record else None

    async def update_language(self, user_id: UUID, pdf_id: str, language: str | None) -> bool:
        pool = get_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                "UPDATE pdf_files SET language = $1 WHERE id = $2 AND user_id = $3",
                language, pdf_id, user_id,
            )
        return result != "UPDATE 0"

    async def update_last_page(self, user_id: UUID, pdf_id: str, last_page: int) -> bool:
        pool = get_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                "UPDATE pdf_files SET last_page = $1 WHERE id = $2 AND user_id = $3",
                last_page, pdf_id, user_id,
            )
        return result != "UPDATE 0"

    async def delete(self, user_id: UUID, pdf_id: str) -> bool:
        pool = get_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM pdf_files WHERE id = $1 AND user_id = $2",
                pdf_id, user_id,
            )
        return result != "DELETE 0"


class VectorSearchRepository:
    """pgvector similarity search for RAG."""

    async def search(
        self,
        query_embedding: list[float],
        pdf_id: str,
        limit: int = 3,
        max_distance: float = 0.7,
    ) -> list[dict[str, Any]]:
        """
        Return document chunks most similar to query_embedding for a given PDF.

        Uses cosine distance (<=>). Lower distance = more similar.
        Chunks with distance >= max_distance are excluded.
        """
        pool = get_pool()
        embedding_str = f"[{','.join(map(str, query_embedding))}]"

        async with pool.acquire() as conn:
            records = await conn.fetch(
                """
                SELECT content, metadata,
                       embedding <=> $1::vector AS distance
                FROM document_chunks
                WHERE pdf_id = $2
                  AND embedding <=> $1::vector < $3
                ORDER BY distance
                LIMIT $4
                """,
                embedding_str,
                pdf_id,
                max_distance,
                limit,
            )
        return [_record_to_dict(r) for r in records]