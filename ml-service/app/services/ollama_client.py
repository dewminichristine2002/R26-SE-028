"""Thin async wrapper around the Ollama HTTP API.

We deliberately use httpx directly instead of the ``ollama`` Python package
to keep the dependency tree small and to make timeouts/retries explicit.
"""

from __future__ import annotations

import json
from typing import Any

import httpx

from app.config import get_settings


class OllamaError(RuntimeError):
    """Raised when the Ollama service returns an error or is unreachable."""


async def chat(
    messages: list[dict[str, str]],
    *,
    model: str | None = None,
    temperature: float | None = None,
    num_predict: int | None = None,
    response_format: str | None = None,
) -> str:
    """Call /api/chat on Ollama and return the assistant message text.

    The returned string is the raw content from the LLM. Callers are
    responsible for parsing JSON if a JSON format was requested.
    """

    settings = get_settings()
    chosen_model = model or settings.ollama_model

    payload: dict[str, Any] = {
        "model": chosen_model,
        "messages": messages,
        "stream": False,
        "options": {
            "temperature": settings.ollama_temperature if temperature is None else temperature,
            "num_predict": settings.ollama_num_predict if num_predict is None else num_predict,
        },
    }

    if response_format == "json":
        payload["format"] = "json"

    url = f"{settings.ollama_base_url.rstrip('/')}/api/chat"

    try:
        async with httpx.AsyncClient(timeout=settings.ollama_timeout_seconds) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPStatusError as exc:
        raise OllamaError(
            f"Ollama returned HTTP {exc.response.status_code}: {exc.response.text[:200]}"
        ) from exc
    except httpx.HTTPError as exc:
        raise OllamaError(f"Cannot reach Ollama at {url}: {exc}") from exc

    content = data.get("message", {}).get("content")
    if not isinstance(content, str):
        raise OllamaError(f"Ollama response missing message.content: {json.dumps(data)[:300]}")

    return content
