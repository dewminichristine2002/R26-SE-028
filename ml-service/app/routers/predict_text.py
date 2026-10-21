from fastapi import APIRouter, HTTPException

from app.schemas import PredictionResponse, TextPredictionRequest


router = APIRouter(prefix="/predict", tags=["prediction"])


@router.post("/text", response_model=PredictionResponse)
def predict_text_route(payload: TextPredictionRequest) -> PredictionResponse:
    try:
        from app.services.text_inference import predict_text

        result = predict_text(payload.text)
        return PredictionResponse(**result)
    except Exception as exc:  # pragma: no cover - defensive guardrail for API reliability
        raise HTTPException(status_code=500, detail=f"Failed to predict text emotion: {exc}") from exc
