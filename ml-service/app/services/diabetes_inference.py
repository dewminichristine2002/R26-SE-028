from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

MODEL_DIR = Path("app/models")
MODEL_PATH = MODEL_DIR / "diabetes_model.pkl"
PREPROCESSOR_PATH = MODEL_DIR / "diabetes_preprocessor.pkl"
METADATA_PATH = MODEL_DIR / "diabetes_model_metadata.json"

_model = None
_preprocessor = None
_metadata: dict[str, Any] | None = None


def _load_artifacts() -> tuple[Any, Any, dict[str, Any]]:
    global _model, _preprocessor, _metadata

    if _model is not None and _preprocessor is not None and _metadata is not None:
        return _model, _preprocessor, _metadata

    if not MODEL_PATH.exists() or not PREPROCESSOR_PATH.exists() or not METADATA_PATH.exists():
        raise FileNotFoundError(
            "Diabetes model artifacts are missing. Run training/diabetes/train_diabetes_model.py first."
        )

    _model = joblib.load(MODEL_PATH)
    _preprocessor = joblib.load(PREPROCESSOR_PATH)
    _metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
    return _model, _preprocessor, _metadata


def _to_binary(value: Any) -> int:
    if isinstance(value, bool):
        return 1 if value else 0
    normalized = str(value or "").strip().lower()
    return 1 if normalized in {"1", "true", "yes", "y", "current", "former", "high"} else 0


def _age_to_brfss_bin(age: int | float | None) -> int:
    if age is None:
        return 9
    age_value = int(max(18, min(120, round(float(age)))))
    bins = [24, 29, 34, 39, 44, 49, 54, 59, 64, 69, 74, 79]
    for idx, upper in enumerate(bins, start=1):
        if age_value <= upper:
            return idx
    return 13


def _sex_to_binary(gender: Any) -> int:
    value = str(gender or "").strip().lower()
    if value in {"male", "m", "man", "boy"}:
        return 1
    return 0


