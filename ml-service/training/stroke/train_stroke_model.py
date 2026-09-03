import argparse
import json
from pathlib import Path
import sys

import joblib
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier, VotingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.tree import DecisionTreeClassifier
from xgboost import XGBClassifier

TRAINING_ROOT = Path(__file__).resolve().parents[1]
if str(TRAINING_ROOT) not in sys.path:
    sys.path.insert(0, str(TRAINING_ROOT))

from visualization_utils import save_training_visualizations

RANDOM_STATE = 42
DEFAULT_DATASET = "data/raw/healthcare-dataset-stroke-data.csv"
DEFAULT_OUTPUT_DIR = "app/models"
ENSEMBLE_NAME = "Soft Voting Ensemble"
ENSEMBLE_BASE_ALGORITHMS = ["Logistic Regression", "Random Forest", "XGBoost"]
REQUIRED_ENSEMBLE_METRICS = ("accuracy", "recall", "f1Score", "rocAuc")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train ElderMeds stroke risk model.")
    parser.add_argument("--dataset-path", default=DEFAULT_DATASET)
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--test-size", type=float, default=0.2)
    return parser.parse_args()


def load_dataset(dataset_path: Path) -> pd.DataFrame:
    if not dataset_path.exists():
        raise FileNotFoundError(
            f"Dataset not found at {dataset_path}. Place healthcare-dataset-stroke-data.csv in data/raw."
        )

    df = pd.read_csv(dataset_path, na_values=["N/A", "Unknown"])
    if "stroke" not in df.columns:
        raise ValueError("Stroke dataset must contain a 'stroke' target column.")

    df = df[df["stroke"].isin([0, 1])].copy()
    df["stroke"] = df["stroke"].astype(int)
    return df


def build_feature_frame(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series, list[str], list[str]]:
    numeric_features = [
        "age",
        "hypertension",
        "heart_disease",
        "avg_glucose_level",
        "bmi",
    ]
    categorical_features = [
        "gender",
        "ever_married",
        "work_type",
        "Residence_type",
        "smoking_status",
    ]
    required = numeric_features + categorical_features
    missing = [name for name in required if name not in df.columns]
    if missing:
        raise ValueError(f"Stroke dataset is missing required columns: {', '.join(missing)}")

    X = df[required].copy()
    y = df["stroke"].copy()

    for col in numeric_features:
        X[col] = pd.to_numeric(X[col], errors="coerce")

    for col in categorical_features:
        X[col] = X[col].apply(lambda value: str(value).strip() if pd.notna(value) else np.nan)

    return X, y, numeric_features, categorical_features


def evaluate_model(model, X_test, y_test) -> dict:
    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]

    return {
        "accuracy": float(accuracy_score(y_test, y_pred)),
        "precision": float(precision_score(y_test, y_pred, zero_division=0)),
        "recall": float(recall_score(y_test, y_pred, zero_division=0)),
        "f1Score": float(f1_score(y_test, y_pred, zero_division=0)),
        "rocAuc": float(roc_auc_score(y_test, y_prob)),
        "confusionMatrix": confusion_matrix(y_test, y_pred).tolist(),
        "positiveRate": float(np.mean(y_prob)),
    }


def rank_key(result: dict) -> tuple:
    metrics = result["metrics"]
    # For stroke screening, missing a true risk is costly, so recall leads.
    return (
        metrics["recall"],
        metrics["f1Score"],
        metrics["rocAuc"],
        metrics["accuracy"],
    )


def improves_required_metrics(candidate: dict, baseline: dict) -> bool:
    candidate_metrics = candidate["metrics"]
    baseline_metrics = baseline["metrics"]

    return all(
        candidate_metrics[metric] >= baseline_metrics[metric]
        for metric in REQUIRED_ENSEMBLE_METRICS
    ) and any(
        candidate_metrics[metric] > baseline_metrics[metric]
        for metric in REQUIRED_ENSEMBLE_METRICS
    )


