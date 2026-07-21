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
        "I can only answer questions about your medicines, doses, allergies, "
        "mood check-ins, cognitive activities and caregiver alerts."
    ),
    raw_response="",
)


def _result(sql: str, intent: str) -> Nl2SqlResult:
    return Nl2SqlResult(
        sql=sql,
        params=["$1"],
        intent=intent,
        fallback=False,
        fallback_message="",
        raw_response="rule_based",
    )


def _fallback(message: str, intent: str = "out_of_scope") -> Nl2SqlResult:
    return Nl2SqlResult(
        sql="",
        params=[],
        intent=intent,
        fallback=True,
        fallback_message=message,
        raw_response="rule_based",
    )


def _extract_medicine_lookup_term(question: str) -> str | None:
    """Best-effort medicine term for saved allergy-card lookup examples."""
    text = re.sub(r"\s+", " ", question or "").strip().lower()
    if not text:
        return None

    quoted = re.search(r"[\"'`]([^\"'`]{2,80})[\"'`]", text)
    if quoted:
        text = quoted.group(1)

    stop_words = {
        "why",
        "was",
        "were",
        "is",
        "are",
        "marked",
        "dangerous",
        "risky",
        "safe",
        "warning",
        "risk",
        "allergy",
        "allergies",
        "reaction",
        "reactions",
        "based",
        "on",
        "with",
        "my",
        "for",
        "me",
        "can",
        "should",
        "may",
        "take",
        "safely",
        "okay",
        "ok",
        "mother",
        "mum",
        "father",
        "dad",
        "elder",
        "patient",
        "medicine",
        "medication",
        "tablet",
        "pill",
        "saved",
        "check",
        "result",
        "results",
        "reason",
        "reasons",
        "factor",
        "factors",
    }
    parts = [
        part
        for part in re.findall(r"[a-z][a-z0-9-]{1,}", text)
        if part not in stop_words
    ]
    if not parts:
        return None
    return " ".join(parts[:3])


