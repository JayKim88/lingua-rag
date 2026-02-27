"""
JWT authentication dependency.

Verifies Supabase-issued JWT tokens using JWKS (ES256/RS256) and extracts
the user's UUID. Used as Depends(get_current_user) in all protected endpoints.
"""

import logging
import ssl
from functools import lru_cache
from uuid import UUID

import certifi
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from app.core.config import settings

logger = logging.getLogger(__name__)

_bearer = HTTPBearer()


@lru_cache(maxsize=1)
def _jwks_client() -> PyJWKClient:
    """Return a cached JWKS client for the Supabase project."""
    jwks_url = f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json"
    ssl_context = ssl.create_default_context(cafile=certifi.where())
    return PyJWKClient(jwks_url, cache_keys=True, ssl_context=ssl_context)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> UUID:
    """
    Verify the Supabase JWT (ES256) and return the authenticated user's UUID.

    Raises 401 if the token is missing, expired, or invalid.
    """
    token = credentials.credentials
    try:
        signing_key = _jwks_client().get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
        )
        user_id = payload.get("sub")
        if not user_id:
            raise ValueError("Missing sub claim in token")
        return UUID(user_id)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
        )
    except (jwt.InvalidTokenError, ValueError) as exc:
        logger.warning("JWT validation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )
