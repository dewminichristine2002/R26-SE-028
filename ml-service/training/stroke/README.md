# Stroke Phase 1 Training

## Dataset placement

Place the stroke CSV file at:

- `ml-service/data/raw/healthcare-dataset-stroke-data.csv`

Expected columns:

- `gender`
- `age`
- `hypertension`
- `heart_disease`
- `ever_married`
- `work_type`
- `Residence_type`
- `avg_glucose_level`
- `bmi`
- `smoking_status`
- `stroke`

## Preprocessing

The trainer uses:

- Median imputation and standard scaling for numeric features.
- Most-frequent imputation and one-hot encoding for categorical features.
- Stratified train/test split.
- Class-balancing or `scale_pos_weight` because stroke-positive rows are rare.

## Train command

Run from `ml-service/`:

```bash
python training/stroke/train_stroke_model.py
```

This trains and compares:

- Logistic Regression
- Decision Tree
- Random Forest
- XGBoost

The best model is selected with priority: recall, then F1-score, then ROC-AUC.

## Artifacts written

- `ml-service/app/models/stroke_model.pkl`
- `ml-service/app/models/stroke_preprocessor.pkl`
- `ml-service/app/models/stroke_model_metadata.json`
