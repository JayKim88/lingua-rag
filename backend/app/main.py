"""
FastAPI application entry point.

Initializes app, middleware, CORS, and mounts all routers.
Manages asyncpg connection pool lifecycle.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.connection import close_db_pool, get_pool, init_db_pool
from app.routers import chat, conversations, guest, health, messages, notes, pdfs, stats, summaries

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan: startup and shutdown."""
    logger.info("Starting LinguaRAG backend...")
    await init_db_pool()
    logger.info("Database pool initialized.")
    # Orphan cleanup: remove user messages older than 1 hour with no assistant reply.
    # Wrapped in try/except so a transient DB hiccup at startup does not prevent the
    # app from binding its port (which would cause Render to kill the process).
    try:
        pool = get_pool()
        async with pool.acquire() as conn:
            deleted = await conn.execute("""
                DELETE FROM messages
                WHERE id IN (
                    SELECT m.id FROM messages m
                    WHERE m.role = 'user'
                      AND m.created_at < NOW() - INTERVAL '1 hour'
                      AND NOT EXISTS (
                          SELECT 1 FROM messages m2
                          WHERE m2.conversation_id = m.conversation_id
                            AND m2.role = 'assistant'
                            AND m2.created_at > m.created_at
                      )
                )
            """)
            logger.info("Startup: orphaned user turns cleaned up: %s", deleted)
    except Exception as exc:
        logger.warning("Startup: orphan cleanup skipped (DB unavailable at boot): %s", exc)
    yield
    logger.info("Shutting down LinguaRAG backend...")
    await close_db_pool()
    logger.info("Database pool closed.")


app = FastAPI(
    title="LinguaRAG API",
    description="German language learning Q&A with Claude SSE streaming",
    version="0.1.0",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS
#
# Starlette's allow_origins does NOT support glob patterns such as
# "https://*.vercel.app". Passing such a pattern causes it to be silently
# ignored, breaking production deployments.
#
# Strategy:
# - Exact origins (no wildcard) go into allow_origins.
# - If FRONTEND_URL contains a "*.vercel.app" entry, translate it to a
#   regex and pass it via allow_origin_regex instead.
# ---------------------------------------------------------------------------
_explicit_origins = [o for o in settings.allowed_origins if "*" not in o]
_has_vercel_wildcard = any("vercel.app" in o and "*" in o for o in settings.allowed_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_explicit_origins,
    allow_origin_regex=(r"https://[a-zA-Z0-9-]+\.vercel\.app" if _has_vercel_wildcard else None),
    allow_credentials=True,  # Required for httponly session cookies
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Accept", "Authorization"],
    expose_headers=[],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(health.router, prefix="/api", tags=["Health"])
app.include_router(chat.router, prefix="/api", tags=["Chat"])
app.include_router(conversations.router, prefix="/api", tags=["Conversations"])
app.include_router(summaries.router, prefix="/api", tags=["Summaries"])
app.include_router(notes.router, prefix="/api", tags=["Notes"])
app.include_router(messages.router, prefix="/api", tags=["Messages"])
app.include_router(pdfs.router, prefix="/api", tags=["PDFs"])
app.include_router(guest.router, prefix="/api", tags=["Guest"])
app.include_router(stats.router, prefix="/api", tags=["Stats"])
