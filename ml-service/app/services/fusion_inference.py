from typing import Any


def predict_fusion(
    *,
    text_prediction: dict[str, Any],
    voice_prediction: dict[str, Any] | None,
    emoji: str | None,
    history_features: dict[str, Any],
) -> dict[str, Any]:
    text_scores = text_prediction.get("scores", {})
    fused_scores = dict(text_scores)

    if voice_prediction:
        for label, score in voice_prediction.get("scores", {}).items():
            fused_scores[label] = fused_scores.get(label, 0) * 0.7 + float(score) * 0.3

    if emoji:
        emoji_key = emoji.lower().strip()
        if emoji_key in fused_scores:
            fused_scores[emoji_key] = fused_scores.get(emoji_key, 0) + 0.1

    if history_features.get("negativeMoodCount7d", 0) >= 3:
        fused_scores["stressed"] = fused_scores.get("stressed", 0) + 0.05
        fused_scores["lonely"] = fused_scores.get("lonely", 0) + 0.05

    emotion = max(fused_scores, key=fused_scores.get)
    confidence = float(fused_scores[emotion])

    return {
        "emotion": emotion,
        "confidence": confidence,
        "scores": fused_scores,
        "sentiment_score": float(text_prediction.get("sentiment_score", 0.0)),
        "loneliness_score": float(fused_scores.get("lonely", 0.1)),
        "stress_score": float(fused_scores.get("stressed", 0.1)),
    }
