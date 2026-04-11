from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import pandas as pd

from model_utils import flatten_text_input  # noqa: F401


ROOT = Path(__file__).resolve().parent
MODELS_DIR = ROOT / "models"
MODEL_PATH = MODELS_DIR / "baseline_model.joblib"
METADATA_PATH = MODELS_DIR / "baseline_model_metadata.json"


def read_payload() -> dict:
    raw = sys.stdin.read().strip()
    if not raw:
        raise ValueError("Missing prediction payload on stdin")
    return json.loads(raw)


def build_dataframe(payload: dict, metadata: dict) -> pd.DataFrame:
    numeric_features = metadata.get("numeric_features", [])
    categorical_features = metadata.get("categorical_features", [])
    text_feature_name = metadata.get("text_feature_name", "combined_text")

    row = {}
    for key in numeric_features:
      row[key] = payload.get(key, 0)
    for key in categorical_features:
      row[key] = payload.get(key, "missing")
    row[text_feature_name] = payload.get(text_feature_name, "")

    return pd.DataFrame([row])


def main() -> None:
    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Model not found: {MODEL_PATH}")
    if not METADATA_PATH.exists():
        raise FileNotFoundError(f"Model metadata not found: {METADATA_PATH}")

    payload = read_payload()
    metadata = json.loads(METADATA_PATH.read_text(encoding="utf8"))
    model = joblib.load(MODEL_PATH)
    frame = build_dataframe(payload, metadata)

    prediction = int(model.predict(frame)[0])
    probabilities = model.predict_proba(frame)[0].tolist() if hasattr(model, "predict_proba") else []

    probability_positive = 0.0
    if probabilities:
        classes = list(model.classes_)
        if 1 in classes:
            probability_positive = float(probabilities[classes.index(1)])
        elif len(probabilities) > 1:
            probability_positive = float(probabilities[1])

    print(json.dumps({
        "prediction": prediction,
        "probability": probability_positive,
        "model_path": str(MODEL_PATH),
        "target": metadata.get("target", "has_reaction_log"),
    }))


if __name__ == "__main__":
    main()
