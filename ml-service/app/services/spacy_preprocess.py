"""spaCy-based preprocessing for the conversational dashboard.

The output of this module is a *normalised* version of the user's question
(lowercased, stop-words removed, lemmatised) plus a small set of structured
hints (key tokens, recognised entities, time expressions). These hints are
appended to the LLM prompt as auxiliary signal but the original question is
still passed through verbatim so the LLM can answer naturally.

If the spaCy model is missing we degrade gracefully: the original question
is returned and the hints object is empty.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any

try:  # pragma: no cover - import is exercised by tests via the cached loader
    import spacy
    from spacy.language import Language
except Exception:  # noqa: BLE001
    spacy = None  # type: ignore[assignment]
    Language = Any  # type: ignore[assignment,misc]

from app.config import get_settings


@dataclass
class PreprocessResult:
    original: str
    normalised: str
    keywords: list[str] = field(default_factory=list)
    entities: list[dict[str, str]] = field(default_factory=list)
    time_expressions: list[str] = field(default_factory=list)


@lru_cache(maxsize=1)
def _load_pipeline() -> Language | None:
    if spacy is None:
        return None
    settings = get_settings()
    try:
        return spacy.load(settings.spacy_model)
    except Exception:  # noqa: BLE001
        # Fail open \u2014 we still want the assistant to work without spaCy.
        return None


_TIME_HINT_TOKENS = {
    "today",
    "yesterday",
    "tomorrow",
    "week",
    "weekly",
    "weekend",
    "month",
    "monthly",
    "morning",
    "afternoon",
    "evening",
    "night",
    "recent",
    "recently",
    "lately",
    "now",
    "currently",
}


def preprocess(question: str) -> PreprocessResult:
    text = (question or "").strip()
    if not text:
        return PreprocessResult(original="", normalised="")

    nlp = _load_pipeline()
    if nlp is None:
        return PreprocessResult(original=text, normalised=text.lower())

    doc = nlp(text)

    keywords: list[str] = []
    seen: set[str] = set()
    for token in doc:
        if token.is_stop or token.is_punct or token.is_space:
            continue
        if token.like_num and token.lemma_.isdigit():
            continue
        lemma = token.lemma_.lower().strip()
        if not lemma or lemma in seen or len(lemma) <= 2:
            continue
        seen.add(lemma)
        keywords.append(lemma)

    entities = [
        {"text": ent.text, "label": ent.label_}
        for ent in doc.ents
        if ent.label_ in {"DATE", "TIME", "PERSON", "ORG", "GPE", "PRODUCT", "QUANTITY"}
    ]

    time_expressions: list[str] = []
    for ent in doc.ents:
        if ent.label_ in {"DATE", "TIME"}:
            time_expressions.append(ent.text)
    for token in doc:
        if token.lemma_.lower() in _TIME_HINT_TOKENS and token.text not in time_expressions:
            time_expressions.append(token.text)

    normalised_tokens = [
        token.lemma_.lower()
        for token in doc
        if not (token.is_stop or token.is_punct or token.is_space)
    ]

    return PreprocessResult(
        original=text,
        normalised=" ".join(normalised_tokens) or text.lower(),
        keywords=keywords[:20],
        entities=entities[:10],
        time_expressions=time_expressions[:5],
    )
