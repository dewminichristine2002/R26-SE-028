from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

try:
    import shap
except ImportError:  # pragma: no cover - optional dependency on some platforms
    shap = None

from feature_schema import FEATURE_COLUMNS, enrich_shap_contributions, payload_to_dataframe
from train_baseline import get_feature_names


ROOT = Path(__file__).resolve().parent
MODELS_DIR = ROOT / "models"
MODEL_PATH = MODELS_DIR / "baseline_model.joblib"
XGBOOST_ALIAS_PATH = MODELS_DIR / "xgboost_production.joblib"
METADATA_PATH = MODELS_DIR / "baseline_model_metadata.json"
SHAP_BACKGROUND_PATH = MODELS_DIR / "shap_background.joblib"
DEFAULT_YOUDENS_J_THRESHOLD = 0.5


def load_youdens_j_threshold(metadata: dict) -> dict:
    output = metadata.get("output") or {}
    tuning = metadata.get("threshold_tuning") or {}

    threshold = output.get("youdens_j_optimal_threshold")
    if threshold is None:
        threshold = tuning.get("youdens_j", {}).get("optimal_threshold")
    if threshold is None:
        threshold = DEFAULT_YOUDENS_J_THRESHOLD

    youden_j = tuning.get("youdens_j", {}).get("youdens_j")
    tpr = tuning.get("youdens_j", {}).get("tpr")
    fpr = tuning.get("youdens_j", {}).get("fpr")

    return {
        "optimal_threshold": float(threshold),
        "youdens_j": float(youden_j) if youden_j is not None else None,
        "tpr": float(tpr) if tpr is not None else None,
        "fpr": float(fpr) if fpr is not None else None,
        "method": "youdens_j",
        "classification_rule": f"severe_adr if P(ADR) >= {float(threshold):.4f} else no_adr",
    }


def classify_with_youdens_j(adr_risk_probability: float, threshold_info: dict) -> int:
    threshold = float(threshold_info.get("optimal_threshold", DEFAULT_YOUDENS_J_THRESHOLD))
    return int(adr_risk_probability >= threshold)


def read_payload() -> dict:
    raw = sys.stdin.read().strip()
    if not raw:
        raise ValueError("Missing prediction payload on stdin")
    return json.loads(raw)


def transformed_matrix(model, frame: pd.DataFrame) -> tuple[np.ndarray, list[str]]:
    preprocessor = model.named_steps["preprocessor"]
    matrix = preprocessor.transform(frame)
    feature_names = get_feature_names(preprocessor)
    return matrix, feature_names


def compute_shap(model, frame: pd.DataFrame) -> dict:
    classifier = model.named_steps["classifier"]
    matrix, feature_names = transformed_matrix(model, frame)

    if shap is None:
        importances = getattr(classifier, "feature_importances_", None)
        if importances is None or len(importances) != len(feature_names):
            return {"base_value": 0.0, "contributions": [], "method": "unavailable"}
        raw_row = frame.iloc[0].to_dict()
        contributions = [
            {
                "feature": name,
                "value": raw_row.get(name, None),
                "shap": float(value),
            }
            for name, value in zip(feature_names, importances)
        ]
        contributions.sort(key=lambda item: abs(item["shap"]), reverse=True)
        return {
            "base_value": 0.0,
            "contributions": enrich_shap_contributions(contributions),
            "method": "feature_importances_fallback",
            "explainability": "global_mdi_fallback",
        }

    background = None
    if SHAP_BACKGROUND_PATH.exists():
        background_frame = joblib.load(SHAP_BACKGROUND_PATH)
        background, _ = transformed_matrix(model, background_frame)

    explainer = shap.TreeExplainer(
        classifier,
        data=background if background is not None else matrix,
        feature_perturbation="interventional" if background is not None else "tree_path_dependent",
    )
    shap_values = explainer.shap_values(matrix)
    if isinstance(shap_values, list):
        values = shap_values[1] if len(shap_values) > 1 else shap_values[0]
        base_value = explainer.expected_value[1] if isinstance(explainer.expected_value, (list, np.ndarray)) else explainer.expected_value
    else:
        values = shap_values[:, :, 1] if shap_values.ndim == 3 else shap_values
        base_value = explainer.expected_value

    row_values = values[0]
    raw_row = frame.iloc[0].to_dict()
    contributions = []
    for name, shap_value in zip(feature_names, row_values):
        contributions.append(
            {
                "feature": name,
                "value": raw_row.get(name, None),
                "shap": float(shap_value),
            }
        )
    contributions.sort(key=lambda item: abs(item["shap"]), reverse=True)

    return {
        "base_value": float(base_value),
        "contributions": enrich_shap_contributions(contributions),
        "method": "shap_tree_explainer",
        "explainability": "local_shap_waterfall",
    }


def resolve_model_path() -> Path:
    if MODEL_PATH.exists():
        return MODEL_PATH
    if XGBOOST_ALIAS_PATH.exists():
        return XGBOOST_ALIAS_PATH
    raise FileNotFoundError(
        f"Production model not found. Expected {MODEL_PATH} or {XGBOOST_ALIAS_PATH}. Run npm run ml:train."
    )


def main() -> None:
    model_file = resolve_model_path()
    if not METADATA_PATH.exists():
        raise FileNotFoundError(f"Model metadata not found: {METADATA_PATH}")

    payload = read_payload()
    metadata = json.loads(METADATA_PATH.read_text(encoding="utf8"))
    model = joblib.load(model_file)
    frame = payload_to_dataframe(payload)

    probabilities = model.predict_proba(frame)[0]
    classes = list(getattr(model.named_steps["classifier"], "classes_", []))
    adr_index = classes.index(1) if 1 in classes else len(classes) - 1
    adr_risk_probability = float(probabilities[adr_index])
    threshold_info = load_youdens_j_threshold(metadata)
    prediction = classify_with_youdens_j(adr_risk_probability, threshold_info)

    shap_payload = compute_shap(model, frame)

    risk_level_label = "Dangerous" if prediction == 1 else "Safe"
    probability_dangerous = adr_risk_probability
    probability_safe = float(1.0 - adr_risk_probability) if len(classes) == 2 else float(probabilities[0])

    print(
        json.dumps(
            {
                "prediction": prediction,
                "adr_risk_probability": adr_risk_probability,
                "risk_level_label": risk_level_label,
                "probability": adr_risk_probability,
                "probability_dangerous": probability_dangerous,
                "probability_warning": 0.0,
                "probability_safe": probability_safe,
                "probabilities": probabilities.tolist(),
                "youdens_j_threshold": threshold_info,
                "shap": shap_payload,
                "feature_columns": FEATURE_COLUMNS,
                "model_path": str(model_file),
                "model_type": metadata.get("model_type", "XGBClassifier"),
                "target": metadata.get("target", "adr_event"),
            }
        )
    )


if __name__ == "__main__":
    main()
