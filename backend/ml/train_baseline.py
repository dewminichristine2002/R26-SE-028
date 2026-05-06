from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.impute import SimpleImputer
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.model_selection import RandomizedSearchCV, StratifiedKFold, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, FunctionTransformer
from sklearn.ensemble import RandomForestClassifier

from model_utils import flatten_text_input


ROOT = Path(__file__).resolve().parent
TRAINING_DATA_PATH = ROOT / "data" / "medicine_safety_training_dataset.csv"
EXPORTED_DATA_PATH = ROOT / "data" / "medicine_safety_dataset.csv"
MODELS_DIR = ROOT / "models"
MODELS_DIR.mkdir(exist_ok=True)
MODEL_PATH = MODELS_DIR / "baseline_model.joblib"
METADATA_PATH = MODELS_DIR / "baseline_model_metadata.json"
METRICS_PATH = MODELS_DIR / "baseline_metrics.json"
CV_METRICS_PATH = MODELS_DIR / "baseline_cv_metrics.json"


def build_text_feature(df: pd.DataFrame) -> pd.Series:
    cols = [
        "medicine_name",
        "normalized_drug_name",
        "ingredient_name",
        "therapeutic_class",
        "knowledge_sources",
        "known_allergies_text",
        "chronic_diseases_text",
        "current_medications_text",
        "q_reaction_symptoms",
        "q_doctor_advice",
        "raw_input",
    ]
    for col in cols:
        if col not in df.columns:
            df[col] = ""
    merged = df[cols].fillna("").astype(str).agg(" ".join, axis=1)
    return merged


def build_pipeline(numeric_features, categorical_features, text_feature_name) -> Pipeline:
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
            ("flatten", FunctionTransformer(flatten_text_input, validate=False)),
            ("tfidf", TfidfVectorizer(max_features=500, min_df=1, max_df=0.95, sublinear_tf=True)),
        ]
    )

    preprocessor = ColumnTransformer(
        transformers=[
            ("num", numeric_pipeline, numeric_features),
            ("cat", categorical_pipeline, categorical_features),
            ("txt", text_pipeline, [text_feature_name]),
        ]
    )

    return Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            (
                "classifier",
                RandomForestClassifier(
                    n_estimators=400,
                    random_state=42,
                    class_weight="balanced_subsample",
                    n_jobs=-1,
                ),
            ),
        ]
    )


