from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Sequence

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.metrics import auc, confusion_matrix, roc_curve


LABELS = ["No risk", "Risk"]
METRIC_KEYS = [
    ("accuracy", "Accuracy"),
    ("precision", "Precision"),
    ("recall", "Recall"),
    ("f1Score", "F1-score"),
    ("rocAuc", "ROC-AUC"),
]


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    return slug or "training"


def _save_figure(fig: plt.Figure, path: Path) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(path, dpi=180, bbox_inches="tight")
    plt.close(fig)
    return str(path)


def _plot_confusion_matrix(
    y_true: Sequence[int],
    y_pred: Sequence[int],
    title: str,
    path: Path,
) -> str:
    matrix = confusion_matrix(y_true, y_pred, labels=[0, 1])
    fig, ax = plt.subplots(figsize=(5.4, 4.6))
    image = ax.imshow(matrix, cmap="Blues")
    ax.set_title(f"{title}\nConfusion Matrix", fontsize=13, fontweight="bold")
    ax.set_xlabel("Predicted label")
    ax.set_ylabel("True label")
    ax.set_xticks(np.arange(len(LABELS)))
    ax.set_yticks(np.arange(len(LABELS)))
    ax.set_xticklabels(LABELS)
    ax.set_yticklabels(LABELS)

    threshold = matrix.max() / 2 if matrix.size else 0
    for row in range(matrix.shape[0]):
        for col in range(matrix.shape[1]):
            color = "white" if matrix[row, col] > threshold else "#172033"
            ax.text(col, row, str(matrix[row, col]), ha="center", va="center", color=color, fontweight="bold")

    fig.colorbar(image, ax=ax, fraction=0.046, pad=0.04)
    return _save_figure(fig, path)


def _plot_roc_curve(
    y_true: Sequence[int],
    y_prob: Sequence[float] | None,
    title: str,
    path: Path,
) -> str | None:
    if y_prob is None or len(np.unique(y_true)) < 2:
        return None

    fpr, tpr, _ = roc_curve(y_true, y_prob)
    roc_auc = auc(fpr, tpr)

    fig, ax = plt.subplots(figsize=(5.6, 4.6))
    ax.plot(fpr, tpr, color="#2576a6", linewidth=2.5, label=f"ROC-AUC = {roc_auc:.3f}")
    ax.plot([0, 1], [0, 1], color="#9a8c7a", linestyle="--", linewidth=1.4, label="Random")
    ax.set_title(f"{title}\nROC Curve", fontsize=13, fontweight="bold")
    ax.set_xlabel("False positive rate")
    ax.set_ylabel("True positive rate")
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1.02)
    ax.grid(True, alpha=0.25)
    ax.legend(loc="lower right")
    return _save_figure(fig, path)


def _plot_metric_comparison(
    comparison: Sequence[dict[str, Any]],
    selected_algorithm: str,
    title: str,
    path: Path,
) -> str | None:
    rows = [row for row in comparison if isinstance(row.get("metrics"), dict)]
    if not rows:
        return None

    available_metrics = [
        (key, label)
        for key, label in METRIC_KEYS
        if any(key in row["metrics"] for row in rows)
    ]
    if not available_metrics:
        return None

    algorithms = [str(row.get("algorithm", "Model")) for row in rows]
    x_positions = np.arange(len(algorithms))
    width = min(0.16, 0.78 / max(1, len(available_metrics)))

    fig, ax = plt.subplots(figsize=(max(7.0, len(algorithms) * 1.35), 4.8))
    offsets = np.linspace(
        -width * (len(available_metrics) - 1) / 2,
        width * (len(available_metrics) - 1) / 2,
        len(available_metrics),
    )

    colors = ["#2f6654", "#2576a6", "#a93447", "#985111", "#5b3ca4"]
    for index, ((metric_key, label), offset) in enumerate(zip(available_metrics, offsets)):
        values = [float(row["metrics"].get(metric_key, 0.0) or 0.0) for row in rows]
        ax.bar(x_positions + offset, values, width, label=label, color=colors[index % len(colors)])

    selected_index = algorithms.index(selected_algorithm) if selected_algorithm in algorithms else None
    if selected_index is not None:
        ax.axvspan(selected_index - 0.5, selected_index + 0.5, color="#fff4b8", alpha=0.36, zorder=0)

    ax.set_title(f"{title}\nModel Metrics Comparison", fontsize=13, fontweight="bold")
    ax.set_ylabel("Score")
    ax.set_ylim(0, 1.05)
    ax.set_xticks(x_positions)
    ax.set_xticklabels(algorithms, rotation=18, ha="right")
    ax.grid(axis="y", alpha=0.25)
    ax.legend(ncol=min(3, len(available_metrics)), loc="upper center", bbox_to_anchor=(0.5, -0.22))
    return _save_figure(fig, path)


