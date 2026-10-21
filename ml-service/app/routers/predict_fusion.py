from fastapi import APIRouter, HTTPException

from app.schemas import FusionPredictionRequest, PredictionResponse
from app.utils.label_mapping import FINAL_LABELS


router = APIRouter(prefix="/predict", tags=["prediction"])


def _normalize_label(value: object) -> str:
    label = str(value or "neutral").strip().lower()
    if label == "stressed":
        return "anxious"
    if label == "anger":
        return "angry"
    return label if label in FINAL_LABELS else "neutral"


def _scores_from_prediction(prediction: dict[str, object] | None) -> dict[str, float]:
    scores = {label: 0.0 for label in FINAL_LABELS}
    if not prediction:
        return scores

    raw_scores = prediction.get("scores") or prediction.get("emotionProbabilities") or {}
    if isinstance(raw_scores, dict):
        for label, value in raw_scores.items():
            normalized = _normalize_label(label)
            try:
                scores[normalized] = max(scores[normalized], float(value))
            except (TypeError, ValueError):
                continue

    emotion = _normalize_label(prediction.get("emotion") or prediction.get("detectedEmotion"))
    try:
        confidence = float(prediction.get("confidence") or 0)
    except (TypeError, ValueError):
        confidence = 0.0
    scores[emotion] = max(scores[emotion], confidence)
    return scores


def _emoji_scores(emoji: str | None) -> dict[str, float]:
    scores = {label: 0.0 for label in FINAL_LABELS}
    value = str(emoji or "").lower()
    if not value:
        return scores
    if any(token in value for token in [":)", ":-)", "happy", "smile"]):
        scores["happy"] = 0.7
    elif any(token in value for token in [":(", ":-(", "sad"]):
        scores["sad"] = 0.7
    elif any(token in value for token in ["angry", "mad"]):
        scores["angry"] = 0.7
    elif any(token in value for token in ["worried", "anxious"]):
        scores["anxious"] = 0.7
    elif any(token in value for token in ["lonely", "alone"]):
        scores["lonely"] = 0.7
    elif any(token in value for token in ["confused", "forget"]):
        scores["confused"] = 0.7
    return scores


def _emotion_scores_to_response(scores: dict[str, float]) -> dict[str, object]:
    total = sum(max(0.0, value) for value in scores.values()) or 1.0
    normalized_scores = {
        label: round(max(0.0, float(scores.get(label, 0.0))) / total, 4)
        for label in FINAL_LABELS
    }
    emotion = max(normalized_scores, key=normalized_scores.get)
    confidence = float(normalized_scores[emotion])
    return {
        "emotion": emotion,
        "confidence": confidence,
        "scores": normalized_scores,
        "sentiment_score": 0.65 if emotion == "happy" else 0.1 if emotion == "neutral" else -0.55,
        "loneliness_score": 0.84 if emotion == "lonely" else 0.14,
        "stress_score": 0.82 if emotion in {"anxious", "angry"} else 0.58 if emotion == "confused" else 0.18,
    }


@router.post("/fusion", response_model=PredictionResponse)
def predict_fusion_route(payload: FusionPredictionRequest) -> PredictionResponse:
    try:
        text_scores = _scores_from_prediction(payload.text_prediction)
        voice_scores = _scores_from_prediction(payload.voice_prediction)
        emoji_scores = _emoji_scores(payload.emoji)
        fused = {
            label: text_scores[label] * 0.7 + voice_scores[label] * 0.2 + emoji_scores[label] * 0.1
            for label in FINAL_LABELS
        }
        return PredictionResponse(**_emotion_scores_to_response(fused))
    except Exception as exc:  # pragma: no cover - defensive guardrail for API reliability
        raise HTTPException(status_code=500, detail=f"Failed to fuse emotion predictions: {exc}") from exc
