from typing import Any

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    service: str


class TextPredictionRequest(BaseModel):
    text: str = Field(..., min_length=1)


class VoicePredictionRequest(BaseModel):
    audio_path: str | None = None
    transcript: str | None = None


class FusionPredictionRequest(BaseModel):
    text_prediction: dict[str, Any]
    voice_prediction: dict[str, Any] | None = None
    emoji: str | None = None
    history_features: dict[str, Any] = Field(default_factory=dict)


class PredictionResponse(BaseModel):
    emotion: str
    confidence: float
    scores: dict[str, float]
    sentiment_score: float
    loneliness_score: float
    stress_score: float
