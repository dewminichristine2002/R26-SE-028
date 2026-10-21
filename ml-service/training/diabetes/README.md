# Diabetes Phase 1 Training

## Dataset placement

Place the Kaggle CSV file at:

- `ml-service/data/raw/diabetes_binary_5050split_health_indicators_BRFSS2015.csv`

Required filename:

- `diabetes_binary_5050split_health_indicators_BRFSS2015.csv`

The trainer also auto-detects these alternatives if present:

- `diabetes_binary_health_indicators_BRFSS2015.csv`
- `diabetes_012_health_indicators_BRFSS2015.csv`

If the dataset uses `Diabetes_012`, it is converted to binary for phase 1 as:

- `0 -> 0` (No diabetes)
- `1 or 2 -> 1` (Pre-diabetes or diabetes)

## Train command

Run from `ml-service/`:

```bash
python training/diabetes/train_diabetes_model.py
```

This trains and compares:

- Logistic Regression
- Decision Tree
- Random Forest
- XGBoost
- Soft Voting Ensemble: Logistic Regression + Random Forest + XGBoost

The best individual model is selected with priority: recall, then F1-score, then ROC-AUC.
The soft-voting ensemble is saved only when it is at least as strong as the best
individual model on accuracy, recall, F1-score, and ROC-AUC, and improves at
least one of those metrics.

## Artifacts written

- `ml-service/app/models/diabetes_model.pkl`
- `ml-service/app/models/diabetes_preprocessor.pkl`
- `ml-service/app/models/diabetes_model_metadata.json`
- `ml-service/app/models/training_visualizations/diabetes/confusion_matrix.png`
- `ml-service/app/models/training_visualizations/diabetes/roc_curve.png`
- `ml-service/app/models/training_visualizations/diabetes/model_metrics_comparison.png`
- `ml-service/app/models/training_visualizations/diabetes/feature_correlation_heatmap.png`
- `ml-service/app/models/training_visualizations/diabetes/target_correlation_bar.png`
