from fastapi import APIRouter

from app.schemas import PredictionResponse, VoicePredictionRequest
from app.services.voice_inference import predict_voice

router = APIRouter(prefix="/predict", tags=["prediction"])


@router.post("/voice", response_model=PredictionResponse)
def predict_voice_route(payload: VoicePredictionRequest) -> PredictionResponse:
    return PredictionResponse(**predict_voice(payload.audio_path, payload.transcript))