def main() -> None:
    data_path = TRAINING_DATA_PATH if TRAINING_DATA_PATH.exists() else EXPORTED_DATA_PATH
    if not data_path.exists():
        raise FileNotFoundError(f"Dataset not found: {data_path}")

    df = pd.read_csv(data_path)
    if df.empty:
        raise ValueError("Dataset is empty. Export some data first.")

    target_column = "risk_level"
    if target_column not in df.columns:
        raise ValueError(f"Missing target column: {target_column}")

    risk_classes = ["Safe", "Warning", "Dangerous"]
    df = df[df[target_column].isin(risk_classes)].copy()
    if df.empty:
        raise ValueError("No rows with risk_level in Safe / Warning / Dangerous.")

    class_map = {label: idx for idx, label in enumerate(risk_classes)}
    y = df[target_column].map(class_map)
    if y.nunique() < 2:
        raise ValueError(
            f"Target '{target_column}' needs at least two distinct classes. "
            "Add more varied rows (e.g. run ml:public-dataset) or check labels."
        )

    numeric_features = [
        "side_effect_count",
        "severe_side_effect_count",
        "side_effect_match_count",
        "interaction_count",
    ]
    categorical_features = [
        "gender",
        "input_method",
        "max_interaction_severity",
        "has_medicine_allergy",
        "has_severe_reaction_log",
    ]
    text_feature_name = "combined_text"

    model_df = df.copy()
    for col in numeric_features:
        if col not in model_df.columns:
            model_df[col] = 0
    for col in categorical_features:
        if col not in model_df.columns:
            model_df[col] = "missing"
    model_df[text_feature_name] = build_text_feature(model_df)
    model_df[numeric_features] = model_df[numeric_features].apply(pd.to_numeric, errors="coerce")
    model_df[categorical_features] = model_df[categorical_features].fillna("missing").astype(str)

    feature_columns = numeric_features + categorical_features + [text_feature_name]
    X = model_df[feature_columns]

    base_pipeline = build_pipeline(numeric_features, categorical_features, text_feature_name)

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    param_distributions = {
        "classifier__n_estimators": [200, 400, 600, 800],
        "classifier__max_depth": [None, 16, 24, 32, 48],
        "classifier__min_samples_leaf": [1, 2, 4, 8, 16],
        "classifier__min_samples_split": [2, 4, 8],
        "classifier__max_features": ["sqrt", "log2", 0.25, 0.4],
        "preprocessor__txt__tfidf__max_features": [300, 500, 800],
    }

    n_iter = min(30, max(12, 6 * len(df) // 500))
    search = RandomizedSearchCV(
        base_pipeline,
        param_distributions=param_distributions,
        n_iter=n_iter,
        cv=cv,
        scoring={"accuracy": "accuracy", "f1_macro": "f1_macro"},
        refit="f1_macro",
        random_state=42,
        n_jobs=-1,
        verbose=1,
    )
    search.fit(X, y)

    best_model = search.best_estimator_
    best_params = {k: (None if v is None or (isinstance(v, float) and np.isnan(v)) else v) for k, v in search.best_params_.items()}

    cv_summary = {
        "best_cv_f1_macro_mean": float(search.cv_results_["mean_test_f1_macro"][search.best_index_]),
        "best_cv_f1_macro_std": float(search.cv_results_["std_test_f1_macro"][search.best_index_]),
        "best_cv_accuracy_mean": float(search.cv_results_["mean_test_accuracy"][search.best_index_]),
        "best_cv_accuracy_std": float(search.cv_results_["std_test_accuracy"][search.best_index_]),
        "best_params": best_params,
        "n_iter_search": n_iter,
        "cv_folds": 5,
        "refit_metric": "f1_macro",
    }

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42,
        stratify=y if y.nunique() > 1 else None,
    )
    best_model.fit(X_train, y_train)
    y_pred = best_model.predict(X_test)

    holdout_report = classification_report(
        y_test,
        y_pred,
        labels=list(range(len(risk_classes))),
        target_names=risk_classes,
        output_dict=True,
        zero_division=0,
    )
    holdout_report["accuracy"] = float(accuracy_score(y_test, y_pred))
    holdout_report["f1_macro"] = float(f1_score(y_test, y_pred, average="macro", zero_division=0))
    holdout_report["f1_weighted"] = float(f1_score(y_test, y_pred, average="weighted", zero_division=0))

    best_model.fit(X, y)

    metrics_bundle = {
        "evaluation_note": (
            "Cross-validated scores reflect generalization better than a single hold-out split. "
            "If hold-out accuracy is ~1.0 but features align with labels in synthetic data, "
            "real-world accuracy will usually be lower."
        ),
        "cross_validation_best": cv_summary,
        "holdout_test_20pct": holdout_report,
    }

    report_path = MODELS_DIR / "baseline_feature_report.txt"
    metadata = {
        "dataset": data_path.name,
        "rows": len(df),
        "target": target_column,
        "risk_level_classes": risk_classes,
        "numeric_features": numeric_features,
        "categorical_features": categorical_features,
        "text_feature_name": text_feature_name,
        "tuning": {
            "method": "RandomizedSearchCV",
            "cv_folds": 5,
            "n_iter": n_iter,
            "refit_metric": "f1_macro",
            "best_params": best_params,
        },
    }

    joblib.dump(best_model, MODEL_PATH)
    METADATA_PATH.write_text(json.dumps(metadata, indent=2), encoding="utf8")
    METRICS_PATH.write_text(json.dumps(metrics_bundle, indent=2), encoding="utf8")
    CV_METRICS_PATH.write_text(json.dumps(cv_summary, indent=2), encoding="utf8")

    report_path.write_text(
        "\n".join(
            [
                "Baseline training complete (tuned RandomForest + 5-fold CV).",
                f"Dataset: {data_path.name}",
                f"Rows: {len(df)}",
                f"Target: {target_column}",
                f"Best CV F1 (macro): {cv_summary['best_cv_f1_macro_mean']:.4f} (+/- {cv_summary['best_cv_f1_macro_std']:.4f})",
                f"Best CV accuracy: {cv_summary['best_cv_accuracy_mean']:.4f} (+/- {cv_summary['best_cv_accuracy_std']:.4f})",
                f"Hold-out accuracy (20%): {holdout_report['accuracy']:.4f}",
                f"Hold-out F1 macro: {holdout_report['f1_macro']:.4f}",
                f"Best params: {best_params}",
                f"Numeric features: {numeric_features}",
                f"Categorical features: {categorical_features}",
                f"Text feature: {text_feature_name}",
            ]
        ),
        encoding="utf8",
    )

    print(f"[ML] Model saved -> {MODEL_PATH}")
    print(f"[ML] Metadata -> {METADATA_PATH}")
    print(f"[ML] Metrics -> {METRICS_PATH}")
    print(f"[ML] CV summary -> {CV_METRICS_PATH}")
    print(f"[ML] Best CV F1 (macro): {cv_summary['best_cv_f1_macro_mean']:.4f} ± {cv_summary['best_cv_f1_macro_std']:.4f}")
    print(f"[ML] Best CV accuracy: {cv_summary['best_cv_accuracy_mean']:.4f} ± {cv_summary['best_cv_accuracy_std']:.4f}")
    print(f"[ML] Hold-out accuracy: {holdout_report['accuracy']:.4f}")
    print(f"[ML] Feature summary -> {report_path}")


if __name__ == "__main__":
    main()