def _rule_based_sql(question: str) -> Nl2SqlResult | None:
    """Fast path for common caregiver wording that local LLMs often overthink."""
    normalized = re.sub(r"\s+", " ", (question or "").lower()).strip()
    if not normalized:
        return None

    external_action_patterns = [
        r"\b(check|read|scan|look at|look on|inspect)\b.*\b(packaging|package|label|box|bottle)\b",
        r"\b(contact|call|message|consult|ask)\b.*\b(doctor|pharmacist|clinic)\b",
    ]
    if any(re.search(pattern, normalized) for pattern in external_action_patterns):
        return _fallback(
            "I can't check packaging or contact a doctor from here, but I can show medication timing saved in the app.",
            "external_action_unavailable",
        )

    asks_missed_dose = re.search(r"\b(miss|missed|not[-\s]?taken|did(?:n't| not)\s+take|forget)\b", normalized)
    if asks_missed_dose and re.search(r"\b(medicine|medication|dose|tablet|pill|meds?)\b", normalized):
        if re.search(r"\b(today|tonight|this morning|this afternoon|this evening)\b", normalized):
            return _result(
                "SELECT um.medicine_name, mse.event_time, mse.schedule_slot "
                "FROM medication_status_events mse "
                "LEFT JOIN user_medications um ON um.id = mse.medication_id "
                "WHERE mse.user_id = $1 AND mse.status = 'not-taken' "
                "AND mse.event_time >= NOW() - INTERVAL '1 day' "
                "ORDER BY mse.event_time DESC LIMIT 50",
                "missed_doses_1d",
            )
        return _result(
            "SELECT um.medicine_name, mse.event_time, mse.schedule_slot "
            "FROM medication_status_events mse "
            "LEFT JOIN user_medications um ON um.id = mse.medication_id "
            "WHERE mse.user_id = $1 AND mse.status = 'not-taken' "
            "AND mse.event_time >= NOW() - INTERVAL '7 days' "
            "ORDER BY mse.event_time DESC LIMIT 50",
            "missed_doses_7d",
        )

    asks_med_schedule = (
        re.search(r"\b(next|scheduled|schedule|timing|time|when)\b", normalized)
        and re.search(r"\b(dose|medicine|medication|tablet|pill|meds?)\b", normalized)
    )
    if asks_med_schedule:
        return _result(
            "SELECT um.medicine_name, um.intake_timing, um.take_with, "
            "um.daily_amount, um.dosage_mg, ur.breakfast_time, ur.lunch_time, "
            "ur.dinner_time, ur.sleep_time "
            "FROM user_medications um "
            "LEFT JOIN user_routines ur ON ur.user_id = um.user_id "
            "WHERE um.user_id = $1 "
            "ORDER BY um.created_at DESC LIMIT 50",
            "medication_schedule",
        )

    asks_routine = re.search(r"\b(schedule|routine|timetable|meal\s+time|breakfast|lunch|dinner|sleep)\b", normalized)
    if asks_routine:
        return _result(
            "SELECT ur.breakfast_time, ur.lunch_time, ur.dinner_time, ur.sleep_time "
            "FROM user_routines ur "
            "WHERE ur.user_id = $1 LIMIT 1",
            "routine",
        )

    asks_allergy_profile = re.search(r"\b(allergy|allergies|allergic)\b", normalized) and re.search(
        r"\b(what|which|known|recorded|profile|have|has|list|show)\b",
        normalized,
    )
    if asks_allergy_profile and not re.search(r"\b(risky|risk|dangerous|safe|warning|why|reason|factor)\b", normalized):
        return _result(
            "SELECT has_medicine_allergy, known_allergies_text, reaction_symptoms_text, "
            "avoided_medicines_text, suspected_medicine_names_text, antibiotic_painkiller_reaction "
            "FROM user_allergy_profiles WHERE user_id = $1 LIMIT 1",
            "allergy_profile_lookup",
        )

    asks_medicine_safety_lookup = re.search(
        r"\b(allergy|allergies|allergic|reaction|safe|safety|risky|risk|dangerous|warning|can\s+i\s+take|should\s+i\s+take|may\s+i\s+take)\b",
        normalized,
    )
    if asks_medicine_safety_lookup and re.search(r"\b(any|which|saved|current|recent|my)\b.*\b(medicines|medications|tablets|pills)\b", normalized):
        return _result(
            "SELECT medicine_name, risk_level, risk_score, explanation, recommendation, updated_at "
            "FROM allergy_cards "
            "WHERE user_id = $1 AND risk_level IN ('Warning', 'Dangerous') "
            "ORDER BY risk_score DESC, updated_at DESC LIMIT 20",
            "saved_medicine_safety_risks",
        )

    if asks_medicine_safety_lookup and not re.search(r"\b(why|reason|reasons|factor|factors|marked|made)\b", normalized):
        medicine_term = _extract_medicine_lookup_term(normalized)
        safe_medicine_term = medicine_term.replace("'", "''") if medicine_term else ""
        medicine_filter = (
            f"AND LOWER(medicine_name) LIKE '%{safe_medicine_term}%' "
            if medicine_term
            else ""
        )
        return _result(
            "SELECT medicine_name, risk_level, risk_score, explanation, recommendation, updated_at "
            "FROM allergy_cards "
            f"WHERE user_id = $1 {medicine_filter}"
            "ORDER BY updated_at DESC LIMIT 10",
            "medicine_safety_lookup",
        )

    asks_allergy_factor = re.search(r"\b(allergy|allergies|allergic|risk|dangerous|warning)\b", normalized) and re.search(
        r"\b(why|reason|reasons|factor|factors|marked|made)\b",
        normalized,
    )
    if asks_allergy_factor:
        medicine_term = _extract_medicine_lookup_term(normalized)
        safe_medicine_term = medicine_term.replace("'", "''") if medicine_term else ""
        medicine_filter = (
            f"AND LOWER(ac.medicine_name) LIKE '%{safe_medicine_term}%' "
            if medicine_term
            else ""
        )
        return _result(
            "SELECT ac.medicine_name, ac.risk_level, ac.risk_score, "
            "acrf.factor_label, acrf.severity, acrf.score "
            "FROM allergy_cards ac "
            "JOIN allergy_card_risk_factors acrf ON acrf.allergy_card_id = ac.id "
            f"WHERE ac.user_id = $1 {medicine_filter}"
            "ORDER BY ac.updated_at DESC, acrf.score DESC LIMIT 20",
            "allergy_risk_factors",
        )

    asks_emotional_alerts = re.search(r"\b(alert|alerts|notification|notifications|warning|warnings)\b", normalized) and re.search(
        r"\b(mood|emotion|emotional|stress|stressed|lonely|loneliness|cognitive|memory|check[-\s]?ins?)\b",
        normalized,
    )
    if asks_emotional_alerts:
        return _result(
            "SELECT title, message, alert_type, severity, status, created_at "
            "FROM emotional_support_caregiver_alerts "
            "WHERE elder_user_id = $1 "
            "ORDER BY created_at DESC LIMIT 20",
            "emotional_support_alerts",
        )

    asks_cognitive_activity = re.search(
        r"\b(cognitive|memory|activity|activities|brain|orientation|breathing|reflection)\b",
        normalized,
    )
    if asks_cognitive_activity and re.search(r"\b(completed|complete|done|attempt|attempted|score|skipped|finished)\b", normalized):
        return _result(
            "SELECT eca.title AS activity_title, eca.activity_type, "
            "esaa.completion_status, esaa.score::float AS score, "
            "esaa.started_at, esaa.completed_at "
            "FROM emotional_support_activity_attempts esaa "
            "LEFT JOIN emotional_support_cognitive_activities eca ON eca.id = esaa.activity_id "
            "WHERE esaa.elder_user_id = $1 "
            "ORDER BY esaa.started_at DESC LIMIT 20",
            "cognitive_activity_attempts",
        )

    if asks_cognitive_activity and re.search(r"\b(recommended|recommend|suggested|suggest|given|assigned|last|recent|next)\b", normalized):
        return _result(
            "SELECT ess.detected_emotion, ess.risk_level, "
            "eca.title AS activity_title, eca.activity_type, eca.difficulty, "
            "eca.prompt, ess.created_at "
            "FROM emotional_support_emotion_sessions ess "
            "LEFT JOIN emotional_support_cognitive_activities eca ON eca.id = ess.activity_id "
            "WHERE ess.elder_user_id = $1 AND ess.activity_id IS NOT NULL "
            "ORDER BY ess.created_at DESC LIMIT 10",
            "recommended_cognitive_activities",
        )

    asks_support_reply = re.search(r"\b(reply|response|said|support|intervention|follow[-\s]?up)\b", normalized) and re.search(
        r"\b(mood|emotion|emotional|lonely|sad|anxious|confused|check[-\s]?in)\b",
        normalized,
    )
    if asks_support_reply:
        return _result(
            "SELECT ess.detected_emotion, ess.risk_level, esi.response_type, "
            "esi.response_text, esi.follow_up_prompt, ess.created_at "
            "FROM emotional_support_emotion_sessions ess "
            "JOIN emotional_support_interventions esi ON esi.session_id = ess.id "
            "WHERE ess.elder_user_id = $1 "
            "ORDER BY ess.created_at DESC LIMIT 5",
            "latest_emotional_intervention",
        )

    asks_emotional_interaction_history = re.search(
        r"\b(interaction|interactions|conversation|conversations|chat|history|support history)\b",
        normalized,
    ) and re.search(
        r"\b(mood|emotion|emotional|stress|lonely|loneliness|sad|sadness|anxious|confused|cognitive|support|elder|mother|father|parent)\b",
        normalized,
    )
    if asks_emotional_interaction_history:
        return _result(
            "SELECT ess.detected_emotion, ess.risk_level, "
            "cl.actor_type, cl.message_type, cl.detected_emotion AS log_detected_emotion, cl.created_at "
            "FROM chat_logs cl "
            "JOIN emotional_support_emotion_sessions ess ON ess.id = cl.session_id AND ess.elder_user_id = $1 "
            "WHERE cl.elder_user_id = $1 "
            "ORDER BY cl.created_at DESC LIMIT 30",
            "emotional_interaction_history",
        )

    asks_repeated_emotional_concerns = re.search(
        r"\b(repeated|repeat|recurring|pattern|patterns|concern|concerns|changes|changed|trend|trends)\b",
        normalized,
    ) and re.search(
        r"\b(mood|emotion|emotional|stress|lonely|loneliness|sad|sadness|anxious|confused|cognitive|support|elder|mother|father|parent)\b",
        normalized,
    )
    if asks_repeated_emotional_concerns:
        return _result(
            "SELECT detected_emotion, COUNT(*)::int AS total, "
            "MAX(created_at) AS most_recent_at, "
            "AVG(stress_score)::float AS avg_stress, "
            "AVG(loneliness_score)::float AS avg_loneliness "
            "FROM emotional_support_emotion_sessions "
            "WHERE elder_user_id = $1 AND created_at >= NOW() - INTERVAL '14 days' "
            "GROUP BY detected_emotion ORDER BY total DESC, most_recent_at DESC LIMIT 20",
            "repeated_emotional_concerns",
        )

    asks_mood = re.search(
        r"\b(mood|emotion|emotions|stress|stressed|lonely|loneliness|check[-\s]?ins?)\b",
        normalized,
    )
    if asks_mood:
        return _result(
            "SELECT detected_emotion, COUNT(*)::int AS total, "
            "AVG(stress_score)::float AS avg_stress, "
            "AVG(loneliness_score)::float AS avg_loneliness "
            "FROM emotional_support_emotion_sessions "
            "WHERE elder_user_id = $1 AND created_at >= NOW() - INTERVAL '7 days' "
            "GROUP BY detected_emotion ORDER BY total DESC LIMIT 20",
            "mood_trend_7d",
        )

    asks_alerts = re.search(r"\b(alert|alerts|notification|notifications|warning|warnings)\b", normalized)
    if asks_alerts:
        return _result(
            "SELECT title, message, created_at, COALESCE(is_read, FALSE) AS is_read "
            "FROM caregiver_alerts WHERE user_id = $1 "
            "ORDER BY created_at DESC LIMIT 20",
            "caregiver_alerts_recent",
        )

    asks_stock_remaining = re.search(r"\b(stock|remaining|left|supply|how much)\b", normalized) and not re.search(
        r"\b(low|refill|run out|running out)\b",
        normalized,
    )
    if asks_stock_remaining:
        return _result(
            "SELECT um.medicine_name, COALESCE(ms.current_quantity, um.total_quantity)::float AS pills_left, "
            "um.daily_amount::float AS daily_amount, "
            "(COALESCE(ms.current_quantity, um.total_quantity) / NULLIF(um.daily_amount, 0))::float AS days_left "
            "FROM user_medications um "
            "LEFT JOIN medication_stock ms ON ms.medication_id = um.id "
            "WHERE um.user_id = $1 "
            "ORDER BY pills_left ASC LIMIT 50",
            "stock_remaining",
        )

    asks_low_stock = (
        re.search(r"\b(low|refill|run out|running out)\b", normalized)
        and re.search(r"\b(medicine|medicines|medication|medications|tablet|tablets|pill|pills|meds?)\b", normalized)
    )
    if asks_low_stock:
        return _result(
            "SELECT um.medicine_name, COALESCE(ms.current_quantity, um.total_quantity)::float AS pills_left, "
            "um.daily_amount::float AS daily_amount "
            "FROM user_medications um "
            "LEFT JOIN medication_stock ms ON ms.medication_id = um.id "
            "WHERE um.user_id = $1 "
            "AND COALESCE(ms.current_quantity, um.total_quantity) / NULLIF(um.daily_amount, 0) <= 7 "
            "ORDER BY pills_left ASC LIMIT 20",
            "low_stock",
        )

    asks_current_meds = re.search(r"\b(what|which|list|show|tell|current|taking|takes)\b", normalized) and re.search(
        r"\b(medicine|medicines|medication|medications|tablet|tablets|pill|pills|meds?)\b", normalized
    )
    if asks_current_meds:
        return _result(
            "SELECT medicine_name, dose_form, dosage_mg, daily_amount, intake_timing "
            "FROM user_medications WHERE user_id = $1 "
            "ORDER BY medicine_name ASC LIMIT 50",
            "current_medications",
        )

    return None


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

    rule_based = _rule_based_sql(question)
    if rule_based is not None:
        logger.info(
            "[NL2SQL] rule-based result question=%r role=%s intent=%s fallback=%s",
            question,
            user_role,
            rule_based.intent,
            rule_based.fallback,
        )
        return rule_based

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
