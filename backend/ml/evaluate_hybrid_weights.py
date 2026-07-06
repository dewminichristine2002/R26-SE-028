"""
Phase 7 — hybrid weight validation.

Validates alpha/beta blending:
  hybridScore = round(alpha * ruleScore + beta * mlDangerScore)

Uses 5-fold stratified CV with out-of-fold ML scores, then evaluates joint
F1-weighted on a held-out 20% test split.
"""
from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, f1_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict, train_test_split

from compare_models import make_pipeline, prepare_features
from data_loaders import load_raw_training_data
from hybrid_eval import THRESHOLDS, derive_risk_labels, derive_rule_score


ROOT = Path(__file__).resolve().parent
MODELS_DIR = ROOT / "models"
MODEL_PATH = MODELS_DIR / "baseline_model.joblib"
OUTPUT_PATH = MODELS_DIR / "hybrid_weight_ablation.json"

RISK_CLASSES = ["Safe", "Warning", "Dangerous"]
WEIGHT_GRID = [(round(alpha, 1), round(1 - alpha, 1)) for alpha in np.arange(0.0, 1.01, 0.1)]
PRODUCTION_WEIGHTS = (0.6, 0.4)

# Section 13.1 — four ablation configurations (dissertation table)
ABLATION_CONFIGURATIONS = [
    {"configuration": "rule_only", "alpha": 1.0, "beta": 0.0, "label": "Rule-only"},
    {"configuration": "ml_only", "alpha": 0.0, "beta": 1.0, "label": "ML-only"},
    {"configuration": "hybrid_proposed", "alpha": 0.6, "beta": 0.4, "label": "Proposed hybrid"},
    {"configuration": "hybrid_equal", "alpha": 0.5, "beta": 0.5, "label": "Equal weight"},
]


def classify_score(score: float) -> str:
    if score >= THRESHOLDS["dangerous"]:
        return "Dangerous"
    if score >= THRESHOLDS["warning"]:
        return "Warning"
    return "Safe"


def blend(rule_score: float, ml_score: float, alpha: float, beta: float) -> float:
    return round(alpha * rule_score + beta * ml_score)


def hybrid_predictions(
    rule_scores: pd.Series,
    ml_scores: pd.Series,
    alpha: float,
    beta: float,
) -> list[str]:
    hybrid_values = [
        blend(float(rule_scores.iloc[i]), float(ml_scores.iloc[i]), alpha, beta)
        for i in range(len(rule_scores))
    ]
    return [classify_score(score) for score in hybrid_values]


def evaluate_weights(
    name: str,
    alpha: float,
    beta: float,
    rule_scores: pd.Series,
    ml_scores: pd.Series,
    y_true_labels: pd.Series,
) -> dict:
    y_pred = hybrid_predictions(rule_scores, ml_scores, alpha, beta)
    report = classification_report(
        y_true_labels,
        y_pred,
        labels=RISK_CLASSES,
        output_dict=True,
        zero_division=0,
    )
    dangerous = report.get("Dangerous", {})
    return {
        "configuration": name,
        "alpha": alpha,
        "beta": beta,
        "f1_weighted": float(f1_score(y_true_labels, y_pred, labels=RISK_CLASSES, average="weighted", zero_division=0)),
        "f1_macro": float(f1_score(y_true_labels, y_pred, labels=RISK_CLASSES, average="macro", zero_division=0)),
        "dangerous_recall": float(dangerous.get("recall", 0)),
        "dangerous_precision": float(dangerous.get("precision", 0)),
        "per_class": report,
    }


def out_of_fold_ml_scores(X: pd.DataFrame, y: pd.Series) -> np.ndarray:
    pipeline = make_pipeline(
        RandomForestClassifier(n_estimators=200, class_weight="balanced", random_state=42, n_jobs=1)
    )
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    oof_proba = cross_val_predict(pipeline, X, y, cv=cv, method="predict_proba", n_jobs=1)
    adr_idx = 1 if oof_proba.shape[1] > 1 else 0
    return np.round(oof_proba[:, adr_idx] * 100)


