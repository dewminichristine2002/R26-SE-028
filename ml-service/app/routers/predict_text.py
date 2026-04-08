from fastapi import APIRouter

from app.schemas import PredictionResponse, TextPredictionRequest
from app.services.text_inference import predict_text

router = APIRouter(prefix="/predict", tags=["prediction"])


@router.post("/text", response_model=PredictionResponse)
def predict_text_route(payload: TextPredictionRequest) -> PredictionResponse:
    return PredictionResponse(**predict_text(payload.text))
