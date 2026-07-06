import json
import re
import string
from pathlib import Path

import joblib
from fastapi import FastAPI
from pydantic import BaseModel


MODULE_DIR = Path(__file__).resolve().parent
MODEL_PATH = MODULE_DIR / "emotion_classifier.pkl"
VECTORIZER_PATH = MODULE_DIR / "tfidf_vectorizer.pkl"
METRICS_PATH = MODULE_DIR / "model_metrics.json"
MODEL_VERSION = "tfidf_logistic_regression_v1"
FALLBACK_CONFIDENCE = 0.5
PROJECT_CLASSES = ["neutral", "happiness", "anger", "cognitive_fog", "sadness", "anxiety"]

app = FastAPI(title="ElderMeds Emotion Classifier", version="1.0.0")


class PredictionRequest(BaseModel):
    text: str | None = None


def clean_text(text):
    text = "" if text is None else str(text)
    text = text.lower()
    text = text.translate(str.maketrans("", "", string.punctuation))
    text = re.sub(r"\s+", " ", text).strip()
    return text


def load_metrics():
    if not METRICS_PATH.exists():
        return None

    try:
        with open(METRICS_PATH, "r", encoding="utf-8") as metrics_file:
            return json.load(metrics_file)
    except (OSError, json.JSONDecodeError):
        return None


def load_artifact(path):
    if not path.exists():
        return None

    try:
        return joblib.load(path)
    except Exception:
        return None


model = load_artifact(MODEL_PATH)
vectorizer = load_artifact(VECTORIZER_PATH)
model_metrics = load_metrics()


def clamp_confidence(confidence):
    return max(0.0, min(1.0, float(confidence)))


def supported_classes():
    if model is not None and hasattr(model, "classes_"):
        model_classes = {str(label) for label in model.classes_}
        ordered_classes = [label for label in PROJECT_CLASSES if label in model_classes]
        extra_classes = sorted(model_classes.difference(PROJECT_CLASSES))
        return ordered_classes + extra_classes

    return PROJECT_CLASSES


def model_files_ready():
    return model is not None and vectorizer is not None


@app.get("/health")
def health():
    return {
        "success": True,
        "service": "emotion_classifier",
        "model_loaded": model is not None,
        "vectorizer_loaded": vectorizer is not None,
        "model_version": MODEL_VERSION,
    }


@app.post("/predict-emotion")
def predict_emotion(request: PredictionRequest):
    if not model_files_ready():
        return {
            "success": False,
            "reason": "model_files_missing",
        }

    cleaned_text = clean_text(request.text)
    if not cleaned_text:
        return {
            "success": False,
            "message": "Text is required and cannot be empty.",
        }

    features = vectorizer.transform([cleaned_text])
    emotion = str(model.predict(features)[0])
    confidence = FALLBACK_CONFIDENCE

    if hasattr(model, "predict_proba"):
        probabilities = model.predict_proba(features)[0]
        confidence = max(probabilities)

    return {
        "success": True,
        "emotion": emotion,
        "confidence": clamp_confidence(confidence),
        "source": "ml_model",
        "model_version": MODEL_VERSION,
        "supported_classes": supported_classes(),
    }
