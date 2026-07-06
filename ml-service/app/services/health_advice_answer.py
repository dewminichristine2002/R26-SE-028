"""Controlled health-risk RAG answer generation.

This endpoint is intentionally narrower than the general dashboard answerer:
it may only use trusted retrieved chunks plus the user's prediction context.
"""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass
from typing import Any

from app.services import ollama_client


SYSTEM_PROMPT = """
You are an elderly healthcare dashboard assistant.

Use only the retrieved trusted health guidance and the user's prediction result.
Do not diagnose diseases.
Do not prescribe medicine.
Do not suggest stopping, changing, or starting medicine.
Do not replace professional healthcare advice.
Explain in simple language.
For high risk or abnormal readings, recommend consulting a healthcare professional.
If the retrieved sources do not contain enough information, say reliable guidance is not available in the current knowledge base.

Write 3 to 6 short sentences. No markdown. No bullet points.
Output exactly one JSON object:
{"answer":"<simple answer>"}
""".strip()


_JSON_BLOCK_RE = re.compile(r"\{[\s\S]*\}")


@dataclass
class HealthAdviceResult:
    answer: str
    raw_response: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


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


def _build_user_prompt(
    *,
    question: str,
    risk_type: str,
    prediction: dict[str, Any],
    retrieved_chunks: list[dict[str, Any]],
    user_role: str,
) -> str:
    role_label = "caregiver" if (user_role or "").lower() == "caregiver" else "elderly user"
    chunks_json = json.dumps(retrieved_chunks[:8], ensure_ascii=False, default=str)
    prediction_json = json.dumps(prediction or {}, ensure_ascii=False, default=str)

    return (
        f"USER ROLE: {role_label}\n"
        f"RISK TYPE: {risk_type}\n"
        f"QUESTION: {question.strip()}\n\n"
        f"LATEST PREDICTION RESULT JSON:\n{prediction_json}\n\n"
        f"RETRIEVED TRUSTED GUIDANCE CHUNKS JSON:\n{chunks_json}\n\n"
        "Answer using only the prediction JSON and retrieved chunks."
    )


async def generate_health_advice(
    *,
    question: str,
    risk_type: str,
    prediction: dict[str, Any],
    retrieved_chunks: list[dict[str, Any]],
    user_role: str,
) -> HealthAdviceResult:
    if not retrieved_chunks:
        return HealthAdviceResult(
            answer="Reliable guidance is not available in the current knowledge base for this question.",
            raw_response="",
        )

    raw = await ollama_client.chat(
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": _build_user_prompt(
                    question=question,
                    risk_type=risk_type,
                    prediction=prediction,
                    retrieved_chunks=retrieved_chunks,
                    user_role=user_role,
                ),
            },
        ],
        response_format="json",
    )

    parsed = _parse_json(raw)
    answer = ""
    if isinstance(parsed, dict):
        answer = str(parsed.get("answer") or "").strip()

    if not answer:
        answer = "Reliable guidance is not available in the current knowledge base for this question."

    return HealthAdviceResult(answer=answer, raw_response=raw)
