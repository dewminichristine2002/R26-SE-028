from fastapi import APIRouter, HTTPException

from app.schemas import HypertensionPredictionRequest, HypertensionPredictionResponse
from app.services.hypertension_inference import predict_hypertension

router = APIRouter(prefix="/predict", tags=["prediction"])


@router.post("/hypertension", response_model=HypertensionPredictionResponse)
def predict_hypertension_route(payload: HypertensionPredictionRequest) -> HypertensionPredictionResponse:
    try:
        result = predict_hypertension(payload.model_dump())
        return HypertensionPredictionResponse(**result)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - defensive guardrail for API reliability
        raise HTTPException(status_code=500, detail=f"Failed to predict hypertension risk: {exc}") from exc