def _safe_float(value: Any, fallback: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    if np.isnan(number):
        return fallback
    return number


def _compute_bmi(height_cm: Any, weight_kg: Any) -> float:
    height = _safe_float(height_cm)
    weight = _safe_float(weight_kg)
    if height <= 0 or weight <= 0:
        return 0.0
    meters = height / 100.0
    return round(weight / (meters * meters), 2)


def _contains_term(values: list[str], terms: list[str]) -> bool:
    joined = " ".join(values).lower()
    return any(term in joined for term in terms)


def _normalize_history(existing_disease_history: Any) -> list[str]:
    if isinstance(existing_disease_history, list):
        return [str(item).strip().lower() for item in existing_disease_history if str(item).strip()]
    if existing_disease_history is None:
        return []
    return [item.strip().lower() for item in str(existing_disease_history).split(",") if item.strip()]


def _risk_level(probability: float) -> str:
    if probability < 0.40:
        return "Low"
    if probability < 0.70:
        return "Medium"
    return "High"


def _risk_rank(level: str) -> int:
    return {"Low": 0, "Medium": 1, "High": 2}.get(level, 0)


def _max_risk_level(*levels: str) -> str:
    ranked = ["Low", "Medium", "High"]
    return ranked[max(_risk_rank(level) for level in levels)]


def _clinical_min_risk(payload: dict[str, Any], bmi: float, high_bp: int) -> str:
    """Conservative guardrail for clearly abnormal user-entered values.

    The BRFSS model does not include raw glucose readings, so we keep the ML
    probability but prevent obviously concerning inputs from being labelled Low.
    """
    blood_sugar = _safe_float(payload.get("bloodSugar"))
    family_history = str(payload.get("familyHistory") or "").strip().lower() in {"yes", "true", "1"}
    low_activity = str(payload.get("physicalActivityLevel") or "").strip().lower() in {
        "low",
        "none",
        "inactive",
        "sedentary",
    }

    if blood_sugar >= 200:
        return "High" if bmi >= 30 or high_bp == 1 or family_history or low_activity else "Medium"

    if blood_sugar >= 126 and (bmi >= 30 or high_bp == 1 or family_history):
        return "High"

    if blood_sugar >= 126 or bmi >= 40:
        return "Medium"

    if bmi >= 30 and (high_bp == 1 or family_history or low_activity):
        return "Medium"

    return "Low"


def _build_factors(payload: dict[str, Any], bmi: float, high_bp: int, probability: float) -> list[str]:
    factors: list[str] = []

    blood_sugar = _safe_float(payload.get("bloodSugar"))
    if blood_sugar >= 126:
        factors.append("High blood sugar")

    if bmi >= 30:
        factors.append("High BMI")
    elif bmi >= 25:
        factors.append("Overweight BMI")

    if high_bp == 1:
        factors.append("High blood pressure")

    physical_level = str(payload.get("physicalActivityLevel") or "").strip().lower()
    if physical_level in {"low", "none", "inactive", "sedentary"}:
        factors.append("Low physical activity")

    smoking_status = str(payload.get("smokingStatus") or "").strip().lower()
    if smoking_status in {"yes", "current", "former", "smoker"}:
        factors.append("Smoking history")

    family_history = str(payload.get("familyHistory") or "").strip().lower()
    if family_history in {"yes", "true", "1"}:
        factors.append("Family history")

    if probability >= 0.70 and "Age-related vulnerability" not in factors:
        age = _safe_float(payload.get("age"))
        if age >= 60:
            factors.append("Age-related vulnerability")

    return factors[:5]


def predict_diabetes(payload: dict[str, Any]) -> dict[str, Any]:
    model, preprocessor, metadata = _load_artifacts()
    features_used = metadata.get("featuresUsed", [])

    existing_history = _normalize_history(payload.get("existingDiseaseHistory"))

    systolic_bp = _safe_float(payload.get("systolicBP"))
    diastolic_bp = _safe_float(payload.get("diastolicBP"))
    has_hypertension_history = _contains_term(existing_history, ["hypertension", "high blood pressure", "htn"])
    high_bp = 1 if systolic_bp >= 140 or diastolic_bp >= 90 or has_hypertension_history else 0

    bmi = _compute_bmi(payload.get("height"), payload.get("weight"))

    row = {
        "Age": _age_to_brfss_bin(payload.get("age")),
        "Sex": _sex_to_binary(payload.get("gender")),
        "BMI": bmi,
        "HighBP": high_bp,
        "Smoker": _to_binary(payload.get("smokingStatus")),
        "PhysActivity": 0
        if str(payload.get("physicalActivityLevel") or "").strip().lower() in {"low", "none", "inactive", "sedentary"}
        else 1,
        "HeartDiseaseorAttack": 1 if _contains_term(existing_history, ["heart disease", "heart attack", "cardiac", "cad"]) else 0,
        "Stroke": 1 if _contains_term(existing_history, ["stroke", "cva"]) else 0,
        "GenHlth": 2,
        "DiffWalk": 1 if _contains_term(existing_history, ["difficulty walking", "mobility", "arthritis", "fracture"]) else 0,
    }

    if _contains_term(existing_history, ["chronic", "multiple"]):
        row["GenHlth"] = 4
    elif bmi >= 30 or high_bp == 1:
        row["GenHlth"] = 3

    feature_row = {feature: row.get(feature, 0) for feature in features_used}
    X = pd.DataFrame([feature_row], columns=features_used)
    X_t = preprocessor.transform(X)

    probability = float(model.predict_proba(X_t)[0][1])
    model_risk_level = _risk_level(probability)
    clinical_min_risk = _clinical_min_risk(payload, bmi, high_bp)
    risk_level = _max_risk_level(model_risk_level, clinical_min_risk)
    confidence = int(round(probability * 100))
    if risk_level != model_risk_level:
        confidence = max(confidence, 65 if risk_level == "Medium" else 75)
    factors = _build_factors(payload, bmi, high_bp, probability)

    return {
        "riskType": "Diabetes",
        "riskLevel": risk_level,
        "confidence": confidence,
        "selectedAlgorithm": metadata.get("selectedAlgorithm", "Unknown"),
        "factors": factors,
        "probability": probability,
        "featuresUsed": features_used,
        "derived": {
            "bmi": bmi,
            "highBP": high_bp,
            "modelProbability": round(probability, 4),
            "ruleAdjustedRisk": 1 if risk_level != model_risk_level else 0,
        },
    }
