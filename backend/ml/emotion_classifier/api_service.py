import json
import re
import string
from pathlib import Path

import joblib
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict


MODULE_DIR = Path(__file__).resolve().parent
PIPELINE_PATH = MODULE_DIR / "emotion_pipeline.pkl"
METADATA_PATH = MODULE_DIR / "selected_model_metadata.json"
PROJECT_CLASSES = [
    "happiness", "sadness", "loneliness", "anxiety", "anger",
    "cognitive_fog", "neutral",
]

app = FastAPI(title="ElderMeds Emotion Classifier", version="2.0.0")


class PredictionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str | None = None


def clean_text(text):
    normalized = "" if text is None else str(text).lower()
    normalized = normalized.translate(str.maketrans("", "", string.punctuation))
    return re.sub(r"\s+", " ", normalized).strip()


def load_json(path):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError):
        return None


def load_pipeline(path):
    try:
        return joblib.load(path)
    except Exception:
        return None


pipeline = load_pipeline(PIPELINE_PATH)
metadata = load_json(METADATA_PATH)


def model_files_ready():
    if pipeline is None or metadata is None:
        return False
    classes = set(getattr(pipeline, "classes_", []))
    return classes == set(PROJECT_CLASSES) and metadata.get("supported_classes") == PROJECT_CLASSES


@app.get("/health")
def health():
    ready = model_files_ready()
    return {
        "success": ready,
        "service": "emotion_classifier",
        "model_loaded": pipeline is not None,
        "metadata_loaded": metadata is not None,
        "ready": ready,
        "model_version": metadata.get("model_version") if metadata else None,
        "supported_classes": PROJECT_CLASSES,
    }


@app.post("/predict-emotion")
def predict_emotion(request: PredictionRequest):
    if not model_files_ready():
        raise HTTPException(status_code=503, detail="Emotion model artifacts are missing, invalid, or incompatible.")
    cleaned_text = clean_text(request.text)
    if not cleaned_text:
        raise HTTPException(status_code=422, detail="Text is required and cannot be empty.")

    probabilities = pipeline.predict_proba([cleaned_text])[0]
    winning_index = int(probabilities.argmax())
    emotion = str(pipeline.classes_[winning_index])
    confidence = float(probabilities[winning_index])
    if emotion not in PROJECT_CLASSES:
        raise HTTPException(status_code=503, detail="Emotion model returned an unsupported class.")

    return {
        "success": True,
        "emotion": emotion,
        "confidence": max(0.0, min(1.0, confidence)),
        "source": "ml_model",
        "model_version": metadata["model_version"],
        "supported_classes": PROJECT_CLASSES,
    }
