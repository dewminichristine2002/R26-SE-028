# Hypertension Phase 1 Training

## Dataset placement

Place the hypertension CSV file at:

- `ml-service/data/raw/hypertension_dataset.csv`

Expected target column:

- `Hypertension`

The trainer maps `High` to positive risk and `Low` to negative risk.

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

The best model is selected with priority: recall, then F1-score, then ROC-AUC.

## Artifacts written

- `ml-service/app/models/hypertension_model.pkl`
- `ml-service/app/models/hypertension_preprocessor.pkl`
- `ml-service/app/models/hypertension_model_metadata.json`
