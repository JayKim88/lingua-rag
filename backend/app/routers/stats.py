"""
Usage statistics router.

GET /api/stats  — Token usage, RAG hit rate, and cost estimates.

Provides observability into:
- Total/daily token consumption
- RAG retrieval hit rate
- Estimated API costs (Claude + OpenAI Embeddings)
- Per-PDF usage breakdown
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends

from app.db.connection import get_pool
from app.deps.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()

# Cost per token (approximate, as of 2026-03)
# Claude Sonnet: $3/M input, $15/M output — we track output tokens
CLAUDE_OUTPUT_COST_PER_TOKEN = 15.0 / 1_000_000
# OpenAI text-embedding-3-small: $0.02/M tokens (~750 tokens per chunk avg)
EMBEDDING_COST_PER_CHUNK = 0.02 / 1_000_000 * 750


@router.get("/stats")
async def get_usage_stats(user_id: UUID = Depends(get_current_user)):
    """
    Return usage statistics for the authenticated user.

    Includes:
    - total_messages: total user + assistant messages
    - total_output_tokens: sum of assistant token_count
    - rag_hit_rate: % of assistant messages that used RAG context
    - estimated_cost: approximate API cost in USD
    - daily_usage: last 14 days of token usage
    - per_pdf: top PDFs by message count
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        # Aggregate stats
        row = await conn.fetchrow(
            """
            SELECT
                COUNT(*) FILTER (WHERE m.role = 'user') AS user_messages,
                COUNT(*) FILTER (WHERE m.role = 'assistant') AS assistant_messages,
                COALESCE(SUM(m.token_count) FILTER (WHERE m.role = 'assistant'), 0) AS total_output_tokens,
                COUNT(*) FILTER (WHERE m.role = 'assistant' AND m.rag_hit = true) AS rag_hits,
                COUNT(*) FILTER (WHERE m.role = 'assistant' AND m.rag_hit IS NOT NULL) AS rag_total
            FROM messages m
            JOIN conversations c ON m.conversation_id = c.id
            WHERE c.user_id = $1
            """,
            user_id,
        )

        # Daily usage (last 14 days)
        daily = await conn.fetch(
            """
            SELECT
                DATE(m.created_at) AS day,
                COUNT(*) AS messages,
                COALESCE(SUM(m.token_count) FILTER (WHERE m.role = 'assistant'), 0) AS output_tokens
            FROM messages m
            JOIN conversations c ON m.conversation_id = c.id
            WHERE c.user_id = $1
              AND m.created_at > NOW() - INTERVAL '14 days'
            GROUP BY DATE(m.created_at)
            ORDER BY day DESC
            """,
            user_id,
        )

        # Per-PDF breakdown (top 10)
        per_pdf = await conn.fetch(
            """
            SELECT
                c.pdf_id,
                COALESCE(p.name, c.pdf_id) AS pdf_name,
                COUNT(*) AS messages,
                COALESCE(SUM(m.token_count) FILTER (WHERE m.role = 'assistant'), 0) AS output_tokens,
                COUNT(*) FILTER (WHERE m.rag_hit = true) AS rag_hits
            FROM messages m
            JOIN conversations c ON m.conversation_id = c.id
            LEFT JOIN pdf_files p ON c.pdf_id = p.id
            WHERE c.user_id = $1 AND c.pdf_id IS NOT NULL
            GROUP BY c.pdf_id, p.name
            ORDER BY messages DESC
            LIMIT 10
            """,
            user_id,
        )

        # Chunk count for embedding cost estimate
        chunk_count = await conn.fetchval(
            """
            SELECT COUNT(*) FROM document_chunks dc
            JOIN pdf_files pf ON dc.pdf_id = pf.id
            WHERE pf.user_id = $1
            """,
            user_id,
        )

    total_output_tokens = row["total_output_tokens"]
    rag_total = row["rag_total"]
    rag_hits = row["rag_hits"]

    # Cost estimates
    claude_cost = total_output_tokens * CLAUDE_OUTPUT_COST_PER_TOKEN
    embedding_cost = (chunk_count or 0) * EMBEDDING_COST_PER_CHUNK
    total_cost = claude_cost + embedding_cost

    return {
        "user_messages": row["user_messages"],
        "assistant_messages": row["assistant_messages"],
        "total_output_tokens": total_output_tokens,
        "rag_hit_rate": round(rag_hits / rag_total * 100, 1) if rag_total > 0 else None,
        "estimated_cost": {
            "claude_usd": round(claude_cost, 4),
            "embedding_usd": round(embedding_cost, 4),
            "total_usd": round(total_cost, 4),
        },
        "indexed_chunks": chunk_count or 0,
        "daily_usage": [
            {
                "day": str(d["day"]),
                "messages": d["messages"],
                "output_tokens": d["output_tokens"],
            }
            for d in daily
        ],
        "per_pdf": [
            {
                "pdf_id": p["pdf_id"],
                "pdf_name": p["pdf_name"],
                "messages": p["messages"],
                "output_tokens": p["output_tokens"],
                "rag_hits": p["rag_hits"],
            }
            for p in per_pdf
        ],
    }
