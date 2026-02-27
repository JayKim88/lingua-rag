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
from app.data.prompts import build_system_prompt
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
        system_prompt = build_system_prompt(level=level, unit_id=unit_id, unit_data=unit_data)

        if rag_chunks:
            joined = "\n\n---\n\n".join(rag_chunks)
            system_prompt += f"\n\n## 교재 원문 참고\n\n{joined}"

        # Build message list for Claude (history + current user message)
        messages = _build_messages(history, user_message)

        last_error: Exception | None = None
        for attempt in range(MAX_RETRIES):
            if attempt > 0:
                backoff = INITIAL_BACKOFF * (2 ** (attempt - 1))
                logger.info("Retry attempt %d after %.1fs backoff.", attempt, backoff)
                await asyncio.sleep(backoff)

            try:
                async for event in self._stream_once(system_prompt, messages):
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
        system_prompt: str,
        messages: list[dict[str, str]],
    ) -> AsyncGenerator[dict[str, Any], None]:
        """
        Perform a single streaming call to Claude.

        Yields token events and optionally a truncated event.
        """
        stop_reason: str | None = None

        async with self._client.messages.stream(
            model=settings.CLAUDE_MODEL,
            max_tokens=MAX_TOKENS,
            system=system_prompt,
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                yield {"type": "token", "content": text}

            final_message = await stream.get_final_message()
            stop_reason = final_message.stop_reason

        if stop_reason == "max_tokens":
            logger.info("Response truncated: max_tokens reached.")
            yield {"type": "truncated"}


def _build_messages(
    history: list[dict[str, Any]],
    user_message: str,
) -> list[dict[str, str]]:
    """
    Build the messages array for the Claude API call.

    Combines conversation history (already limited to last 10) with
    the current user message.

    Anthropic requires messages to alternate user/assistant and
    the array must start with a user message.
    """
    result: list[dict[str, str]] = []

    for msg in history:
        result.append({"role": msg["role"], "content": msg["content"]})

    result.append({"role": "user", "content": user_message})
    return result