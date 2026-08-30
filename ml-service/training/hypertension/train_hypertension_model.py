import argparse
import json
from pathlib import Path
import sys
from typing import Any

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
    balanced_accuracy_score,
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
DEFAULT_DATASET = "data/raw/hypertension_dataset.csv"
DEFAULT_OUTPUT_DIR = "app/models"
ENSEMBLE_NAME = "Soft Voting Ensemble"
ENSEMBLE_BASE_ALGORITHMS = ["Logistic Regression", "Random Forest", "XGBoost"]
REQUIRED_ENSEMBLE_METRICS = ("accuracy", "recall", "f1Score", "rocAuc")
JOBLIB_COMPRESS = 3
ROC_AUC_TIE_TOLERANCE = 0.01
MODEL_COMPLEXITY_RANK = {
    "Logistic Regression": 0,
    "Decision Tree": 1,
    "XGBoost": 2,
    "Random Forest": 3,
    ENSEMBLE_NAME: 4,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train ElderMeds hypertension risk model.")
    parser.add_argument("--dataset-path", default=DEFAULT_DATASET)
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--test-size", type=float, default=0.2)
    return parser.parse_args()


def _dataset_label_to_binary(series: pd.Series) -> pd.Series:
    normalized = series.astype(str).str.strip().str.lower()
    return normalized.isin(["high", "1", "yes"]).astype(int)


def _build_target_metadata(df: pd.DataFrame) -> dict[str, Any]:
    dataset_label = _dataset_label_to_binary(df["Hypertension"])
    systolic = pd.to_numeric(df["Systolic_BP"], errors="coerce")
    diastolic = pd.to_numeric(df["Diastolic_BP"], errors="coerce")
    clinical_label = ((systolic >= 140) | (diastolic >= 90)).astype(int)

    return {
        "targetMode": "dataset-label",
        "targetColumn": "Hypertension_binary",
        "targetDefinition": "1 when the source Hypertension column is High/1/Yes; otherwise 0.",
        "sourceHypertensionPositiveRate": float(dataset_label.mean()),
        "clinicalBpPositiveRate": float(clinical_label.mean()),
        "sourceClinicalAgreement": float((dataset_label == clinical_label).mean()),
        "dataSignalWarning": (
            "The source label has weak agreement with the BP-derived clinical indicator; "
            "high accuracy/recall/F1 can be driven by the majority class while ROC-AUC "
            "remains close to random."
        ),
    }


def load_dataset(dataset_path: Path) -> tuple[pd.DataFrame, dict[str, Any]]:
    if not dataset_path.exists():
        raise FileNotFoundError(
            f"Dataset not found at {dataset_path}. Place hypertension_dataset.csv in data/raw."
        )

    df = pd.read_csv(dataset_path, na_values=["N/A", "Unknown", ""])
    if "Hypertension" not in df.columns:
        raise ValueError("Hypertension dataset must contain a 'Hypertension' target column.")

    normalized = df["Hypertension"].astype(str).str.strip().str.lower()
    df = df[normalized.isin(["high", "low", "1", "0", "yes", "no"])].copy()
    if df.empty:
        raise ValueError("Hypertension dataset has no valid target rows after label normalization.")

    df["Hypertension_binary"] = _dataset_label_to_binary(df["Hypertension"])
    target_metadata = _build_target_metadata(df)
    return df, target_metadata


def build_feature_frame(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series, list[str], list[str]]:
    numeric_features = [
        "Age",
        "BMI",
        "Cholesterol",
        "Systolic_BP",
        "Diastolic_BP",
        "Alcohol_Intake",
        "Stress_Level",
        "Salt_Intake",
        "Sleep_Duration",
        "Heart_Rate",
        "LDL",
        "HDL",
        "Triglycerides",
        "Glucose",
    ]
    categorical_features = [
        "Country",
        "Smoking_Status",
        "Physical_Activity_Level",
        "Family_History",
        "Diabetes",
        "Gender",
        "Education_Level",
        "Employment_Status",
    ]
    required = numeric_features + categorical_features
    missing = [name for name in required if name not in df.columns]
    if missing:
        raise ValueError(f"Hypertension dataset is missing required columns: {', '.join(missing)}")

    X = df[required].copy()
    y = df["Hypertension_binary"].copy()

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
        "balancedAccuracy": float(balanced_accuracy_score(y_test, y_pred)),
        "precision": float(precision_score(y_test, y_pred, zero_division=0)),
        "recall": float(recall_score(y_test, y_pred, zero_division=0)),
        "f1Score": float(f1_score(y_test, y_pred, zero_division=0)),
        "rocAuc": float(roc_auc_score(y_test, y_prob)),
        "confusionMatrix": confusion_matrix(y_test, y_pred).tolist(),
        "positiveRate": float(np.mean(y_prob)),
    }


def rank_key(result: dict) -> tuple:
    metrics = result["metrics"]
    # Align hypertension selection with the requested headline metrics.
    return (
        metrics["accuracy"],
        metrics["recall"],
        metrics["f1Score"],
        metrics["rocAuc"],
    )