def cross_validated_weight_search(
    rule_scores: pd.Series,
    ml_scores: pd.Series,
    y_labels: pd.Series,
) -> dict:
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    fold_results: list[dict] = []

    for fold_idx, (_, val_idx) in enumerate(cv.split(rule_scores, y_labels), start=1):
        val_rule = rule_scores.iloc[val_idx]
        val_ml = ml_scores.iloc[val_idx]
        val_y = y_labels.iloc[val_idx]

        best = None
        for alpha, beta in WEIGHT_GRID:
            metrics = evaluate_weights(
                f"fold_{fold_idx}",
                alpha,
                beta,
                val_rule,
                val_ml,
                val_y,
            )
            if best is None or metrics["f1_weighted"] > best["f1_weighted"]:
                best = {**metrics, "alpha": alpha, "beta": beta}

        fold_results.append(
            {
                "fold": fold_idx,
                "rows": int(len(val_idx)),
                "best_alpha": best["alpha"],
                "best_beta": best["beta"],
                "best_f1_weighted": best["f1_weighted"],
            }
        )

    grid_summary = []
    for alpha, beta in WEIGHT_GRID:
        fold_f1 = []
        for fold_idx, (_, val_idx) in enumerate(cv.split(rule_scores, y_labels), start=1):
            metrics = evaluate_weights(
                f"grid_{alpha}_{beta}_fold_{fold_idx}",
                alpha,
                beta,
                rule_scores.iloc[val_idx],
                ml_scores.iloc[val_idx],
                y_labels.iloc[val_idx],
            )
            fold_f1.append(metrics["f1_weighted"])
        grid_summary.append(
            {
                "alpha": alpha,
                "beta": beta,
                "cv_f1_weighted_mean": float(np.mean(fold_f1)),
                "cv_f1_weighted_std": float(np.std(fold_f1)),
            }
        )

    grid_summary.sort(key=lambda row: row["cv_f1_weighted_mean"], reverse=True)
    return {
        "folds": fold_results,
        "weight_grid_cv": grid_summary,
        "selected_by_cv_mean_f1_weighted": grid_summary[0],
    }


def summarize_heldout_comparison(heldout_results: list[dict]) -> list[dict]:
    """Compact Section 13.1 comparison table across Safe / Warning / Dangerous."""
    rows = []
    for result in heldout_results:
        per_class = result.get("per_class", {})
        rows.append(
            {
                "configuration": result["configuration"],
                "alpha": result["alpha"],
                "beta": result["beta"],
                "f1_weighted": result["f1_weighted"],
                "f1_macro": result["f1_macro"],
                "dangerous_recall": result["dangerous_recall"],
                "dangerous_precision": result["dangerous_precision"],
                "per_class_f1": {
                    label: float(per_class.get(label, {}).get("f1-score", 0))
                    for label in RISK_CLASSES
                },
                "per_class_support": {
                    label: int(per_class.get(label, {}).get("support", 0))
                    for label in RISK_CLASSES
                },
            }
        )
    return rows


