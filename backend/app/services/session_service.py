"""
Session service.

Manages session cookie lifecycle:
- Validate existing session ID from cookie
- Create new session if missing or invalid
- Update last_active_at on each request
"""

import logging
import uuid
from typing import Any, Optional

from app.db.repositories import SessionRepository

logger = logging.getLogger(__name__)


class SessionService:
    """Handles session resolution and creation."""

    async def resolve_session(
        self,
        session_id_raw: Optional[str],
        repo: SessionRepository,
    ) -> dict[str, Any]:
        """
        Resolve a session from a raw cookie value.

        If the cookie is missing, malformed, or the session doesn't exist
        in the database, a new session is created and returned.

        Returns:
            Session record dict with at minimum {"id": UUID, ...}
        """
        if session_id_raw:
            try:
                session_id = uuid.UUID(session_id_raw)
                session = await repo.get_by_id(session_id)
                if session:
                    await repo.touch(session_id)
                    return session
                else:
                    logger.info(
                        "Session %s not found in DB, creating new.", session_id_raw
                    )
            except (ValueError, TypeError) as exc:
                logger.warning("Invalid session cookie value: %s (%s)", session_id_raw, exc)

        # Create new session
        new_session = await repo.create()
        logger.info("Created new session: %s", new_session["id"])
        return new_session