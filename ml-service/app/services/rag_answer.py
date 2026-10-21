"""Stage 2 of the RAG pipeline: convert retrieved rows + question into a
warm conversational reply. This is where Llama 3 turns SQL output into
plain English suitable for an elderly user.
"""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.services import ollama_client


PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"
ANSWER_SYSTEM_PROMPT = (PROMPTS_DIR / "answer_system.txt").read_text(encoding="utf-8")


@dataclass
class AnswerResult:
    answer: str
    follow_ups: list[str]
    raw_response: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


_JSON_BLOCK_RE = re.compile(r"\{[\s\S]*\}")


def _parse_json(raw: str) -> dict[str, Any] | None:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        match = _JSON_BLOCK_RE.search(raw)
        if not match:
            return None
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            return None


def _serialise_rows(rows: list[dict[str, Any]] | None, max_rows: int) -> str:
    if not rows:
        return "[]"
    trimmed = rows[:max_rows]
    try:
        return json.dumps(trimmed, default=str, ensure_ascii=False)
    except TypeError:
        return json.dumps(
            [
                {k: (v if isinstance(v, (str, int, float, bool)) else str(v)) for k, v in row.items()}
                for row in trimmed
            ],
            ensure_ascii=False,
        )


def _build_user_prompt(
    *,
    question: str,
    sql: str,
    rows: list[dict[str, Any]] | None,
    intent: str,
    user_role: str,
) -> str:
    settings = get_settings()
    role_label = "caregiver" if (user_role or "").lower() == "caregiver" else "elderly user"
    rows_json = _serialise_rows(rows or [], settings.rag_max_rows_in_context)
    row_count = len(rows or [])

    return (
        f"USER ROLE: {role_label}\n"
        f"INTENT: {intent or 'unspecified'}\n"
        f"QUESTION: {question.strip()}\n\n"
        "SQL (already executed safely on the user's own records):\n"
        f"{sql}\n\n"
        f"RETRIEVED ROWS ({row_count} row(s); JSON):\n"
        f"{rows_json}\n"
    )


async def generate_answer(
    *,
    question: str,
    sql: str,
    rows: list[dict[str, Any]] | None,
    intent: str,
    user_role: str,
) -> AnswerResult:
    user_prompt = _build_user_prompt(
        question=question,
        sql=sql,
        rows=rows,
        intent=intent,
        user_role=user_role,
    )

    raw = await ollama_client.chat(
        messages=[
            {"role": "system", "content": ANSWER_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        response_format="json",
    )

    parsed = _parse_json(raw)

    if not isinstance(parsed, dict):
        fallback = (
            "I could not summarise the records this time."
            if rows
            else "I could not find any matching records for that question."
        )
        return AnswerResult(answer=fallback, follow_ups=[], raw_response=raw)

    answer = str(parsed.get("answer") or "").strip()
    follow_ups_value = parsed.get("follow_ups")
    follow_ups: list[str] = []
    if isinstance(follow_ups_value, list):
        follow_ups = [str(item).strip() for item in follow_ups_value if str(item).strip()][:3]

    if not answer:
        answer = (
            "I could not find any matching records for that question."
            if not rows
            else "I retrieved some records but could not summarise them clearly."
        )

    return AnswerResult(answer=answer, follow_ups=follow_ups, raw_response=raw)
