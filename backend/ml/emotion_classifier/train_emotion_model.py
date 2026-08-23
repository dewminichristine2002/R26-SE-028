import argparse
import json
import re
import string
from pathlib import Path

import joblib
import pandas as pd
from sklearn.base import clone
from sklearn.calibration import CalibratedClassifierCV
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import FeatureUnion
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score, classification_report, confusion_matrix, f1_score,
    precision_score, recall_score,
)
from sklearn.model_selection import train_test_split
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline
from sklearn.svm import LinearSVC


SEED = 42
PROJECT_LABELS = [
    "happiness", "sadness", "loneliness", "anxiety", "anger",
    "cognitive_fog", "neutral",
]
MODEL_PREFERENCE = {"logistic_regression": 0, "linear_svm_calibrated": 1, "multinomial_naive_bayes": 2}


def clean_text(text):
    text = "" if pd.isna(text) else str(text).lower()
    text = text.translate(str.maketrans("", "", string.punctuation))
    return re.sub(r"\s+", " ", text).strip()


def load_dataset(path):
    data = pd.read_csv(path)
    required = {"text", "label", "source"}
    if not required.issubset(data.columns):
        raise ValueError(f"Dataset must contain {sorted(required)}")
    data = data[list(required)].copy()
    data["text"] = data["text"].map(clean_text)
    data = data[(data["text"] != "") & data["label"].isin(PROJECT_LABELS)]
    if data["text"].duplicated().any():
        raise ValueError("Exact duplicate texts must be resolved before splitting.")
    missing = set(PROJECT_LABELS).difference(data["label"].unique())
    if missing:
        raise ValueError(f"Missing project labels: {sorted(missing)}")
    return data.reset_index(drop=True)


def split_dataset(data):
    train_validation, test = train_test_split(
        data, test_size=0.20, random_state=SEED, stratify=data["label"]
    )
    train, validation = train_test_split(
        train_validation,
        test_size=0.20,
        random_state=SEED,
        stratify=train_validation["label"],
    )
    train_texts, validation_texts, test_texts = map(set, [train["text"], validation["text"], test["text"]])
    if train_texts & validation_texts or train_texts & test_texts or validation_texts & test_texts:
        raise ValueError("Exact-text leakage detected across train/validation/test splits.")
    return train, validation, test


def build_estimators():
    return {
        "logistic_regression": LogisticRegression(
            max_iter=1500, class_weight="balanced", random_state=SEED
        ),
        "linear_svm_calibrated": CalibratedClassifierCV(
            LinearSVC(class_weight="balanced", random_state=SEED),
            method="sigmoid",
            cv=5,
        ),
        "multinomial_naive_bayes": MultinomialNB(),
    }


def build_pipeline(estimator):
    return Pipeline([
        ("tfidf", FeatureUnion([
            ("word", TfidfVectorizer(ngram_range=(1, 2), max_features=6000, sublinear_tf=True)),
            ("character", TfidfVectorizer(
                analyzer="char_wb", ngram_range=(3, 5), max_features=5000, sublinear_tf=True
            )),
        ])),
        ("model", estimator),
    ])


def evaluate(pipeline, data):
    predicted = pipeline.predict(data["text"])
    report = classification_report(
        data["label"], predicted, labels=PROJECT_LABELS, output_dict=True, zero_division=0
    )
    return {
        "accuracy": accuracy_score(data["label"], predicted),
        "macro_precision": precision_score(data["label"], predicted, labels=PROJECT_LABELS, average="macro", zero_division=0),
        "macro_recall": recall_score(data["label"], predicted, labels=PROJECT_LABELS, average="macro", zero_division=0),
        "macro_f1": f1_score(data["label"], predicted, labels=PROJECT_LABELS, average="macro", zero_division=0),
        "weighted_f1": f1_score(data["label"], predicted, labels=PROJECT_LABELS, average="weighted", zero_division=0),
        "classification_report": report,
        "confusion_matrix": confusion_matrix(data["label"], predicted, labels=PROJECT_LABELS),
        "predicted": predicted,
    }


def select_threshold(pipeline, validation):
    probabilities = pipeline.predict_proba(validation["text"])
    predictions = pipeline.classes_[probabilities.argmax(axis=1)]
    confidences = probabilities.max(axis=1)
    rows = []
    for threshold in [0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80]:
        accepted = confidences >= threshold
        coverage = float(accepted.mean())
        accepted_accuracy = float((predictions[accepted] == validation.loc[accepted, "label"]).mean()) if accepted.any() else 0.0
        rows.append({"threshold": threshold, "coverage": coverage, "accepted_accuracy": accepted_accuracy})
    # Conversational routing needs useful model coverage as well as precision. A
    # 75% floor prevents a superficially accurate threshold from sending most
    # ordinary utterances to the rule fallback.
    eligible = [row for row in rows if row["coverage"] >= 0.75]
    chosen = max(eligible or rows, key=lambda row: (row["accepted_accuracy"], row["coverage"], -row["threshold"]))
    return chosen, rows


