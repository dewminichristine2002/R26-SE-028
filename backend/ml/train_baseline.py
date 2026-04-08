from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.impute import SimpleImputer
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from sklearn.ensemble import RandomForestClassifier


ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "data" / "medicine_safety_dataset.csv"
MODELS_DIR = ROOT / "models"
MODELS_DIR.mkdir(exist_ok=True)


def build_text_feature(df: pd.DataFrame) -> pd.Series:
    cols = [
        "medicine_name",
        "normalized_drug_name",
        "known_allergies_text",
        "chronic_diseases_text",
        "current_medications_text",
        "q_reaction_symptoms",
        "q_doctor_advice",
        "raw_input",
    ]
    merged = df[cols].fillna("").astype(str).agg(" ".join, axis=1)
    return merged


def main() -> None:
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Dataset not found: {DATA_PATH}")

    df = pd.read_csv(DATA_PATH)
    if df.empty:
        raise ValueError("Dataset is empty. Export some data first.")

    target_column = "has_reaction_log"
    if target_column not in df.columns:
        raise ValueError(f"Missing target column: {target_column}")

    numeric_features = ["risk_score"]
    categorical_features = [
        "gender",
        "input_method",
        "risk_level",
        "has_medicine_allergy",
        "has_severe_reaction_log",
    ]
    text_feature_name = "combined_text"

    model_df = df.copy()
    model_df[text_feature_name] = build_text_feature(model_df)

    feature_columns = numeric_features + categorical_features + [text_feature_name]
    X = model_df[feature_columns]
    y = model_df[target_column].fillna(0).astype(int)

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42,
        stratify=y if y.nunique() > 1 else None,
    )

    numeric_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
        ]
    )

    categorical_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore")),
        ]
    )

    text_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="constant", fill_value="")),
            ("flatten", FunctionTransformer(lambda x: x.squeeze(), validate=False)),
            ("tfidf", TfidfVectorizer(max_features=300)),
        ]
    )

    preprocessor = ColumnTransformer(
        transformers=[
            ("num", numeric_pipeline, numeric_features),
            ("cat", categorical_pipeline, categorical_features),
            ("txt", text_pipeline, [text_feature_name]),
        ]
    )

    model = Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("classifier", RandomForestClassifier(n_estimators=200, random_state=42, class_weight="balanced")),
        ]
    )

    model.fit(X_train, y_train)
    predictions = model.predict(X_test)
    report = classification_report(y_test, predictions, output_dict=True, zero_division=0)

    metrics_path = MODELS_DIR / "baseline_metrics.json"
    report_path = MODELS_DIR / "baseline_feature_report.txt"

    metrics_path.write_text(json.dumps(report, indent=2), encoding="utf8")
    report_path.write_text(
        "\n".join(
            [
                "Baseline training complete.",
                f"Rows: {len(df)}",
                f"Target: {target_column}",
                f"Numeric features: {numeric_features}",
                f"Categorical features: {categorical_features}",
                f"Text feature: {text_feature_name}",
            ]
        ),
        encoding="utf8",
    )

    print(f"[ML] Training complete. Metrics -> {metrics_path}")
    print(f"[ML] Feature summary -> {report_path}")


class FunctionTransformer:
    def __init__(self, func, validate=False):
        self.func = func
        self.validate = validate

    def fit(self, X, y=None):
        return self

    def transform(self, X):
        return self.func(X)


if __name__ == "__main__":
    main()
