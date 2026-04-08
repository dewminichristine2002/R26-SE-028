from fastapi import APIRouter

from app.schemas import FusionPredictionRequest, PredictionResponse
from app.services.fusion_inference import predict_fusion

router = APIRouter(prefix="/predict", tags=["prediction"])


@router.post("/fusion", response_model=PredictionResponse)
def predict_fusion_route(payload: FusionPredictionRequest) -> PredictionResponse:
    return PredictionResponse(
        **predict_fusion(
            text_prediction=payload.text_prediction,
            voice_prediction=payload.voice_prediction,
            emoji=payload.emoji,
            history_features=payload.history_features,
        )
    )
