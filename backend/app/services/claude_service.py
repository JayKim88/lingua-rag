"""
Claude service.

Handles:
- System prompt dynamic assembly (FR-2)
- Streaming with auto-retry (FR-4: 3 retries, exponential backoff)
- Truncated response detection (EC-3)
- Conversation history injection (FR-3)

SSE event types yielded:
  {"type": "token",     "content": "..."}
  {"type": "truncated"}
  {"type": "error",     "message": "..."}
"""

import asyncio
import logging
from typing import Any, AsyncGenerator

import anthropic

from app.core.config import settings
from app.data.prompts import build_system_prompt_parts
from app.data.units import DOKDOKDOK_A1

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
INITIAL_BACKOFF = 1.0  # seconds
MAX_TOKENS = 2048


class ClaudeService:
    """Wraps anthropic SDK for streaming with retry logic."""

    def __init__(self):
        self._client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    async def stream(
        self,
        user_message: str,
        history: list[dict[str, Any]],
        unit_id: str,
        level: str,
        textbook_id: str,
        rag_chunks: list[str] | None = None,
        page_image: str | None = None,
        page_text: str | None = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """
        Stream Claude's response as SSE-compatible events.

        Implements:
        - Auto-retry with exponential backoff (FR-4)
        - Truncation detection (EC-3)
        - Out-of-level question rejection (FR-4)

        Args:
            user_message: The user's current question.
            history: List of {role, content} dicts (last 10 messages).
            unit_id: Current unit (e.g. "A1-3").
            level: "A1" or "A2".
            textbook_id: e.g. "dokdokdok-a1".

        Yields:
            Dict events with "type" key.
        """
        unit_data = DOKDOKDOK_A1.get(unit_id) if textbook_id == "dokdokdok-a1" else None
        fixed_prefix, dynamic_suffix = build_system_prompt_parts(
            level=level, unit_id=unit_id, unit_data=unit_data
        )

        if rag_chunks:
            joined = "\n\n---\n\n".join(rag_chunks)
            # Prepend RAG context so it appears immediately after the cached prefix.
            # The model attends most to the start/end of context ("Lost in the Middle",
            # Liu et al. 2023) — placing retrieval chunks first maximises recall.
            dynamic_suffix = f"## 교재 원문 참고\n\n{joined}\n\n" + dynamic_suffix

        # System prompt as two blocks: cacheable prefix + dynamic suffix.
        # The fixed_prefix (~1,300 tokens) is identical across same-level requests
        # and qualifies for Anthropic prompt caching (min 1,024 tokens).
        system: list[dict] = [
            {
                "type": "text",
                "text": fixed_prefix,
                "cache_control": {"type": "ephemeral"},
            },
            {
                "type": "text",
                "text": dynamic_suffix,
            },
        ]

        # Build message list for Claude (history + current user message)
        messages = _build_messages(history, user_message, page_image=page_image, page_text=page_text)

        last_error: Exception | None = None
        for attempt in range(MAX_RETRIES):
            if attempt > 0:
                backoff = INITIAL_BACKOFF * (2 ** (attempt - 1))
                logger.info("Retry attempt %d after %.1fs backoff.", attempt, backoff)
                await asyncio.sleep(backoff)

            try:
                async for event in self._stream_once(system, messages):
                    yield event
                return  # Success — exit retry loop
            except anthropic.RateLimitError as exc:
                last_error = exc
                logger.warning("Rate limit hit (attempt %d): %s", attempt + 1, exc)
            except anthropic.APIStatusError as exc:
                last_error = exc
                logger.warning(
                    "API status error %s (attempt %d): %s",
                    exc.status_code,
                    attempt + 1,
                    exc.message,
                )
                # Do not retry 4xx errors other than 429
                if exc.status_code < 500 and exc.status_code != 429:
                    break
            except anthropic.APIConnectionError as exc:
                last_error = exc
                logger.warning("Connection error (attempt %d): %s", attempt + 1, exc)
            except Exception as exc:
                last_error = exc
                logger.exception("Unexpected error in Claude stream (attempt %d).", attempt + 1)
                break

        # All retries exhausted
        logger.error("All %d retries failed. Last error: %s", MAX_RETRIES, last_error)
        yield {
            "type": "error",
            "message": "Claude 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        }

    async def _stream_once(
        self,
        system: list[dict],
        messages: list[dict[str, Any]],
    ) -> AsyncGenerator[dict[str, Any], None]:
        """
        Perform a single streaming call to Claude.

        Yields token events and optionally a truncated event.
        """
        stop_reason: str | None = None

        async with self._client.messages.stream(
            model=settings.CLAUDE_MODEL,
            max_tokens=MAX_TOKENS,
            system=system,
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                yield {"type": "token", "content": text}

            final_message = await stream.get_final_message()
            stop_reason = final_message.stop_reason
            usage = final_message.usage
            yield {
                "type": "usage",
                "output_tokens": usage.output_tokens,
                "input_tokens": usage.input_tokens,
                "cache_read_tokens": getattr(usage, "cache_read_input_tokens", 0) or 0,
                "cache_creation_tokens": getattr(usage, "cache_creation_input_tokens", 0) or 0,
            }

        if stop_reason == "max_tokens":
            logger.info("Response truncated: max_tokens reached.")
            yield {"type": "truncated"}


def _build_messages(
    history: list[dict[str, Any]],
    user_message: str,
    page_image: str | None = None,
    page_text: str | None = None,
) -> list[dict[str, Any]]:
    """
    Build the messages array for the Claude API call.

    Combines conversation history (already limited to last 10) with
    the current user message.  When page_image is provided the user
    turn becomes a multimodal content block (image + text).
    When page_text is provided it is prepended to the user message
    as context (much cheaper than vision tokens).

    Anthropic requires messages to alternate user/assistant and
    the array must start with a user message.
    """
    result: list[dict[str, Any]] = []

    for msg in history:
        result.append({"role": msg["role"], "content": msg["content"]})

    if page_image:
        content: Any = [
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": page_image,
                },
            },
            {"type": "text", "text": user_message},
        ]
    elif page_text:
        content = f"[현재 PDF 페이지 내용]\n{page_text}\n\n{user_message}"
    else:
        content = user_message

    result.append({"role": "user", "content": content})
    return result