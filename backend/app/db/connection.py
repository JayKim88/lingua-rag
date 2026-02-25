"""
asyncpg connection pool management.

Provides:
- init_db_pool()   — called at FastAPI startup
- close_db_pool()  — called at FastAPI shutdown
- get_pool()       — returns the active pool (raises if not initialized)
"""

import logging
import os
from typing import Optional

import asyncpg

logger = logging.getLogger(__name__)

_pool: Optional[asyncpg.Pool] = None


async def init_db_pool() -> asyncpg.Pool:
    """Initialize the global asyncpg connection pool."""
    global _pool
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL environment variable is not set.")

    _pool = await asyncpg.create_pool(
        dsn=database_url,
        min_size=2,
        max_size=10,
        command_timeout=30,
    )
    logger.info("asyncpg pool created (min=2, max=10).")
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