def save_report_csv(report, path):
    rows = []
    for label in PROJECT_LABELS:
        values = report[label]
        rows.append({
            "label": label,
            "precision": values["precision"],
            "recall": values["recall"],
            "f1": values["f1-score"],
            "support": int(values["support"]),
        })
    pd.DataFrame(rows).to_csv(path, index=False)


def train(dataset_path, output_dir, results_dir):
    data = load_dataset(dataset_path)
    train_data, validation_data, test_data = split_dataset(data)
    results_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    validation_results = {}
    trained_on_train = {}
    for name, estimator in build_estimators().items():
        pipeline = build_pipeline(estimator)
        pipeline.fit(train_data["text"], train_data["label"])
        trained_on_train[name] = pipeline
        validation_results[name] = evaluate(pipeline, validation_data)

    selected_name = max(
        validation_results,
        key=lambda name: (
            validation_results[name]["macro_f1"],
            validation_results[name]["macro_recall"],
            -MODEL_PREFERENCE[name],
        ),
    )
    threshold_choice, threshold_curve = select_threshold(trained_on_train[selected_name], validation_data)

    train_validation = pd.concat([train_data, validation_data], ignore_index=True)
    test_results = {}
    final_pipelines = {}
    for name, estimator in build_estimators().items():
        pipeline = build_pipeline(clone(estimator))
        pipeline.fit(train_validation["text"], train_validation["label"])
        final_pipelines[name] = pipeline
        test_results[name] = evaluate(pipeline, test_data)
        save_report_csv(test_results[name]["classification_report"], results_dir / f"classification_report_{name}.csv")
        pd.DataFrame(
            test_results[name]["confusion_matrix"], index=PROJECT_LABELS, columns=PROJECT_LABELS
        ).to_csv(results_dir / f"confusion_matrix_{name}.csv")

    comparison_rows = []
    for name in build_estimators():
        comparison_rows.append({
            "model": name,
            "validation_macro_f1": validation_results[name]["macro_f1"],
            "accuracy": test_results[name]["accuracy"],
            "macro_precision": test_results[name]["macro_precision"],
            "macro_recall": test_results[name]["macro_recall"],
            "macro_f1": test_results[name]["macro_f1"],
            "weighted_f1": test_results[name]["weighted_f1"],
        })
    pd.DataFrame(comparison_rows).to_csv(results_dir / "model_comparison.csv", index=False)
    pd.DataFrame(threshold_curve).to_csv(results_dir / "confidence_threshold_evaluation.csv", index=False)

    model_version = f"tfidf_{selected_name}_v2"
    selected_pipeline = final_pipelines[selected_name]
    joblib.dump(selected_pipeline, output_dir / "emotion_pipeline.pkl")
    metadata = {
        "model_version": model_version,
        "selected_model": selected_name,
        "selection_metric": "validation_macro_f1",
        "selection_tiebreak": "validation_macro_recall_then_model_preference",
        "confidence_semantics": "maximum calibrated/predict_proba class probability",
        "confidence_threshold": threshold_choice["threshold"],
        "threshold_validation_coverage": threshold_choice["coverage"],
        "threshold_validation_accepted_accuracy": threshold_choice["accepted_accuracy"],
        "supported_classes": PROJECT_LABELS,
        "random_seed": SEED,
        "split": {"train": len(train_data), "validation": len(validation_data), "test": len(test_data)},
        "dataset_rows": len(data),
        "dataset_distribution": data["label"].value_counts().sort_index().to_dict(),
        "source_distribution": data["source"].value_counts().sort_index().to_dict(),
        "validation_metrics": {
            name: {key: value for key, value in metrics.items() if key not in {"classification_report", "confusion_matrix", "predicted"}}
            for name, metrics in validation_results.items()
        },
        "test_metrics": {
            name: {key: value for key, value in metrics.items() if key not in {"classification_report", "confusion_matrix", "predicted"}}
            for name, metrics in test_results.items()
        },
    }
    with open(output_dir / "selected_model_metadata.json", "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2)
    with open(results_dir / "selected_model_metadata.json", "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2)
    print(json.dumps(metadata, indent=2))


def parse_args():
    module_dir = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description="Train and compare ElderMeds emotion models.")
    parser.add_argument("--dataset", type=Path, default=module_dir / "data" / "training_dataset_v2.csv")
    parser.add_argument("--output-dir", type=Path, default=module_dir)
    parser.add_argument("--results-dir", type=Path, default=module_dir / "results")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    train(args.dataset, args.output_dir, args.results_dir)
