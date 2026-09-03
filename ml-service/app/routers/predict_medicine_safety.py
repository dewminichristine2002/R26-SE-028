from fastapi import APIRouter, HTTPException

from app.schemas import MedicineSafetyPredictionRequest, MedicineSafetyPredictionResponse
from app.services.medicine_safety_inference import predict_medicine_safety

router = APIRouter(prefix="/predict", tags=["prediction"])


@router.post("/medicine-safety", response_model=MedicineSafetyPredictionResponse)
def predict_medicine_safety_route(
    payload: MedicineSafetyPredictionRequest,
) -> MedicineSafetyPredictionResponse:
    try:
        result = predict_medicine_safety(payload.model_dump())
        return MedicineSafetyPredictionResponse(**result)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"Failed to predict medicine safety risk: {exc}") from exc
