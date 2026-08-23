from fastapi import APIRouter, HTTPException

from app.schemas import PredictionResponse, VoicePredictionRequest


router = APIRouter(prefix="/predict", tags=["prediction"])


def _neutral_response() -> dict[str, object]:
    scores = {
        "happy": 0.05,
        "sad": 0.05,
        "angry": 0.05,
        "anxious": 0.05,
        "lonely": 0.05,
        "confused": 0.05,
        "neutral": 0.7,
    }
    return {
        "emotion": "neutral",
        "confidence": 0.7,
        "scores": scores,
        "sentiment_score": 0.1,
        "loneliness_score": 0.14,
        "stress_score": 0.18,
    }


@router.post("/voice", response_model=PredictionResponse)
def predict_voice_route(payload: VoicePredictionRequest) -> PredictionResponse:
    try:
        transcript = (payload.transcript or "").strip()
        if transcript:
            from app.services.text_inference import predict_text

            return PredictionResponse(**predict_text(transcript))
        return PredictionResponse(**_neutral_response())
    except Exception as exc:  # pragma: no cover - defensive guardrail for API reliability
        raise HTTPException(status_code=500, detail=f"Failed to predict voice emotion: {exc}") from exc