def is_better_individual(candidate: dict, baseline: dict) -> bool:
    candidate_metrics = candidate["metrics"]
    baseline_metrics = baseline["metrics"]

    for metric in ("accuracy", "recall", "f1Score"):
        diff = candidate_metrics[metric] - baseline_metrics[metric]
        if abs(diff) > 1e-12:
            return diff > 0

    auc_diff = candidate_metrics["rocAuc"] - baseline_metrics["rocAuc"]
    if abs(auc_diff) > ROC_AUC_TIE_TOLERANCE:
        return auc_diff > 0

    return MODEL_COMPLEXITY_RANK.get(candidate["algorithm"], 99) < MODEL_COMPLEXITY_RANK.get(
        baseline["algorithm"],
        99,
    )


def improves_required_metrics(candidate: dict, baseline: dict) -> bool:
    candidate_metrics = candidate["metrics"]
    baseline_metrics = baseline["metrics"]

    return all(
        candidate_metrics[metric] >= baseline_metrics[metric]
        for metric in REQUIRED_ENSEMBLE_METRICS
    ) and (
        candidate_metrics["accuracy"] > baseline_metrics["accuracy"]
        or candidate_metrics["recall"] > baseline_metrics["recall"]
        or candidate_metrics["f1Score"] > baseline_metrics["f1Score"]
        or candidate_metrics["rocAuc"] > baseline_metrics["rocAuc"] + ROC_AUC_TIE_TOLERANCE
    )


def main() -> None:
    args = parse_args()
    project_root = Path(__file__).resolve().parents[2]
    dataset_path = (project_root / args.dataset_path).resolve()
    output_dir = (project_root / args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    df, target_metadata = load_dataset(dataset_path)
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

    models = {
        "Logistic Regression": LogisticRegression(
            max_iter=2000,
            random_state=RANDOM_STATE,
        ),
        "Decision Tree": DecisionTreeClassifier(
            random_state=RANDOM_STATE,
            min_samples_leaf=40,
        ),
        "Random Forest": RandomForestClassifier(
            n_estimators=80,
            max_depth=8,
            random_state=RANDOM_STATE,
            min_samples_leaf=10,
            n_jobs=-1,
        ),
        "XGBoost": XGBClassifier(
            n_estimators=250,
            learning_rate=0.05,
            max_depth=5,
            subsample=0.9,
            colsample_bytree=0.9,
            objective="binary:logistic",
            eval_metric="logloss",
            random_state=RANDOM_STATE,
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

        if best_individual_result is None or is_better_individual(result, best_individual_result):
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

    model_path = output_dir / "hypertension_model.pkl"
    preprocessor_path = output_dir / "hypertension_preprocessor.pkl"
    metadata_path = output_dir / "hypertension_model_metadata.json"

    joblib.dump(best_model, model_path, compress=JOBLIB_COMPRESS)
    joblib.dump(preprocessor, preprocessor_path, compress=JOBLIB_COMPRESS)

    numeric_defaults = {
        col: float(X_train[col].median()) if pd.notna(X_train[col].median()) else 0.0
        for col in numeric_features
    }
    categorical_defaults = {}
    for col in categorical_features:
        mode = X_train[col].dropna().mode()
        categorical_defaults[col] = str(mode.iloc[0]) if not mode.empty else ""

    visualization_paths = save_training_visualizations(
        output_dir=output_dir,
        model_slug="hypertension",
        model_title="Hypertension Risk Prediction",
        y_test=y_test,
        y_pred=best_model.predict(X_test_t),
        y_prob=best_model.predict_proba(X_test_t)[:, 1],
        comparison=comparison,
        selected_algorithm=best_name,
        feature_frame=X,
        target=y,
        numeric_features=numeric_features,
        target_label="Hypertension Risk",
    )

    metadata = {
        "selectedAlgorithm": best_name,
        "accuracy": best_result["metrics"]["accuracy"],
        "balancedAccuracy": best_result["metrics"]["balancedAccuracy"],
        "precision": best_result["metrics"]["precision"],
        "recall": best_result["metrics"]["recall"],
        "f1Score": best_result["metrics"]["f1Score"],
        "rocAuc": best_result["metrics"]["rocAuc"],
        "confusionMatrix": best_result["metrics"]["confusionMatrix"],
        "featuresUsed": numeric_features + categorical_features,
        "numericFeatures": numeric_features,
        "categoricalFeatures": categorical_features,
        "numericDefaults": numeric_defaults,
        "categoricalDefaults": categorical_defaults,
        "datasetPath": str(dataset_path),
        "visualizations": visualization_paths,
        "target": target_metadata,
        "classBalance": {
            "trainPositive": positive,
            "trainNegative": negative,
        },
        "selectionPolicy": {
            "bestIndividualAlgorithm": best_individual_name,
            "individualSelectionPriority": ["accuracy", "recall", "f1Score", "rocAuc"],
            "compactArtifactTieBreak": (
                "When accuracy, recall, and F1-score are equal, ROC-AUC differences "
                f"within {ROC_AUC_TIE_TOLERANCE} are treated as a tie and the "
                "smaller/less complex model is preferred."
            ),
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
