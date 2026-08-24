import re
import string
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict

from model_runtime import PROJECT_CLASSES, load_runtime


MODULE_DIR = Path(__file__).resolve().parent
app = FastAPI(title="ElderMeds Emotion Classifier", version="4.0.0")


class PredictionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str | None = None


def clean_text(text):
    normalized = "" if text is None else str(text).lower()
    normalized = normalized.translate(str.maketrans("", "", string.punctuation))
    return re.sub(r"\s+", " ", normalized).strip()


runtime = load_runtime()


def model_files_ready():
    return runtime.ready and set(runtime.classes_) == set(PROJECT_CLASSES)


@app.get("/health")
def health():
    ready = model_files_ready()
    return {
        "success": ready,
        "service": "emotion_classifier",
        "model_loaded": runtime.classifier is not None,
        "metadata_loaded": runtime.metadata is not None,
        "ready": ready,
        "model_version": runtime.model_version,
        "supported_classes": PROJECT_CLASSES,
        "error": runtime.error,
    }


@app.post("/predict-emotion")
def predict_emotion(request: PredictionRequest):
    if not model_files_ready():
        raise HTTPException(status_code=503, detail="Emotion model artifacts are missing, invalid, or incompatible.")
    cleaned_text = clean_text(request.text)
    if not cleaned_text:
        raise HTTPException(status_code=422, detail="Text is required and cannot be empty.")

    probabilities = runtime.predict_proba([request.text.strip()])[0]
    winning_index = int(probabilities.argmax())
    emotion = str(runtime.classes_[winning_index])
    confidence = float(probabilities[winning_index])
    if emotion not in PROJECT_CLASSES:
        raise HTTPException(status_code=503, detail="Emotion model returned an unsupported class.")

    return {
        "success": True,
        "emotion": emotion,
        "confidence": max(0.0, min(1.0, confidence)),
        "source": "ml_model",
        "model_version": runtime.model_version,
        "supported_classes": PROJECT_CLASSES,
    }
