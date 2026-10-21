from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin

ROOT = Path(__file__).resolve().parents[3]
ARTIFACT_PATH = ROOT / "backend" / "ml" / "models" / "fda_serious_baselines" / "logistic_regression_tuned_with_threshold.joblib"

FEATURE_COLUMNS = [
    "year",
    "month",
    "primary_reaction",
    "num_reactions",
    "suspect_drug",
    "drug_route",
    "drug_indication",
    "pharm_class",
    "num_drugs",
    "patient_age_years",
    "patient_sex",
    "country",
    "report_age_days",
]

_artifact: dict[str, Any] | None = None


TEXT_UNKNOWN = "Unknown"


def select_text_column(frame: pd.DataFrame, column: str) -> pd.Series:
    return frame[column].fillna(TEXT_UNKNOWN).astype(str)


def array_to_frame(arr, columns: list[str]) -> pd.DataFrame:
    return pd.DataFrame(arr, columns=columns)


class FrequencyEncoder(BaseEstimator, TransformerMixin):
    def __init__(self, columns: list[str], top_n: int = 200) -> None:
        self.columns = columns
        self.top_n = top_n
        self.frequent_values_: dict[str, set[str]] = {}
        self.frequency_maps_: dict[str, dict[str, float]] = {}

    def fit(self, X: pd.DataFrame, y=None):
        frame = X.copy()
        for column in self.columns:
            values = frame[column].fillna(TEXT_UNKNOWN).astype(str)
            counts = values.value_counts(dropna=False)
            top_values = set(counts.head(self.top_n).index.tolist())
            self.frequent_values_[column] = top_values
            freqs = (counts / len(values)).to_dict()
            self.frequency_maps_[column] = {str(key): float(value) for key, value in freqs.items()}
        return self

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        frame = X.copy()
        encoded = {}
        for column in self.columns:
            values = frame[column].fillna(TEXT_UNKNOWN).astype(str)
            grouped = values.where(values.isin(self.frequent_values_[column]), "__OTHER__")
            freq_map = self.frequency_maps_[column]
            encoded[f"{column}_freq"] = grouped.map(lambda value: freq_map.get(value, 0.0)).astype(float)
        return pd.DataFrame(encoded, index=frame.index)

    def get_feature_names_out(self, input_features=None):
        return np.array([f"{column}_freq" for column in self.columns], dtype=object)


def _register_pickle_compatibility_symbols() -> None:
    main_module = sys.modules.get("__main__")
    if main_module is None:
        return
    setattr(main_module, "select_text_column", select_text_column)
    setattr(main_module, "array_to_frame", array_to_frame)
    setattr(main_module, "FrequencyEncoder", FrequencyEncoder)


def _load_artifact() -> dict[str, Any]:
    global _artifact
    if _artifact is not None:
        return _artifact
    if not ARTIFACT_PATH.exists():
        raise FileNotFoundError(
            f"Medicine safety model artifact is missing at {ARTIFACT_PATH}. Train and save the final LR threshold artifact first."
        )
    _register_pickle_compatibility_symbols()
    _artifact = joblib.load(ARTIFACT_PATH)
    model = _artifact.get("model")
    classifier = getattr(model, "named_steps", {}).get("classifier") if model is not None else None
    if classifier is not None and not hasattr(classifier, "multi_class"):
        classifier.multi_class = "auto"
    return _artifact


def _safe_int(value: Any, fallback: int = 0) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return fallback


def _safe_float(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _safe_text(value: Any, fallback: str = "Unknown") -> str:
    text = str(value or "").strip()
    return text or fallback


def _build_feature_row(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "year": _safe_int(payload.get("year"), 2026),
        "month": _safe_int(payload.get("month"), 1),
        "primary_reaction": _safe_text(payload.get("primary_reaction")),
        "num_reactions": _safe_float(payload.get("num_reactions"), 0.0),
        "suspect_drug": _safe_text(payload.get("suspect_drug")),
        "drug_route": _safe_text(payload.get("drug_route")),
        "drug_indication": _safe_text(payload.get("drug_indication")),
        "pharm_class": _safe_text(payload.get("pharm_class")),
        "num_drugs": _safe_float(payload.get("num_drugs"), 0.0),
        "patient_age_years": _safe_float(payload.get("patient_age_years"), 0.0),
        "patient_sex": _safe_text(payload.get("patient_sex")),
        "country": _safe_text(payload.get("country")),
        "report_age_days": _safe_float(payload.get("report_age_days"), 0.0),
    }


def predict_medicine_safety(payload: dict[str, Any]) -> dict[str, Any]:
    artifact = _load_artifact()
    model = artifact["model"]
    threshold = float(artifact["threshold"])

    feature_row = _build_feature_row(payload)
    X = pd.DataFrame([feature_row], columns=FEATURE_COLUMNS)
    serious_probability = float(model.predict_proba(X)[0][1])
    prediction = int(serious_probability >= threshold)
    classification = "Serious" if prediction == 1 else "Non-serious"

    return {
        "riskType": "Serious adverse-event risk",
        "seriousProbability": serious_probability,
        "threshold": threshold,
        "prediction": prediction,
        "classification": classification,
        "riskLevelLabel": "Dangerous" if prediction == 1 else "Safe",
        "mlRiskScore": round(serious_probability * 100, 1),
        "confidence": int(round(max(serious_probability, 1 - serious_probability) * 100)),
        "featuresUsed": FEATURE_COLUMNS,
        "featureRow": feature_row,
        "modelPath": str(ARTIFACT_PATH),
    }
