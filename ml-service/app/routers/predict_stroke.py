from fastapi import APIRouter, HTTPException

from app.schemas import StrokePredictionRequest, StrokePredictionResponse
from app.services.stroke_inference import predict_stroke

router = APIRouter(prefix="/predict", tags=["prediction"])


@router.post("/stroke", response_model=StrokePredictionResponse)
def predict_stroke_route(payload: StrokePredictionRequest) -> StrokePredictionResponse:
    try:
        result = predict_stroke(payload.model_dump())
        return StrokePredictionResponse(**result)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - defensive guardrail for API reliability
        raise HTTPException(status_code=500, detail=f"Failed to predict stroke risk: {exc}") from exc
