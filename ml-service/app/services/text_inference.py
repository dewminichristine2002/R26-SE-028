from pathlib import Path
from typing import Any

from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    TextClassificationPipeline,
)

from app.config import get_settings
from app.utils.label_mapping import FINAL_LABELS

_pipeline: TextClassificationPipeline | None = None


def _build_keyword_fallback(text: str) -> dict[str, Any]:
    normalized = text.lower()
    emotion = "neutral"

    if any(token in normalized for token in ["alone", "lonely", "isolated"]):
        emotion = "lonely"
    elif any(token in normalized for token in ["worried", "stress", "anxious", "panic", "pressure"]):
        emotion = "stressed"
    elif any(token in normalized for token in ["sad", "down", "hurt", "cry"]):
        emotion = "sad"
    elif any(token in normalized for token in ["happy", "grateful", "good", "great"]):
        emotion = "happy"

    scores = {label: 0.05 for label in FINAL_LABELS}
    scores[emotion] = 0.8

    return {
        "emotion": emotion,
        "confidence": scores[emotion],
        "scores": scores,
        "sentiment_score": 0.65 if emotion == "happy" else 0.1 if emotion == "neutral" else -0.55,
        "loneliness_score": 0.84 if emotion == "lonely" else 0.14,
        "stress_score": 0.82 if emotion == "stressed" else 0.18,
    }


def _load_pipeline() -> TextClassificationPipeline | None:
    global _pipeline

    if _pipeline is not None:
        return _pipeline

    settings = get_settings()
    model_dir = Path(settings.text_model_dir)
    if not settings.use_model_artifacts or not model_dir.exists():
        return None

    tokenizer = AutoTokenizer.from_pretrained(model_dir.as_posix())
    model = AutoModelForSequenceClassification.from_pretrained(model_dir.as_posix())
    _pipeline = TextClassificationPipeline(
        model=model,
        tokenizer=tokenizer,
        return_all_scores=True,
        truncation=True,
    )
    return _pipeline


def predict_text(text: str) -> dict[str, Any]:
    pipeline = _load_pipeline()
    if pipeline is None:
        return _build_keyword_fallback(text)

    raw_scores = pipeline(text)[0]
    scores = {}
    for entry in raw_scores:
        label = entry["label"].lower().replace("label_", "")
        if label.isdigit():
            label = FINAL_LABELS[int(label)]
        scores[label] = float(entry["score"])

    emotion = max(scores, key=scores.get)

    return {
        "emotion": emotion,
        "confidence": scores[emotion],
        "scores": scores,
        "sentiment_score": 0.65 if emotion == "happy" else 0.1 if emotion == "neutral" else -0.55,
        "loneliness_score": scores.get("lonely", 0.1),
        "stress_score": scores.get("stressed", 0.1),
    }
