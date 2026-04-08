from typing import Any

from app.utils.audio_features import extract_audio_features


def predict_voice(audio_path: str | None, transcript: str | None = None) -> dict[str, Any]:
    if audio_path:
        features = extract_audio_features(audio_path)
        emotion = "stressed" if features["rms_mean"] > 0.08 else "neutral"
        confidence = 0.68
    else:
        emotion = "stressed" if transcript and "worried" in transcript.lower() else "neutral"
        confidence = 0.55

    scores = {
        "happy": 0.05,
        "neutral": 0.15,
        "sad": 0.1,
        "lonely": 0.05,
        "stressed": 0.15,
    }
    scores[emotion] = confidence

    return {
        "emotion": emotion,
        "confidence": confidence,
        "scores": scores,
        "sentiment_score": 0.0,
        "loneliness_score": 0.1,
        "stress_score": 0.78 if emotion == "stressed" else 0.22,
    }
