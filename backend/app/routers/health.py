"""
Health check router.

GET /api/health — Returns service status and DB connectivity.
"""

import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.db.connection import get_pool

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/health")
async def health_check():
    """Return service health including DB connectivity."""
    db_ok = False
    try:
        pool = get_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        db_ok = True
    except Exception as exc:
        logger.warning("DB health check failed: %s", exc)

    status = "ok" if db_ok else "degraded"
    return JSONResponse(
        content={
            "status": status,
            "service": "lingua-rag",
            "version": "0.1.0",
            "database": "connected" if db_ok else "unavailable",
        },
        status_code=200 if db_ok else 503,
    )