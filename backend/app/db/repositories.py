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
        unit_id: str,
        level: str,
        textbook_id: str,
        force_new: bool = False,
    ) -> dict[str, Any]:
        """
        Return the most recent conversation for (user, unit),
        or create a new one.

        If force_new=True, always creates a new conversation thread
        (used when unit changes mid-conversation per EC-2).
        """
        pool = get_pool()
        async with pool.acquire() as conn:
            if not force_new:
                record = await conn.fetchrow(
                    """
                    SELECT * FROM conversations
                    WHERE user_id = $1 AND unit_id = $2
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    user_id,
                    unit_id,
                )
                if record:
                    return _record_to_dict(record)

            # Create new conversation
            record = await conn.fetchrow(
                """
                INSERT INTO conversations
                    (id, user_id, unit_id, textbook_id, level, created_at, updated_at)
                VALUES
                    (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW())
                RETURNING *
                """,
                user_id,
                unit_id,
                textbook_id,
                level,
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
    ) -> dict[str, Any]:
        """Insert a new message and return the record."""
        pool = get_pool()
        async with pool.acquire() as conn:
            record = await conn.fetchrow(
                """
                INSERT INTO messages
                    (id, conversation_id, role, content, token_count, created_at)
                VALUES
                    (gen_random_uuid(), $1, $2, $3, $4, NOW())
                RETURNING *
                """,
                conversation_id,
                role,
                content,
                token_count,
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


class SummaryRepository:
    """CRUD operations for summaries table."""

    async def list_by_user_unit(self, user_id: UUID, unit_id: str) -> list[dict]:
        """Return all summaries for a (user, unit), newest first."""
        pool = get_pool()
        async with pool.acquire() as conn:
            records = await conn.fetch(
                """
                SELECT * FROM summaries
                WHERE user_id = $1 AND unit_id = $2
                ORDER BY saved_at DESC
                """,
                user_id,
                unit_id,
            )
        return [_record_to_dict(r) for r in records]

    async def create(self, user_id: UUID, body) -> dict:
        """Insert a new summary and return the record."""
        pool = get_pool()
        async with pool.acquire() as conn:
            record = await conn.fetchrow(
                """
                INSERT INTO summaries (id, user_id, unit_id, unit_title, content, saved_at)
                VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
                RETURNING *
                """,
                user_id,
                body.unit_id,
                body.unit_title,
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

    async def list_by_user_unit(self, user_id: UUID, unit_id: str) -> list[dict]:
        """Return all notes for a (user, unit), newest first."""
        pool = get_pool()
        async with pool.acquire() as conn:
            records = await conn.fetch(
                """
                SELECT * FROM notes
                WHERE user_id = $1 AND unit_id = $2
                ORDER BY saved_at DESC
                """,
                user_id,
                unit_id,
            )
        return [_record_to_dict(r) for r in records]

    async def create(self, user_id: UUID, body) -> dict:
        """Insert a new note and return the record."""
        pool = get_pool()
        async with pool.acquire() as conn:
            record = await conn.fetchrow(
                """
                INSERT INTO notes (id, user_id, unit_id, unit_title, content, saved_at)
                VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
                RETURNING *
                """,
                user_id,
                body.unit_id,
                body.unit_title,
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


class VectorSearchRepository:
    """pgvector similarity search for RAG (v0.2)."""

    async def search(
        self,
        query_embedding: list[float],
        textbook_id: str = "dokdokdok-a1",
        unit_id: Optional[str] = None,
        limit: int = 3,
        max_distance: float = 0.7,
    ) -> list[dict[str, Any]]:
        """
        Return document chunks most similar to query_embedding.

        Uses cosine distance (<=>). Lower distance = more similar.
        Chunks with distance >= max_distance are excluded.
        If unit_id is given, only searches within that unit.
        """
        pool = get_pool()
        # asyncpg passes vectors as cast strings
        embedding_str = f"[{','.join(map(str, query_embedding))}]"

        async with pool.acquire() as conn:
            if unit_id:
                records = await conn.fetch(
                    """
                    SELECT content, metadata,
                           embedding <=> $1::vector AS distance
                    FROM document_chunks
                    WHERE textbook_id = $2
                      AND unit_id = $3
                      AND embedding <=> $1::vector < $4
                    ORDER BY distance
                    LIMIT $5
                    """,
                    embedding_str,
                    textbook_id,
                    unit_id,
                    max_distance,
                    limit,
                )
            else:
                records = await conn.fetch(
                    """
                    SELECT content, metadata,
                           embedding <=> $1::vector AS distance
                    FROM document_chunks
                    WHERE textbook_id = $2
                      AND embedding <=> $1::vector < $3
                    ORDER BY distance
                    LIMIT $4
                    """,
                    embedding_str,
                    textbook_id,
                    max_distance,
                    limit,
                )
        return [_record_to_dict(r) for r in records]