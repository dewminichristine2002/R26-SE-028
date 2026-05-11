from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

MODEL_DIR = Path("app/models")
MODEL_PATH = MODEL_DIR / "hypertension_model.pkl"
PREPROCESSOR_PATH = MODEL_DIR / "hypertension_preprocessor.pkl"
METADATA_PATH = MODEL_DIR / "hypertension_model_metadata.json"

_model = None
_preprocessor = None
_metadata: dict[str, Any] | None = None


def _load_artifacts() -> tuple[Any, Any, dict[str, Any]]:
    global _model, _preprocessor, _metadata

    if _model is not None and _preprocessor is not None and _metadata is not None:
        return _model, _preprocessor, _metadata

    if not MODEL_PATH.exists() or not PREPROCESSOR_PATH.exists() or not METADATA_PATH.exists():
        raise FileNotFoundError(
            "Hypertension model artifacts are missing. Run training/hypertension/train_hypertension_model.py first."
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


def _default(metadata: dict[str, Any], key: str, fallback: Any = None) -> Any:
    return metadata.get("numericDefaults", {}).get(key, metadata.get("categoricalDefaults", {}).get(key, fallback))


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


def _normalize_gender(value: Any, fallback: str) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {"male", "m", "man"}:
        return "Male"
    if normalized in {"female", "f", "woman"}:
        return "Female"
    return fallback


def _normalize_smoking(value: Any, fallback: str) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {"yes", "current", "smokes", "smoker", "smoking"}:
        return "Current"
    if normalized in {"former", "formerly", "previous", "ex-smoker", "past"}:
        return "Former"
    if normalized in {"no", "never", "none", "not", "non-smoker", "never smoked"}:
        return "Never"
    return fallback


def _normalize_activity(value: Any, fallback: str) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {"low", "none", "inactive", "sedentary"}:
        return "Low"
    if normalized in {"medium", "moderate"}:
        return "Moderate"
    if normalized in {"high", "active"}:
        return "High"
    return fallback


def _yes_no(value: Any, fallback: str = "No") -> str:
    return "Yes" if _to_binary(value) else fallback


def _risk_level(probability: float) -> str:
    if probability < 0.40:
        return "Low"
    if probability < 0.70:
        return "Medium"
    return "High"


def _build_factors(payload: dict[str, Any], row: dict[str, Any], probability: float) -> list[str]:
    factors: list[str] = []

    systolic = _safe_float(row.get("Systolic_BP"))
    diastolic = _safe_float(row.get("Diastolic_BP"))
    if systolic >= 140 or diastolic >= 90:
        factors.append("High blood pressure reading")
    elif systolic >= 130 or diastolic >= 80:
        factors.append("Elevated blood pressure reading")

    bmi = _safe_float(row.get("BMI"))
    if bmi >= 30:
        factors.append("High BMI")
    elif bmi >= 25:
        factors.append("Overweight BMI")

    if _safe_float(row.get("Cholesterol")) >= 240:
        factors.append("High cholesterol")

    glucose = _safe_float(row.get("Glucose"))
    if glucose >= 126 or row.get("Diabetes") == "Yes":
        factors.append("Diabetes or high glucose")

    if row.get("Smoking_Status") in {"Current", "Former"}:
        factors.append("Smoking history")

    if row.get("Physical_Activity_Level") == "Low":
        factors.append("Low physical activity")

    if row.get("Family_History") == "Yes":
        factors.append("Family history")

    if _safe_float(row.get("Stress_Level")) >= 7:
        factors.append("High stress")

    if _safe_float(row.get("Salt_Intake")) >= 10:
        factors.append("High salt intake")

    if _safe_float(row.get("Sleep_Duration")) < 6:
        factors.append("Short sleep duration")

    if probability >= 0.70 and not factors:
        factors.append("Combined health indicators")

    return factors[:5]


def predict_hypertension(payload: dict[str, Any]) -> dict[str, Any]:
    model, preprocessor, metadata = _load_artifacts()
    features_used = metadata.get("featuresUsed", [])
    existing_history = _normalize_history(payload.get("existingDiseaseHistory"))

    bmi = _safe_float(payload.get("bmi")) or _compute_bmi(payload.get("height"), payload.get("weight"))
    has_diabetes_history = _contains_term(existing_history, ["diabetes", "high sugar", "glucose"])
    family_history = payload.get("familyHistory")

    row = {
        "Age": _safe_float(payload.get("age"), _default(metadata, "Age", 54.0)),
        "BMI": bmi or _default(metadata, "BMI", 27.5),
        "Cholesterol": _safe_float(payload.get("cholesterol"), _default(metadata, "Cholesterol", 225.0)),
        "Systolic_BP": _safe_float(payload.get("systolicBP"), _default(metadata, "Systolic_BP", 135.0)),
        "Diastolic_BP": _safe_float(payload.get("diastolicBP"), _default(metadata, "Diastolic_BP", 89.0)),
        "Alcohol_Intake": _safe_float(payload.get("alcoholIntake"), _default(metadata, "Alcohol_Intake", 15.0)),
        "Stress_Level": _safe_float(payload.get("stressLevel"), _default(metadata, "Stress_Level", 5.0)),
        "Salt_Intake": _safe_float(payload.get("saltIntake"), _default(metadata, "Salt_Intake", 8.5)),
        "Sleep_Duration": _safe_float(payload.get("sleepDuration"), _default(metadata, "Sleep_Duration", 7.0)),
        "Heart_Rate": _safe_float(payload.get("heartRate"), _default(metadata, "Heart_Rate", 75.0)),
        "LDL": _safe_float(payload.get("ldl"), _default(metadata, "LDL", 130.0)),
        "HDL": _safe_float(payload.get("hdl"), _default(metadata, "HDL", 65.0)),
        "Triglycerides": _safe_float(payload.get("triglycerides"), _default(metadata, "Triglycerides", 150.0)),
        "Glucose": _safe_float(payload.get("glucose"), _safe_float(payload.get("bloodSugar"), _default(metadata, "Glucose", 134.0))),
        "Country": str(payload.get("country") or _default(metadata, "Country", "Saudi Arabia")).strip(),
        "Smoking_Status": _normalize_smoking(payload.get("smokingStatus"), _default(metadata, "Smoking_Status", "Never")),
        "Physical_Activity_Level": _normalize_activity(
            payload.get("physicalActivityLevel"),
            _default(metadata, "Physical_Activity_Level", "Low"),
        ),
        "Family_History": _yes_no(family_history, _default(metadata, "Family_History", "No")),
        "Diabetes": "Yes" if has_diabetes_history or _to_binary(payload.get("diabetes")) else "No",
        "Gender": _normalize_gender(payload.get("gender"), _default(metadata, "Gender", "Female")),
        "Education_Level": str(payload.get("educationLevel") or _default(metadata, "Education_Level", "Secondary")).strip(),
        "Employment_Status": str(payload.get("employmentStatus") or _default(metadata, "Employment_Status", "Retired")).strip(),
    }

    feature_row = {feature: row.get(feature, 0) for feature in features_used}
    X = pd.DataFrame([feature_row], columns=features_used)
    X_t = preprocessor.transform(X)

    probability = float(model.predict_proba(X_t)[0][1])
    confidence = int(round(probability * 100))
    risk_level = _risk_level(probability)
    factors = _build_factors(payload, row, probability)

    return {
        "riskType": "Hypertension",
        "riskLevel": risk_level,
        "confidence": confidence,
        "selectedAlgorithm": metadata.get("selectedAlgorithm", "Unknown"),
        "factors": factors,
        "probability": probability,
        "featuresUsed": features_used,
        "derived": {
            "bmi": float(row["BMI"]),
            "systolicBP": float(row["Systolic_BP"]),
            "diastolicBP": float(row["Diastolic_BP"]),
            "cholesterol": float(row["Cholesterol"]),
            "glucose": float(row["Glucose"]),
        },
    }
