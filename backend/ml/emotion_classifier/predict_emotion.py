import argparse
import re
import string
from pathlib import Path

import joblib


MODULE_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL_PATH = MODULE_DIR / "emotion_classifier.pkl"
DEFAULT_VECTORIZER_PATH = MODULE_DIR / "tfidf_vectorizer.pkl"


def clean_text(text):
    text = "" if text is None else str(text)
    text = text.lower()
    text = text.translate(str.maketrans("", "", string.punctuation))
    text = re.sub(r"\s+", " ", text).strip()
    return text


def predict_emotion(text, model_path=DEFAULT_MODEL_PATH, vectorizer_path=DEFAULT_VECTORIZER_PATH):
    model = joblib.load(model_path)
    vectorizer = joblib.load(vectorizer_path)

    cleaned_text = clean_text(text)
    features = vectorizer.transform([cleaned_text])
    prediction = model.predict(features)[0]

    result = {
        "text": text,
        "cleaned_text": cleaned_text,
        "predicted_emotion": prediction,
    }

    if hasattr(model, "predict_proba"):
        probabilities = model.predict_proba(features)[0]
        result["probabilities"] = {
            label: float(probability)
            for label, probability in zip(model.classes_, probabilities)
        }

    return result


def parse_args():
    parser = argparse.ArgumentParser(description="Predict emotion for one text input.")
    parser.add_argument("text", help="Text to classify.")
    parser.add_argument(
        "--model-path",
        default=DEFAULT_MODEL_PATH,
        help="Path to emotion_classifier.pkl.",
    )
    parser.add_argument(
        "--vectorizer-path",
        default=DEFAULT_VECTORIZER_PATH,
        help="Path to tfidf_vectorizer.pkl.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    result = predict_emotion(args.text, Path(args.model_path), Path(args.vectorizer_path))
    print(result["predicted_emotion"])

    if "probabilities" in result:
        print(result["probabilities"])


if __name__ == "__main__":
    main()
