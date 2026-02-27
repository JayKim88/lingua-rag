"""
Embedding service for RAG (v0.2).

Wraps OpenAI text-embedding-3-small to convert text into 1536-dimensional vectors.
Used at:
  - Index time: convert PDF chunks → vectors (scripts/index_pdf.py)
  - Query time: convert user message → vector (routers/chat.py)
"""

import logging
from functools import lru_cache

from openai import AsyncOpenAI

from app.core.config import settings

logger = logging.getLogger(__name__)

MODEL = "text-embedding-3-small"
DIMENSIONS = 1536


class EmbeddingService:
    """Thin wrapper around OpenAI Embeddings API."""

    def __init__(self):
        self._client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    async def embed(self, text: str) -> list[float]:
        """Convert text to a 1536-dimensional embedding vector."""
        response = await self._client.embeddings.create(
            input=text,
            model=MODEL,
        )
        return response.data[0].embedding

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Convert multiple texts to embedding vectors in a single API call."""
        response = await self._client.embeddings.create(
            input=texts,
            model=MODEL,
        )
        # API returns embeddings in the same order as input
        return [item.embedding for item in sorted(response.data, key=lambda x: x.index)]


@lru_cache(maxsize=1)
def get_embedding_service() -> EmbeddingService:
    """Return a process-wide singleton EmbeddingService."""
    return EmbeddingService()
