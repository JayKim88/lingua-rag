"""
asyncpg connection pool management.

Provides:
- init_db_pool()   — called at FastAPI startup
- close_db_pool()  — called at FastAPI shutdown
- get_pool()       — returns the active pool (raises if not initialized)
"""

import logging
from typing import Optional

import asyncpg

from app.core.config import settings

logger = logging.getLogger(__name__)

_pool: Optional[asyncpg.Pool] = None


async def init_db_pool() -> asyncpg.Pool:
    """Initialize the global asyncpg connection pool.

    SSL is enabled automatically when DATABASE_URL contains 'sslmode=require'
    (e.g. Supabase direct connection strings). Local development URLs without
    sslmode work without SSL.
    """
    global _pool
    database_url = settings.DATABASE_URL

    # asyncpg does not parse sslmode from the DSN — strip it and pass ssl kwarg.
    ssl: Optional[str] = None
    if "sslmode=require" in database_url:
        database_url = database_url.replace("?sslmode=require", "").replace("&sslmode=require", "")
        ssl = "require"

    _pool = await asyncpg.create_pool(
        dsn=database_url,
        min_size=0,  # Lazy connections — pool creation never blocks on DB availability.
        max_size=10,  # Render free tier: avoids exhausting Supabase connection limit.
        command_timeout=30,
        timeout=30.0,  # Per-connection acquire timeout (reduced from 60s; fail fast).
        max_inactive_connection_lifetime=300,  # Recycle idle connections every 5 min.
        ssl=ssl,
    )
    logger.info("asyncpg pool created (min=0, max=10, ssl=%s).", ssl)
    return _pool


async def close_db_pool() -> None:
    """Close the global asyncpg connection pool."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        logger.info("asyncpg pool closed.")


def get_pool() -> asyncpg.Pool:
    """Return the active pool. Raises RuntimeError if not initialized."""
    if _pool is None:
        raise RuntimeError("Database pool is not initialized. Was init_db_pool() called?")
    return _pool
