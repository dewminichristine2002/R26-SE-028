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


class DiabetesPredictionRequest(BaseModel):
    age: int | None = None
    gender: str | None = None
    bloodSugar: float | None = None
    systolicBP: float | None = None
    diastolicBP: float | None = None
    height: float | None = None
    weight: float | None = None
    smokingStatus: str | None = None
    physicalActivityLevel: str | None = None
    familyHistory: str | None = None
    existingDiseaseHistory: list[str] | str | None = None
    medicationAdherence: float | None = None


class DiabetesPredictionResponse(BaseModel):
    riskType: str
    riskLevel: str
    confidence: int
    selectedAlgorithm: str
    factors: list[str] = Field(default_factory=list)
    probability: float
    featuresUsed: list[str] = Field(default_factory=list)
    derived: dict[str, float | int] = Field(default_factory=dict)


class StrokePredictionRequest(BaseModel):
    age: int | None = None
    gender: str | None = None
    bloodSugar: float | None = None
    avgGlucoseLevel: float | None = None
    systolicBP: float | None = None
    diastolicBP: float | None = None
    height: float | None = None
    weight: float | None = None
    bmi: float | None = None
    smokingStatus: str | None = None
    existingDiseaseHistory: list[str] | str | None = None
    hypertension: str | bool | int | None = None
    heartDisease: str | bool | int | None = None
    everMarried: str | bool | int | None = "Yes"
    workType: str | None = "Private"
    residenceType: str | None = "Urban"


class StrokePredictionResponse(BaseModel):
    riskType: str
    riskLevel: str
    confidence: int
    selectedAlgorithm: str
    factors: list[str] = Field(default_factory=list)
    probability: float
    featuresUsed: list[str] = Field(default_factory=list)
    derived: dict[str, float | int] = Field(default_factory=dict)


class HypertensionPredictionRequest(BaseModel):
    age: int | None = None
    gender: str | None = None
    bloodSugar: float | None = None
    glucose: float | None = None
    systolicBP: float | None = None
    diastolicBP: float | None = None
    height: float | None = None
    weight: float | None = None
    bmi: float | None = None
    smokingStatus: str | None = None
    physicalActivityLevel: str | None = None
    familyHistory: str | None = None
    existingDiseaseHistory: list[str] | str | None = None
    diabetes: str | bool | int | None = None
    cholesterol: float | None = None
    alcoholIntake: float | None = None
    stressLevel: float | None = None
    saltIntake: float | None = None
    sleepDuration: float | None = None
    heartRate: float | None = None
    ldl: float | None = None
    hdl: float | None = None
    triglycerides: float | None = None
    country: str | None = None
    educationLevel: str | None = None
    employmentStatus: str | None = None


class HypertensionPredictionResponse(BaseModel):
    riskType: str
    riskLevel: str
    confidence: int
    selectedAlgorithm: str
    factors: list[str] = Field(default_factory=list)
    probability: float
    featuresUsed: list[str] = Field(default_factory=list)
    derived: dict[str, float | int] = Field(default_factory=dict)
