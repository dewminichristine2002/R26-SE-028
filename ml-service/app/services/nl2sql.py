"""Stage 1 of the RAG pipeline: schema-aware NL2SQL via Llama 3.

This module is intentionally narrow: it builds the prompt, calls Ollama,
parses the JSON response, and returns a structured object. It does NOT
execute SQL \u2014 that is the Node backend's responsibility (so the safety
validator there can refuse anything dangerous).
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import asdict, dataclass
from pathlib import Path

from app.services import ollama_client
from app.services.spacy_preprocess import preprocess


logger = logging.getLogger("eldermeds.nl2sql")
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("[%(asctime)s] %(name)s %(levelname)s: %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False


PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"
NL2SQL_SYSTEM_PROMPT = (PROMPTS_DIR / "nl2sql_system.txt").read_text(encoding="utf-8")


@dataclass
class Nl2SqlResult:
    sql: str
    params: list[str]
    intent: str
    fallback: bool
    fallback_message: str
    raw_response: str

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


_FALLBACK_OUT_OF_SCOPE = Nl2SqlResult(
    sql="",
    params=[],
    intent="out_of_scope",
    fallback=True,
    fallback_message=(
        "I can only answer questions about your medicines, doses, mood "
        "check-ins and caregiver alerts."
    ),
    raw_response="",
)


def _truncate(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    return f"{text[:max_chars]}\u2026"


def _format_recent_messages(messages: list[dict[str, str]] | None) -> str:
    if not messages:
        return "(no prior messages)"
    lines: list[str] = []
    for entry in messages[-6:]:
        role = (entry.get("role") or "user").lower()
        content = (entry.get("content") or "").strip()
        if not content:
            continue
        lines.append(f"{role}: {_truncate(content, 300)}")
    return "\n".join(lines) or "(no prior messages)"


def _build_user_prompt(
    *,
    question: str,
    schema_digest: str,
    recent_messages: list[dict[str, str]] | None,
    user_role: str,
    hints: dict[str, object] | None,
) -> str:
    safe_role = "caregiver" if (user_role or "").lower() == "caregiver" else "user"
    hint_block = ""
    if hints:
        hint_block = (
            "PREPROCESSING HINTS (informational only):\n"
            f"- normalised: {hints.get('normalised', '')}\n"
            f"- keywords: {', '.join(hints.get('keywords') or [])}\n"
            f"- entities: {hints.get('entities') or []}\n"
            f"- time expressions: {', '.join(hints.get('time_expressions') or [])}\n\n"
        )

    return (
        f"USER ROLE: {safe_role} (treat the bound user id $1 as the patient/elder)\n\n"
        "RECENT MESSAGES:\n"
        f"{_format_recent_messages(recent_messages)}\n\n"
        "SCHEMA DIGEST (the only tables you may use):\n"
        f"{schema_digest}\n\n"
        f"{hint_block}"
        f"QUESTION: {question.strip()}\n"
    )


_JSON_BLOCK_RE = re.compile(r"\{[\s\S]*\}")


def _parse_llm_json(raw: str) -> dict[str, object] | None:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    match = _JSON_BLOCK_RE.search(raw)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None


async def generate_sql(
    *,
    question: str,
    schema_digest: str,
    recent_messages: list[dict[str, str]] | None,
    user_role: str,
) -> Nl2SqlResult:
    if not (question or "").strip():
        return _FALLBACK_OUT_OF_SCOPE

    hints = preprocess(question)
    user_prompt = _build_user_prompt(
        question=question,
        schema_digest=schema_digest,
        recent_messages=recent_messages,
        user_role=user_role,
        hints={
            "normalised": hints.normalised,
            "keywords": hints.keywords,
            "entities": hints.entities,
            "time_expressions": hints.time_expressions,
        },
    )

    logger.info(
        "[NL2SQL] question=%r role=%s digest_chars=%d recent=%d",
        question,
        user_role,
        len(schema_digest or ""),
        len(recent_messages or []),
    )

    raw = await ollama_client.chat(
        messages=[
            {"role": "system", "content": NL2SQL_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        response_format="json",
    )

    logger.info("[NL2SQL] raw LLM response (%d chars): %s", len(raw or ""), raw)

    parsed = _parse_llm_json(raw)
    if not isinstance(parsed, dict):
        logger.warning("[NL2SQL] could NOT parse JSON from LLM response: %r", raw)
        return Nl2SqlResult(
            sql="",
            params=[],
            intent="parse_error",
            fallback=True,
            fallback_message=(
                "I couldn't understand that as a healthcare question. "
                "Could you rephrase it?"
            ),
            raw_response=raw,
        )

    sql = str(parsed.get("sql") or "").strip()
    intent = str(parsed.get("intent") or "").strip()
    fallback_flag = bool(parsed.get("fallback"))
    fallback_message = str(parsed.get("fallback_message") or "").strip()
    params_value = parsed.get("params")
    params = [str(p) for p in params_value] if isinstance(params_value, list) else []

    if fallback_flag or not sql:
        logger.info(
            "[NL2SQL] fallback path  intent=%r  llm_message=%r",
            intent,
            fallback_message,
        )
        return Nl2SqlResult(
            sql="",
            params=[],
            intent=intent or "out_of_scope",
            fallback=True,
            fallback_message=fallback_message
            or _FALLBACK_OUT_OF_SCOPE.fallback_message,
            raw_response=raw,
        )

    logger.info("[NL2SQL] generated sql intent=%s sql=%s", intent, sql)
    return Nl2SqlResult(
        sql=sql,
        params=params or ["$1"],
        intent=intent,
        fallback=False,
        fallback_message="",
        raw_response=raw,
    )
