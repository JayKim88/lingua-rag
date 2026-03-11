"""Supabase Storage client (async, httpx-based).

Storage layout:  pdfs/{user_id}/{pdf_id}.pdf
Bucket:          pdfs  (Private)
Auth:            service_role key (bypasses RLS)
"""

import httpx
from app.core.config import settings

BUCKET = "pdfs"

def _base() -> str:
    return f"{settings.SUPABASE_URL.rstrip('/')}/storage/v1"

def _headers() -> dict[str, str]:
    key = settings.SUPABASE_SERVICE_ROLE_KEY
    return {"Authorization": f"Bearer {key}", "apikey": key}

def object_path(user_id: str, pdf_id: str) -> str:
    return f"{user_id}/{pdf_id}.pdf"


async def storage_upload(path: str, data: bytes) -> None:
    """Upload bytes to Supabase Storage. Raises on failure."""
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{_base()}/object/{BUCKET}/{path}",
            content=data,
            headers={**_headers(), "Content-Type": "application/octet-stream"},
            timeout=60,
        )
        r.raise_for_status()


async def storage_download(path: str) -> bytes:
    """Download file bytes from Supabase Storage."""
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{_base()}/object/{BUCKET}/{path}",
            headers=_headers(),
            timeout=60,
            follow_redirects=True,
        )
        r.raise_for_status()
        return r.content


async def storage_signed_url(path: str, expires_in: int = 3600) -> str:
    """Return a short-lived signed URL for direct browser download."""
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{_base()}/object/sign/{BUCKET}/{path}",
            json={"expiresIn": expires_in},
            headers=_headers(),
            timeout=10,
        )
        r.raise_for_status()
        signed = r.json()["signedURL"]
        # signed may be a relative path — prepend base if needed
        if signed.startswith("/"):
            return f"{settings.SUPABASE_URL.rstrip('/')}/storage/v1{signed}"
        return signed


async def storage_delete(path: str) -> None:
    """Delete a file from Supabase Storage (best-effort)."""
    async with httpx.AsyncClient() as client:
        await client.request(
            "DELETE",
            f"{_base()}/object/{BUCKET}",
            json={"prefixes": [path]},
            headers={**_headers(), "Content-Type": "application/json"},
            timeout=10,
        )