def main() -> None:
    args = parse_args()
    project_root = Path(__file__).resolve().parents[2]
    dataset_path = (project_root / args.dataset_path).resolve()
    output_dir = (project_root / args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    df = load_dataset(dataset_path)
    X, y, numeric_features, categorical_features = build_feature_frame(df)

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=args.test_size,
        random_state=RANDOM_STATE,
        stratify=y,
    )

    preprocessor = ColumnTransformer(
        transformers=[
            (
                "numeric",
                Pipeline(
                    steps=[
                        ("imputer", SimpleImputer(strategy="median")),
                        ("scaler", StandardScaler()),
                    ]
                ),
                numeric_features,
            ),
            (
                "categorical",
                Pipeline(
                    steps=[
                        ("imputer", SimpleImputer(strategy="most_frequent")),
                        ("onehot", OneHotEncoder(handle_unknown="ignore")),
                    ]
                ),
                categorical_features,
            ),
        ],
        remainder="drop",
    )

    X_train_t = preprocessor.fit_transform(X_train)
    X_test_t = preprocessor.transform(X_test)

    positive = int((y_train == 1).sum())
    negative = int((y_train == 0).sum())
    scale_pos_weight = float(negative / max(1, positive))

    models = {
        "Logistic Regression": LogisticRegression(
            max_iter=2000,
            class_weight="balanced",
            random_state=RANDOM_STATE,
        ),
        "Decision Tree": DecisionTreeClassifier(
            random_state=RANDOM_STATE,
            class_weight="balanced",
            min_samples_leaf=15,
        ),
        "Random Forest": RandomForestClassifier(
            n_estimators=450,
            random_state=RANDOM_STATE,
            class_weight="balanced_subsample",
            min_samples_leaf=3,
            n_jobs=-1,
        ),
        "XGBoost": XGBClassifier(
            n_estimators=350,
            learning_rate=0.04,
            max_depth=4,
            subsample=0.9,
            colsample_bytree=0.9,
            objective="binary:logistic",
            eval_metric="logloss",
            random_state=RANDOM_STATE,
            scale_pos_weight=scale_pos_weight,
            n_jobs=4,
        ),
    }
    ensemble_model = VotingClassifier(
        estimators=[
            ("logistic_regression", clone(models["Logistic Regression"])),
            ("random_forest", clone(models["Random Forest"])),
            ("xgboost", clone(models["XGBoost"])),
        ],
        voting="soft",
    )

    comparison = []
    best_individual_name = None
    best_individual_model = None
    best_individual_result = None

    for name, model in models.items():
        model.fit(X_train_t, y_train)
        metrics = evaluate_model(model, X_test_t, y_test)
        result = {"algorithm": name, "metrics": metrics}
        comparison.append(result)

        if best_individual_result is None or rank_key(result) > rank_key(best_individual_result):
            best_individual_name = name
            best_individual_model = model
            best_individual_result = result

    ensemble_model.fit(X_train_t, y_train)
    ensemble_metrics = evaluate_model(ensemble_model, X_test_t, y_test)
    ensemble_result = {
        "algorithm": ENSEMBLE_NAME,
        "baseAlgorithms": ENSEMBLE_BASE_ALGORITHMS,
        "metrics": ensemble_metrics,
    }
    comparison.append(ensemble_result)

    ensemble_selected = improves_required_metrics(ensemble_result, best_individual_result)
    if ensemble_selected:
        best_name = ENSEMBLE_NAME
        best_model = ensemble_model
        best_result = ensemble_result
    else:
        best_name = best_individual_name
        best_model = best_individual_model
        best_result = best_individual_result

    model_path = output_dir / "stroke_model.pkl"
    preprocessor_path = output_dir / "stroke_preprocessor.pkl"
    metadata_path = output_dir / "stroke_model_metadata.json"

    joblib.dump(best_model, model_path)
    joblib.dump(preprocessor, preprocessor_path)

    visualization_paths = save_training_visualizations(
        output_dir=output_dir,
        model_slug="stroke",
        model_title="Stroke Risk Prediction",
        y_test=y_test,
        y_pred=best_model.predict(X_test_t),
        y_prob=best_model.predict_proba(X_test_t)[:, 1],
        comparison=comparison,
        selected_algorithm=best_name,
        feature_frame=X,
        target=y,
        numeric_features=numeric_features,
        target_label="Stroke Risk",
    )

    metadata = {
        "selectedAlgorithm": best_name,
        "accuracy": best_result["metrics"]["accuracy"],
        "precision": best_result["metrics"]["precision"],
        "recall": best_result["metrics"]["recall"],
        "f1Score": best_result["metrics"]["f1Score"],
        "rocAuc": best_result["metrics"]["rocAuc"],
        "confusionMatrix": best_result["metrics"]["confusionMatrix"],
        "featuresUsed": numeric_features + categorical_features,
        "numericFeatures": numeric_features,
        "categoricalFeatures": categorical_features,
        "datasetPath": str(dataset_path),
        "visualizations": visualization_paths,
        "classBalance": {
            "trainPositive": positive,
            "trainNegative": negative,
        },
        "selectionPolicy": {
            "bestIndividualAlgorithm": best_individual_name,
            "ensembleAlgorithm": ENSEMBLE_NAME,
            "ensembleBaseAlgorithms": ENSEMBLE_BASE_ALGORITHMS,
            "ensembleSelected": ensemble_selected,
            "requiredEnsembleImprovementMetrics": list(REQUIRED_ENSEMBLE_METRICS),
            "ensembleSelectionRule": (
                "Select the soft-voting ensemble only when it is at least as strong as "
                "the best individual model on every required metric and improves at "
                "least one required metric."
            ),
        },
        "modelComparison": comparison,
    }

    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
