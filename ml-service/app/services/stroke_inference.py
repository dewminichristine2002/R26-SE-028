from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

MODEL_DIR = Path("app/models")
MODEL_PATH = MODEL_DIR / "stroke_model.pkl"
PREPROCESSOR_PATH = MODEL_DIR / "stroke_preprocessor.pkl"
METADATA_PATH = MODEL_DIR / "stroke_model_metadata.json"

_model = None
_preprocessor = None
_metadata: dict[str, Any] | None = None


def _load_artifacts() -> tuple[Any, Any, dict[str, Any]]:
    global _model, _preprocessor, _metadata

    if _model is not None and _preprocessor is not None and _metadata is not None:
        return _model, _preprocessor, _metadata

    if not MODEL_PATH.exists() or not PREPROCESSOR_PATH.exists() or not METADATA_PATH.exists():
        raise FileNotFoundError(
            "Stroke model artifacts are missing. Run training/stroke/train_stroke_model.py first."
        )

    _model = joblib.load(MODEL_PATH)
    _preprocessor = joblib.load(PREPROCESSOR_PATH)
    _metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
    return _model, _preprocessor, _metadata


def _safe_float(value: Any, fallback: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    if np.isnan(number):
        return fallback
    return number


def _to_binary(value: Any) -> int:
    if isinstance(value, bool):
        return 1 if value else 0
    normalized = str(value or "").strip().lower()
    return 1 if normalized in {"1", "true", "yes", "y", "current", "former", "high"} else 0


def _compute_bmi(height_cm: Any, weight_kg: Any) -> float:
    height = _safe_float(height_cm)
    weight = _safe_float(weight_kg)
    if height <= 0 or weight <= 0:
        return 0.0
    meters = height / 100.0
    return round(weight / (meters * meters), 2)


def _normalize_history(existing_disease_history: Any) -> list[str]:
    if isinstance(existing_disease_history, list):
        return [str(item).strip().lower() for item in existing_disease_history if str(item).strip()]
    if existing_disease_history is None:
        return []
    return [item.strip().lower() for item in str(existing_disease_history).split(",") if item.strip()]


def _contains_term(values: list[str], terms: list[str]) -> bool:
    joined = " ".join(values).lower()
    return any(term in joined for term in terms)


def _normalize_gender(value: Any) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {"male", "m", "man"}:
        return "Male"
    if normalized in {"female", "f", "woman"}:
        return "Female"
    return "Other"


def _normalize_smoking(value: Any) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {"yes", "current", "smokes", "smoker", "smoking"}:
        return "smokes"
    if normalized in {"former", "formerly", "previous", "ex-smoker", "past"}:
        return "formerly smoked"
    if normalized in {"no", "never", "none", "not", "non-smoker", "never smoked"}:
        return "never smoked"
    return "never smoked"


def _risk_level(probability: float) -> str:
    if probability < 0.30:
        return "Low"
    if probability < 0.65:
        return "Medium"
    return "High"


def _build_factors(
    payload: dict[str, Any],
    bmi: float,
    hypertension: int,
    heart_disease: int,
    probability: float,
) -> list[str]:
    factors: list[str] = []

    age = _safe_float(payload.get("age"))
    if age >= 65:
        factors.append("Older age")

    if hypertension == 1:
        factors.append("High blood pressure")

    if heart_disease == 1:
        factors.append("Heart disease history")

    glucose = _safe_float(payload.get("avgGlucoseLevel"), _safe_float(payload.get("bloodSugar")))
    if glucose >= 200:
        factors.append("Very high glucose")
    elif glucose >= 126:
        factors.append("High glucose")

    if bmi >= 30:
        factors.append("High BMI")
    elif bmi >= 25:
        factors.append("Overweight BMI")

    smoking = str(payload.get("smokingStatus") or "").strip().lower()
    if smoking in {"yes", "current", "former", "smokes", "smoker", "formerly smoked"}:
        factors.append("Smoking history")

    if probability >= 0.65 and not factors:
        factors.append("Combined health indicators")

    return factors[:5]


def predict_stroke(payload: dict[str, Any]) -> dict[str, Any]:
    model, preprocessor, metadata = _load_artifacts()
    features_used = metadata.get("featuresUsed", [])

    existing_history = _normalize_history(payload.get("existingDiseaseHistory"))

    systolic_bp = _safe_float(payload.get("systolicBP"))
    diastolic_bp = _safe_float(payload.get("diastolicBP"))
    has_hypertension_history = _contains_term(existing_history, ["hypertension", "high blood pressure", "htn"])
    hypertension = 1 if systolic_bp >= 140 or diastolic_bp >= 90 or has_hypertension_history else _to_binary(payload.get("hypertension"))

    has_heart_history = _contains_term(existing_history, ["heart disease", "heart attack", "cardiac", "cad"])
    heart_disease = 1 if has_heart_history else _to_binary(payload.get("heartDisease"))

    bmi = _safe_float(payload.get("bmi")) or _compute_bmi(payload.get("height"), payload.get("weight"))
    glucose = _safe_float(payload.get("avgGlucoseLevel"), _safe_float(payload.get("bloodSugar")))

    row = {
        "age": _safe_float(payload.get("age"), 60.0),
        "hypertension": hypertension,
        "heart_disease": heart_disease,
        "avg_glucose_level": glucose,
        "bmi": bmi,
        "gender": _normalize_gender(payload.get("gender")),
        "ever_married": "Yes" if _to_binary(payload.get("everMarried", "Yes")) else "No",
        "work_type": str(payload.get("workType") or "Private").strip() or "Private",
        "Residence_type": str(payload.get("residenceType") or "Urban").strip() or "Urban",
        "smoking_status": _normalize_smoking(payload.get("smokingStatus")),
    }

    feature_row = {feature: row.get(feature, 0) for feature in features_used}
    X = pd.DataFrame([feature_row], columns=features_used)
    X_t = preprocessor.transform(X)

    probability = float(model.predict_proba(X_t)[0][1])
    confidence = int(round(probability * 100))
    risk_level = _risk_level(probability)
    factors = _build_factors(payload, bmi, hypertension, heart_disease, probability)

    return {
        "riskType": "Stroke",
        "riskLevel": risk_level,
        "confidence": confidence,
        "selectedAlgorithm": metadata.get("selectedAlgorithm", "Unknown"),
        "factors": factors,
        "probability": probability,
        "featuresUsed": features_used,
        "derived": {
            "bmi": bmi,
            "hypertension": hypertension,
            "heartDisease": heart_disease,
            "avgGlucoseLevel": glucose,
        },
    }
