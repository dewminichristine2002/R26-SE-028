import argparse
import json
import re
import string
from pathlib import Path

import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline
from sklearn.svm import LinearSVC


PROJECT_LABELS = {
    "happiness",
    "sadness",
    "loneliness",
    "anxiety",
    "anger",
    "cognitive_fog",
    "neutral",
}

MODULE_DIR = Path(__file__).resolve().parent
DEFAULT_MAPPING_PATH = MODULE_DIR / "label_mapping.json"


def clean_text(text):
    text = "" if pd.isna(text) else str(text)
    text = text.lower()
    text = text.translate(str.maketrans("", "", string.punctuation))
    text = re.sub(r"\s+", " ", text).strip()
    return text


def normalize_label(label):
    label = "" if pd.isna(label) else str(label)
    label = label.lower().strip()
    label = re.sub(r"[\s-]+", "_", label)
    label = re.sub(r"[^a-z0-9_]", "", label)
    label = re.sub(r"_+", "_", label).strip("_")
    return label


def load_label_mapping(mapping_path):
    with open(mapping_path, "r", encoding="utf-8") as mapping_file:
        raw_mapping = json.load(mapping_file)

    return {
        normalize_label(raw_label): normalize_label(project_label)
        for raw_label, project_label in raw_mapping.items()
        if normalize_label(project_label) in PROJECT_LABELS
    }


def load_dataset(dataset_path, label_mapping):
    data = pd.read_csv(dataset_path)
    required_columns = {"text", "label"}
    missing_columns = required_columns.difference(data.columns)
    if missing_columns:
        missing = ", ".join(sorted(missing_columns))
        raise ValueError(f"Dataset is missing required column(s): {missing}")

    data = data[["text", "label"]].copy()
    data["text"] = data["text"].apply(clean_text)
    data["raw_label"] = data["label"].apply(normalize_label)
    data["label"] = data["raw_label"].map(label_mapping)
    data = data.dropna(subset=["label"])
    data = data[data["text"] != ""]

    if data.empty:
        raise ValueError("No usable rows remain after cleaning and label mapping.")

    if data["label"].nunique() < 2:
        raise ValueError("At least two mapped emotion labels are required for training.")

    return data[["text", "label"]]


def build_models():
    return {
        "logistic_regression": LogisticRegression(max_iter=1000, class_weight="balanced", random_state=42),
        "linear_svm": LinearSVC(class_weight="balanced", random_state=42),
        "multinomial_naive_bayes": MultinomialNB(),
    }


def evaluate_model(name, model, vectorizer, train_texts, test_texts, train_labels, test_labels):
    pipeline = Pipeline(
        [
            ("tfidf", vectorizer),
            ("model", model),
        ]
    )
    pipeline.fit(train_texts, train_labels)
    predictions = pipeline.predict(test_texts)

    labels = sorted(PROJECT_LABELS)
    report = classification_report(
        test_labels,
        predictions,
        labels=labels,
        output_dict=True,
        zero_division=0,
    )

    metrics = {
        "accuracy": accuracy_score(test_labels, predictions),
        "precision_macro": precision_score(test_labels, predictions, average="macro", zero_division=0),
        "recall_macro": recall_score(test_labels, predictions, average="macro", zero_division=0),
        "f1_macro": f1_score(test_labels, predictions, average="macro", zero_division=0),
        "classification_report": report,
    }

    return {
        "name": name,
        "pipeline": pipeline,
        "metrics": metrics,
    }


def split_dataset(data):
    label_counts = data["label"].value_counts()
    stratify_labels = data["label"] if label_counts.min() >= 2 else None

    return train_test_split(
        data["text"],
        data["label"],
        test_size=0.2,
        random_state=42,
        stratify=stratify_labels,
    )


def save_artifacts(best_result, all_metrics, output_dir):
    output_dir.mkdir(parents=True, exist_ok=True)

    pipeline = best_result["pipeline"]
    joblib.dump(pipeline.named_steps["model"], output_dir / "emotion_classifier.pkl")
    joblib.dump(pipeline.named_steps["tfidf"], output_dir / "tfidf_vectorizer.pkl")

    metrics_payload = {
        "selected_model": best_result["name"],
        "selection_metric": "f1_macro",
        "models": all_metrics,
    }

    with open(output_dir / "model_metrics.json", "w", encoding="utf-8") as metrics_file:
        json.dump(metrics_payload, metrics_file, indent=2)


def train(dataset_path, mapping_path, output_dir):
    label_mapping = load_label_mapping(mapping_path)
    data = load_dataset(dataset_path, label_mapping)
    train_texts, test_texts, train_labels, test_labels = split_dataset(data)

    results = []
    for name, model in build_models().items():
        vectorizer = TfidfVectorizer(ngram_range=(1, 2), max_features=5000)
        result = evaluate_model(name, model, vectorizer, train_texts, test_texts, train_labels, test_labels)
        results.append(result)

    best_result = max(results, key=lambda result: result["metrics"]["f1_macro"])
    all_metrics = {result["name"]: result["metrics"] for result in results}
    save_artifacts(best_result, all_metrics, output_dir)

    print(f"Training rows: {len(train_texts)}")
    print(f"Test rows: {len(test_texts)}")
    print(f"Selected model: {best_result['name']}")
    print(f"Macro F1: {best_result['metrics']['f1_macro']:.4f}")
    print(f"Saved artifacts to: {output_dir}")


def parse_args():
    parser = argparse.ArgumentParser(description="Train the Component 4 emotion classifier.")
    parser.add_argument("dataset_csv", help="Path to a CSV dataset with text,label columns.")
    parser.add_argument(
        "--label-mapping",
        default=DEFAULT_MAPPING_PATH,
        help="Path to label_mapping.json. Defaults to this module's mapping file.",
    )
    parser.add_argument(
        "--output-dir",
        default=MODULE_DIR,
        help="Directory where emotion_classifier.pkl, tfidf_vectorizer.pkl, and model_metrics.json are saved.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    train(
        dataset_path=Path(args.dataset_csv),
        mapping_path=Path(args.label_mapping),
        output_dir=Path(args.output_dir),
    )


if __name__ == "__main__":
    main()
