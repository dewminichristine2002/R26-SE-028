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
LEGACY_LABELS = ["happy", "neutral", "sad", "lonely", "stressed", "anger"]


def _normalize_emotion(label: str) -> str:
    if label == "stressed":
        return "anxious"
    if label == "anger":
        return "angry"
    return label


def _contains_any(text: str, phrases: list[str]) -> bool:
    return any(phrase in text for phrase in phrases)


def _explicit_emotion_signal(text: str) -> str | None:
    if "not bad" in text:
        return None

    phrase_groups = [
        (
            "lonely",
            [
                "i am alone",
                "i feel alone",
                "i feel lonely",
                "nobody visited",
                "no one visited",
                "i miss my",
            ],
        ),
        (
            "sad",
            [
                "not good",
                "not feeling good",
                "not feel good",
                "not okay",
                "not ok",
                "not fine",
                "not well",
                "not better",
                "i feel bad",
                "feeling bad",
                "bad today",
                "very bad",
                "i am sad",
                "i feel sad",
            ],
        ),
        (
            "anxious",
            [
                "i am worried",
                "i feel worried",
                "i am anxious",
                "i feel anxious",
                "i am scared",
                "i feel scared",
                "i cannot sleep",
                "i can't sleep",
            ],
        ),
        (
            "confused",
            [
                "i am confused",
                "i feel confused",
                "i forgot",
                "i cannot remember",
                "i can't remember",
                "i do not remember",
                "i don't remember",
                "not sure",
            ],
        ),
        (
            "angry",
            [
                "i am angry",
                "i feel angry",
                "i am mad",
                "i feel mad",
                "i am frustrated",
                "i feel frustrated",
            ],
        ),
    ]

    for emotion, phrases in phrase_groups:
        if _contains_any(text, phrases):
            return emotion
    return None


def _build_keyword_fallback(text: str) -> dict[str, Any]:
    normalized = text.lower()
    emotion = _explicit_emotion_signal(normalized) or "neutral"

    if emotion != "neutral":
        pass
    elif any(token in normalized for token in ["alone", "lonely", "isolated"]):
        emotion = "lonely"
    elif any(token in normalized for token in ["angry", "anger", "mad", "furious", "frustrated", "annoyed", "irritated"]):
        emotion = "angry"
    elif any(token in normalized for token in ["confused", "confusion", "forget", "forgot", "unclear", "lost"]):
        emotion = "confused"
    elif any(token in normalized for token in ["worried", "stress", "anxious", "anxiety", "panic", "pressure", "nervous"]):
        emotion = "anxious"
    elif any(token in normalized for token in ["sad", "down", "hurt", "cry", "bad"]):
        emotion = "sad"
    elif "not good" not in normalized and any(token in normalized for token in ["happy", "grateful", "good", "great"]):
        emotion = "happy"

    scores = {label: 0.05 for label in FINAL_LABELS}
    scores[emotion] = 0.8

    return {
        "emotion": emotion,
        "confidence": scores[emotion],
        "scores": scores,
        "sentiment_score": 0.65 if emotion == "happy" else 0.1 if emotion == "neutral" else -0.55,
        "loneliness_score": 0.84 if emotion == "lonely" else 0.14,
        "stress_score": 0.82 if emotion in {"anxious", "angry"} else 0.58 if emotion == "confused" else 0.18,
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
    index_labels = LEGACY_LABELS if len(raw_scores) == len(LEGACY_LABELS) else FINAL_LABELS
    for entry in raw_scores:
        label = entry["label"].lower().replace("label_", "")
        if label.isdigit():
            label = index_labels[int(label)]
        label = _normalize_emotion(label)
        scores[label] = max(scores.get(label, 0.0), float(entry["score"]))

    emotion = max(scores, key=scores.get)

    return {
        "emotion": emotion,
        "confidence": scores[emotion],
        "scores": scores,
        "sentiment_score": 0.65 if emotion == "happy" else 0.1 if emotion == "neutral" else -0.55,
        "loneliness_score": scores.get("lonely", 0.1),
        "stress_score": max(scores.get("anxious", 0.1), scores.get("angry", 0.1), scores.get("confused", 0.1)),
    }
