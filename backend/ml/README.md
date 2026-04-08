## ElderMeds ML Workspace

This folder contains the first dataset and ML scaffolding for medicine safety prediction.

### What is included

- `sql/medicine_safety_dataset.sql`
  Exports one row per medicine safety check by joining:
  - `medicine_check_history`
  - `user_allergy_profiles`
  - `allergy_questionnaire_answers`
  - `reaction_logs`

- `scripts/exportDataset.js`
  Connects to the same PostgreSQL database as the backend and writes:
  - `ml/data/medicine_safety_dataset.json`
  - `ml/data/medicine_safety_dataset.csv`

- `train_baseline.py`
  Trains a first baseline classifier using:
  - tabular profile/check fields
  - TF-IDF on medicine and text fields

- `requirements.txt`
  Python packages for baseline training.

### Dataset target

The exported dataset includes multiple possible labels:

- `risk_level`
- `risk_score`
- `has_reaction_log`
- `has_severe_reaction_log`

Recommended first target:

- `has_reaction_log`

Recommended fallback target:

- `risk_level`

### How to export the dataset

From `backend/`:

```powershell
node ml/scripts/exportDataset.js
```

### How to train the first model

From `backend/ml/`:

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python train_baseline.py
```

### Output files

Training writes to:

- `ml/models/baseline_metrics.json`
- `ml/models/baseline_feature_report.txt`

### Notes

- This is a research/baseline pipeline, not a medical-grade decision system.
- Keep the existing rule-based safety logic and use ML as a supporting signal.
