# Hypertension Phase 1 Training

## Dataset placement

Place the hypertension CSV file at:

- `ml-service/data/raw/hypertension_dataset.csv`

Expected target column:

- `Hypertension`

The trainer maps `High` to positive risk and `Low` to negative risk.
The saved metadata also records an audit note because this source label has weak
agreement with the BP-derived clinical indicator in the current CSV.

## Preprocessing

The trainer uses:

- Median imputation and standard scaling for numeric features.
- Most-frequent imputation and one-hot encoding for categorical features.
- Stratified train/test split.
- Class-balancing or `scale_pos_weight` for model algorithms.

## Train command

Run from `ml-service/`:

```bash
python training/hypertension/train_hypertension_model.py
```

This trains and compares:

- Logistic Regression
- Decision Tree
- Random Forest
- XGBoost
- Soft Voting Ensemble: Logistic Regression + Random Forest + XGBoost

The best individual model is selected with priority: accuracy, recall, F1-score,
and ROC-AUC.
When metrics are effectively tied, the trainer prefers the smaller model to keep
the saved `.pkl` artifact below GitHub's 100 MB file limit. The Random Forest is
also depth-limited, and model artifacts are saved with joblib compression.
The soft-voting ensemble is saved only when it is at least as strong as the best
individual model on accuracy, recall, F1-score, and ROC-AUC, and improves at
least one of those metrics.

## Artifacts written

- `ml-service/app/models/hypertension_model.pkl`
- `ml-service/app/models/hypertension_preprocessor.pkl`
- `ml-service/app/models/hypertension_model_metadata.json`
- `ml-service/app/models/training_visualizations/hypertension/confusion_matrix.png`
- `ml-service/app/models/training_visualizations/hypertension/roc_curve.png`
- `ml-service/app/models/training_visualizations/hypertension/model_metrics_comparison.png`
- `ml-service/app/models/training_visualizations/hypertension/feature_correlation_heatmap.png`
- `ml-service/app/models/training_visualizations/hypertension/target_correlation_bar.png`
