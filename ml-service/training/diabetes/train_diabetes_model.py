import argparse
import json
from pathlib import Path
import sys

import joblib
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.compose import ColumnTransformer
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
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier, VotingClassifier
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier

TRAINING_ROOT = Path(__file__).resolve().parents[1]
if str(TRAINING_ROOT) not in sys.path:
    sys.path.insert(0, str(TRAINING_ROOT))

from visualization_utils import save_training_visualizations

RANDOM_STATE = 42
DEFAULT_DATASET = ""
DEFAULT_OUTPUT_DIR = "app/models"
ENSEMBLE_NAME = "Soft Voting Ensemble"
ENSEMBLE_BASE_ALGORITHMS = ["Logistic Regression", "Random Forest", "XGBoost"]
REQUIRED_ENSEMBLE_METRICS = ("accuracy", "recall", "f1Score", "rocAuc")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train ElderMeds diabetes risk model.")
    parser.add_argument("--dataset-path", default=DEFAULT_DATASET)
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--test-size", type=float, default=0.2)
    return parser.parse_args()


def resolve_dataset_path(project_root: Path, dataset_arg: str) -> Path:
    if dataset_arg:
        return (project_root / dataset_arg).resolve()

    candidates = [
        "data/raw/diabetes_binary_5050split_health_indicators_BRFSS2015.csv",
        "data/raw/diabetes_binary_health_indicators_BRFSS2015.csv",
        "data/raw/diabetes_012_health_indicators_BRFSS2015.csv",
    ]

    for candidate in candidates:
        candidate_path = (project_root / candidate).resolve()
        if candidate_path.exists():
            return candidate_path

    # Fall back to a standard expected path for clear error messaging.
    return (project_root / "data/raw/diabetes_binary_health_indicators_BRFSS2015.csv").resolve()


def _to_int_binary(series: pd.Series) -> pd.Series:
    return series.apply(lambda x: 1 if str(x).strip().lower() in {"1", "true", "yes"} else 0).astype(int)


def load_dataset(dataset_path: Path) -> pd.DataFrame:
    if not dataset_path.exists():
        raise FileNotFoundError(
            f"Dataset not found at {dataset_path}. Place diabetes_binary_health_indicators_BRFSS2015.csv there."
        )

    df = pd.read_csv(dataset_path)

    if "Diabetes_binary" in df.columns:
        # Binary source format: 0 = no diabetes, 1 = diabetes/pre-diabetes.
        df = df[df["Diabetes_binary"].isin([0, 1])].copy()
        df["Diabetes_binary"] = df["Diabetes_binary"].astype(int)
        return df

    if "Diabetes_012" in df.columns:
        # 0/1/2 source format. For phase 1 binary risk:
        # 0 -> 0 (no diabetes), 1/2 -> 1 (pre-diabetes or diabetes).
        df = df[df["Diabetes_012"].isin([0, 1, 2])].copy()
        df["Diabetes_binary"] = (df["Diabetes_012"].astype(int) > 0).astype(int)
        return df

    raise ValueError("Dataset must contain either 'Diabetes_binary' or 'Diabetes_012' target column.")


def build_feature_frame(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series, list[str]]:
    # Feature mapping aligned with app-level phase 1 requirements.
    candidate_features = [
        "Age",                    # App: age
        "Sex",                    # App: gender
        "BMI",                    # App: height + weight -> BMI
        "HighBP",                 # App: BP
        "Smoker",                 # App: smoking status
        "PhysActivity",           # App: physical activity level
        "HeartDiseaseorAttack",   # App: existing disease history
        "Stroke",                 # App: existing disease history
        "GenHlth",                # Optional general health context
        "DiffWalk",               # Optional mobility context
    ]

    present_features = [name for name in candidate_features if name in df.columns]
    if len(present_features) < 5:
        raise ValueError(
            "Insufficient mapped diabetes features found. Ensure this is the BRFSS 2015 binary indicators file."
        )

    X = df[present_features].copy()
    y = df["Diabetes_binary"].copy()

    for col in present_features:
        if X[col].dtype == object:
            X[col] = _to_int_binary(X[col])

    return X, y, present_features


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
    # Prioritize recall and F1, then ROC-AUC and accuracy.
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
    dataset_path = resolve_dataset_path(project_root, args.dataset_path)
    output_dir = (project_root / args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    df = load_dataset(dataset_path)
    X, y, features_used = build_feature_frame(df)

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=args.test_size,
        random_state=RANDOM_STATE,
        stratify=y,
    )

    numeric_features = list(X.columns)
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
            )
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
            min_samples_leaf=20,
        ),
        "Random Forest": RandomForestClassifier(
            n_estimators=350,
            random_state=RANDOM_STATE,
            class_weight="balanced_subsample",
            n_jobs=-1,
        ),
        "XGBoost": XGBClassifier(
            n_estimators=350,
            learning_rate=0.05,
            max_depth=5,
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

    model_path = output_dir / "diabetes_model.pkl"
    preprocessor_path = output_dir / "diabetes_preprocessor.pkl"
    metadata_path = output_dir / "diabetes_model_metadata.json"

    joblib.dump(best_model, model_path)
    joblib.dump(preprocessor, preprocessor_path)

    visualization_paths = save_training_visualizations(
        output_dir=output_dir,
        model_slug="diabetes",
        model_title="Diabetes Risk Prediction",
        y_test=y_test,
        y_pred=best_model.predict(X_test_t),
        y_prob=best_model.predict_proba(X_test_t)[:, 1],
        comparison=comparison,
        selected_algorithm=best_name,
        feature_frame=X,
        target=y,
        numeric_features=numeric_features,
        target_label="Diabetes Risk",
    )

    metadata = {
        "selectedAlgorithm": best_name,
        "accuracy": best_result["metrics"]["accuracy"],
        "precision": best_result["metrics"]["precision"],
        "recall": best_result["metrics"]["recall"],
        "f1Score": best_result["metrics"]["f1Score"],
        "rocAuc": best_result["metrics"]["rocAuc"],
        "confusionMatrix": best_result["metrics"]["confusionMatrix"],
        "featuresUsed": features_used,
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