def main() -> None:
    df, dataset_names = load_raw_training_data()
    X, y_adr = prepare_features(df)
    y_labels = derive_risk_labels(df.loc[X.index]).reset_index(drop=True)
    X = X.reset_index(drop=True)

    rule_scores = derive_rule_score(df.loc[X.index]).reset_index(drop=True)
    df = df.loc[X.index].reset_index(drop=True)

    X_train, X_test, y_train, y_test, rule_train, rule_test, label_train, label_test = train_test_split(
        X,
        y_adr,
        rule_scores,
        y_labels,
        test_size=0.2,
        random_state=42,
        stratify=y_labels,
    )

    print("[hybrid-ablation] Generating out-of-fold ML scores on training split...")
    oof_ml = out_of_fold_ml_scores(X_train, y_train)
    ml_train = pd.Series(oof_ml, index=rule_train.index)

    cv_selection = cross_validated_weight_search(rule_train, ml_train, label_train.reset_index(drop=True))

    if MODEL_PATH.exists():
        model = joblib.load(MODEL_PATH)
        test_proba = model.predict_proba(X_test)
        classes = list(getattr(model.named_steps["classifier"], "classes_", [0, 1]))
        adr_idx = classes.index(1) if 1 in classes else classes[-1]
        ml_test = pd.Series([round(float(row[adr_idx]) * 100) for row in test_proba], index=rule_test.index)
    else:
        fitted = make_pipeline(
            RandomForestClassifier(n_estimators=200, class_weight="balanced", random_state=42, n_jobs=1)
        ).fit(X_train, y_train)
        test_proba = fitted.predict_proba(X_test)
        adr_idx = 1 if test_proba.shape[1] > 1 else 0
        ml_test = pd.Series(np.round(test_proba[:, adr_idx] * 100), index=rule_test.index)

    label_test = label_test.reset_index(drop=True)
    rule_test = rule_test.reset_index(drop=True)
    ml_test = ml_test.reset_index(drop=True)

    baseline_configs = [(row["configuration"], row["alpha"], row["beta"]) for row in ABLATION_CONFIGURATIONS]

    heldout_results = []
    for name, alpha, beta in baseline_configs:
        heldout_results.append(
            evaluate_weights(name, alpha, beta, rule_test, ml_test, label_test)
        )

    comparison_table = summarize_heldout_comparison(heldout_results)
    proposed = next(row for row in heldout_results if row["configuration"] == "hybrid_proposed")
    selected = cv_selection["selected_by_cv_mean_f1_weighted"]

    payload = {
        "section": "13.1_weight_calibration_experiment",
        "objective": "Phase_7_hybrid_risk_score",
        "formula": "hybridScore = round(alpha * ruleScore + beta * mlDangerScore)",
        "production_weights": {
            "alpha_rule_engine": PRODUCTION_WEIGHTS[0],
            "beta_ml_engine": PRODUCTION_WEIGHTS[1],
            "rationale": {
                "rule_engine": (
                    "Higher weight because clinical rules encode validated, evidence-based contraindications "
                    "and remain the primary source of explainability and clinical accountability."
                ),
                "ml_engine": (
                    "Supplementary probabilistic signal for complex, non-linear interactions between patient "
                    "features and drug properties not fully captured by explicit rules."
                ),
            },
        },
        "validation": {
            "method": "5-fold stratified CV on 80% train split (out-of-fold ML scores) + 20% held-out test",
            "optimization_metric": "joint F1-weighted across Safe/Warning/Dangerous",
            "thresholds": THRESHOLDS,
            "cv_weight_selection": cv_selection,
            "production_weights_rank_in_cv_grid": next(
                (
                    idx + 1
                    for idx, row in enumerate(cv_selection["weight_grid_cv"])
                    if row["alpha"] == PRODUCTION_WEIGHTS[0] and row["beta"] == PRODUCTION_WEIGHTS[1]
                ),
                None,
            ),
        },
        "datasets": dataset_names,
        "rows_total": int(len(X)),
        "rows_train": int(len(X_train)),
        "rows_test": int(len(X_test)),
        "ablation_configurations": ABLATION_CONFIGURATIONS,
        "heldout_test_configurations": heldout_results,
        "heldout_comparison_table": comparison_table,
        "heldout_best_configuration_by_f1_weighted": max(
            comparison_table, key=lambda row: row["f1_weighted"]
        )["configuration"],
        "selected_production_weights_justified": {
            "cv_best_alpha": selected["alpha"],
            "cv_best_beta": selected["beta"],
            "proposed_alpha": PRODUCTION_WEIGHTS[0],
            "proposed_beta": PRODUCTION_WEIGHTS[1],
            "proposed_matches_cv_best": bool(
                selected["alpha"] == PRODUCTION_WEIGHTS[0] and selected["beta"] == PRODUCTION_WEIGHTS[1]
            ),
            "heldout_f1_weighted_proposed": proposed["f1_weighted"],
            "heldout_f1_weighted_cv_best": evaluate_weights(
                "heldout_cv_best",
                selected["alpha"],
                selected["beta"],
                rule_test,
                ml_test,
                label_test,
            )["f1_weighted"],
        },
        "note": (
            "rule_score from dataset risk_score column; mlDangerScore from out-of-fold or held-out ADR probability * 100."
        ),
    }

    MODELS_DIR.mkdir(exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf8")
    print(f"[hybrid-ablation] Wrote {OUTPUT_PATH}")
    print(
        f"  CV best weights: alpha={selected['alpha']}, beta={selected['beta']}, "
        f"F1-weighted={selected['cv_f1_weighted_mean']:.4f}"
    )
    print(
        f"  Proposed 0.6/0.4 held-out F1-weighted={proposed['f1_weighted']:.4f}"
    )


if __name__ == "__main__":
    main()
