from fastapi import APIRouter, HTTPException

from app.schemas import DiabetesPredictionRequest, DiabetesPredictionResponse
from app.services.diabetes_inference import predict_diabetes

router = APIRouter(prefix="/predict", tags=["prediction"])


@router.post("/diabetes", response_model=DiabetesPredictionResponse)
def predict_diabetes_route(payload: DiabetesPredictionRequest) -> DiabetesPredictionResponse:
    try:
        result = predict_diabetes(payload.model_dump())
        return DiabetesPredictionResponse(**result)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - defensive guardrail for API reliability
        raise HTTPException(status_code=500, detail=f"Failed to predict diabetes risk: {exc}") from exc