def _numeric_correlation_frame(
    feature_frame: pd.DataFrame,
    target: Sequence[int],
    numeric_features: Sequence[str],
    target_label: str,
) -> pd.DataFrame:
    data = pd.DataFrame(index=feature_frame.index)
    for feature in numeric_features:
        if feature in feature_frame.columns:
            data[feature] = pd.to_numeric(feature_frame[feature], errors="coerce")
    data[target_label] = pd.to_numeric(pd.Series(target, index=feature_frame.index), errors="coerce")
    return data.dropna(axis=1, how="all")


def _plot_correlation_heatmap(correlation: pd.DataFrame, title: str, path: Path) -> str | None:
    if correlation.shape[0] < 2:
        return None

    labels = correlation.columns.tolist()
    figure_size = max(7.0, min(12.0, len(labels) * 0.72))
    fig, ax = plt.subplots(figsize=(figure_size, figure_size * 0.86))
    image = ax.imshow(correlation.values, cmap="RdBu_r", vmin=-1, vmax=1)
    ax.set_title(f"{title}\nNumeric Feature Correlation", fontsize=13, fontweight="bold")
    ax.set_xticks(np.arange(len(labels)))
    ax.set_yticks(np.arange(len(labels)))
    ax.set_xticklabels(labels, rotation=45, ha="right")
    ax.set_yticklabels(labels)

    if len(labels) <= 16:
        for row in range(len(labels)):
            for col in range(len(labels)):
                value = correlation.iloc[row, col]
                color = "white" if abs(value) >= 0.62 else "#172033"
                ax.text(col, row, f"{value:.2f}", ha="center", va="center", color=color, fontsize=7)

    fig.colorbar(image, ax=ax, fraction=0.046, pad=0.04, label="Pearson correlation")
    return _save_figure(fig, path)


def _plot_target_correlation(correlation: pd.DataFrame, target_label: str, title: str, path: Path) -> str | None:
    if target_label not in correlation.columns:
        return None

    values = correlation[target_label].drop(labels=[target_label], errors="ignore").dropna()
    if values.empty:
        return None

    values = values.reindex(values.abs().sort_values(ascending=True).index)
    colors = ["#a93447" if value < 0 else "#2f6654" for value in values]

    fig, ax = plt.subplots(figsize=(7.2, max(4.2, len(values) * 0.38)))
    ax.barh(values.index, values.values, color=colors)
    ax.axvline(0, color="#3d3833", linewidth=1)
    ax.set_title(f"{title}\nFeature Correlation With Target", fontsize=13, fontweight="bold")
    ax.set_xlabel("Pearson correlation")
    ax.set_xlim(-1, 1)
    ax.grid(axis="x", alpha=0.25)
    return _save_figure(fig, path)


def save_training_visualizations(
    *,
    output_dir: Path,
    model_slug: str,
    model_title: str,
    y_test: Sequence[int],
    y_pred: Sequence[int],
    y_prob: Sequence[float] | None,
    comparison: Sequence[dict[str, Any]],
    selected_algorithm: str,
    feature_frame: pd.DataFrame,
    target: Sequence[int],
    numeric_features: Sequence[str],
    target_label: str,
) -> dict[str, str]:
    visual_dir = output_dir / "training_visualizations" / _slugify(model_slug)
    visual_dir.mkdir(parents=True, exist_ok=True)

    paths: dict[str, str] = {
        "confusionMatrix": _plot_confusion_matrix(
            y_test,
            y_pred,
            model_title,
            visual_dir / "confusion_matrix.png",
        )
    }

    roc_path = _plot_roc_curve(y_test, y_prob, model_title, visual_dir / "roc_curve.png")
    if roc_path:
        paths["rocCurve"] = roc_path

    metrics_path = _plot_metric_comparison(
        comparison,
        selected_algorithm,
        model_title,
        visual_dir / "model_metrics_comparison.png",
    )
    if metrics_path:
        paths["modelMetricsComparison"] = metrics_path

    correlation_frame = _numeric_correlation_frame(feature_frame, target, numeric_features, target_label)
    correlation = correlation_frame.corr(numeric_only=True).fillna(0.0)

    heatmap_path = _plot_correlation_heatmap(
        correlation,
        model_title,
        visual_dir / "feature_correlation_heatmap.png",
    )
    if heatmap_path:
        paths["featureCorrelationHeatmap"] = heatmap_path

    target_path = _plot_target_correlation(
        correlation,
        target_label,
        model_title,
        visual_dir / "target_correlation_bar.png",
    )
    if target_path:
        paths["targetCorrelationBar"] = target_path

    return paths
