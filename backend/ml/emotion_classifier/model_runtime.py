"""Startup-loaded, checksum-verified emotion model runtime with v3 rollback."""

import hashlib
import json
import os
from pathlib import Path

import joblib


MODULE_DIR = Path(__file__).resolve().parent
PROJECT_CLASSES = [
    "happiness", "sadness", "loneliness", "anxiety", "anger",
    "cognitive_fog", "neutral",
]
V4_VERSION = "minilm_logistic_regression_v4"
V3_VERSION = "tfidf_linear_svm_calibrated_v3"
V4_ARTIFACT = MODULE_DIR / "domain_hierarchical_experiment" / "candidate_model.joblib"
V4_METADATA = MODULE_DIR / "production_model_metadata_v4.json"
V3_ARTIFACT = MODULE_DIR / "advanced_experiment" / "baseline_v3" / "emotion_pipeline_v3.pkl"
V3_METADATA = MODULE_DIR / "advanced_experiment" / "baseline_v3" / "selected_model_metadata_v3.json"


def _read_json(path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


class EmotionModelRuntime:
    """Load one selected model once and expose a common probability interface."""

    def __init__(self, requested_version=None):
        self.requested_version = requested_version or os.getenv("EMOTION_MODEL_VERSION", V4_VERSION)
        self.model_version = None
        self.metadata = None
        self.classifier = None
        self.embedding_model = None
        self.error = None
        try:
            if self.requested_version == V4_VERSION:
                self._load_v4()
            elif self.requested_version == V3_VERSION:
                self._load_v3()
            else:
                raise ValueError(f"Unsupported EMOTION_MODEL_VERSION: {self.requested_version}")
        except Exception as exc:  # startup health exposes failure; endpoint returns 503
            self.error = f"{type(exc).__name__}: {exc}"

    def _validate_classes(self, classes):
        if set(map(str, classes)) != set(PROJECT_CLASSES):
            raise ValueError("Model label mapping does not match the seven supported classes")

    def _load_v4(self):
        metadata = _read_json(V4_METADATA)
        if metadata.get("model_version") != V4_VERSION:
            raise ValueError("v4 metadata version mismatch")
        if _sha256(V4_ARTIFACT) != metadata.get("artifact_sha256"):
            raise ValueError("v4 classifier checksum mismatch")
        bundle = joblib.load(V4_ARTIFACT)
        classifier = bundle.get("model") if isinstance(bundle, dict) else None
        if bundle.get("architecture") != "flat" or classifier is None:
            raise ValueError("v4 classifier bundle is incompatible")
        self._validate_classes(classifier.classes_)

        # Import lazily so the explicit v3 rollback path does not require MiniLM.
        from sentence_transformers import SentenceTransformer

        embedding_model = SentenceTransformer(
            metadata["embedding_model"], device="cpu", local_files_only=True
        )
        self.metadata = metadata
        self.classifier = classifier
        self.embedding_model = embedding_model
        self.model_version = V4_VERSION

    def _load_v3(self):
        metadata = _read_json(V3_METADATA)
        pipeline = joblib.load(V3_ARTIFACT)
        self._validate_classes(pipeline.classes_)
        self.metadata = metadata
        self.classifier = pipeline
        self.model_version = V3_VERSION

    @property
    def ready(self):
        return self.error is None and self.classifier is not None and self.metadata is not None

    @property
    def classes_(self):
        return self.classifier.classes_ if self.classifier is not None else []

    def predict_proba(self, texts):
        if not self.ready:
            raise RuntimeError(self.error or "Emotion model is not ready")
        if self.model_version == V4_VERSION:
            features = self.embedding_model.encode(
                list(texts), batch_size=32, show_progress_bar=False,
                normalize_embeddings=True,
            )
            return self.classifier.predict_proba(features)
        return self.classifier.predict_proba(list(texts))


def load_runtime(requested_version=None):
    return EmotionModelRuntime(requested_version=requested_version)
