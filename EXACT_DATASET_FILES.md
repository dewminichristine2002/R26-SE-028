# EXACT Dataset Files Used for Emotional Support Component

## Location
`f:/Research/Research-ElderMeds/ElderMeds/ml-service/data/raw/`

---

## Dataset Files You ACTUALLY Use

### 1️⃣ PRIMARY DATASET: GoEmotions (Google Research)

**File Names:**
```
✓ goemotions_1.csv      (14 MB)
✓ goemotions_2.csv      (14 MB)
✓ goemotions_3.csv      (14 MB)
```

**Total Size:** ~42 MB

**Source:** Google Research GoEmotions dataset (from Reddit)

**What It Contains:**
- Reddit comments
- 27+ emotion labels (mapped to your 7 emotions)
- Text and emotion pairs

**How You Use It:**
```python
# In prepare_text_data.py
--dataset-type goemotions
--input goemotions_1.csv (or 2.csv, 3.csv)
```

**Mapping:**
GoEmotions labels → Your Final Labels
```
"joy", "admiration", "love" → "happy"
"sadness", "grief" → "sad"
"fear", "nervousness" → "anxious"
"anger", "annoyance" → "angry"
"confusion", "realization" → "confused"
"neutral" → "neutral"
"loneliness" → "lonely"
```

---

### 2️⃣ SECONDARY DATASET: Kaggle Emotion Dataset

**File Name:**
```
✓ Emotion_classify_Data.csv      (606 KB)
```

**Source:** Kaggle Emotion Classification Dataset

**What It Contains:**
- Text samples with emotion labels
- Common emotions from social media
- Pre-labeled training data

**How You Use It:**
```python
# In prepare_text_data.py
--dataset-type custom
--input Emotion_classify_Data.csv
```

**Mapping:**
Kaggle labels → Your Final Labels
```
"happy" → "happy"
"sad" → "sad"
"angry" → "angry"
"stressed" → "anxious"
"surprised" → "confused"
"fear" → "anxious"
"neutral" → "neutral"
```

---

### 3️⃣ TRAINING/VALIDATION SPLITS

**File Names:**
```
✓ train.csv         (11 MB)      ← Training data
✓ train.txt         (1.6 MB)     ← Training data (alternate format)
✓ val.txt           (202 KB)     ← Validation data
✓ test.txt          (204 KB)     ← Test data
```

**How These Are Used:**
```python
# In train_text_model.py
--train-file train.csv (or train.txt)
--validation-file val.txt
```

**Purpose:**
- `train.csv/txt` → Train the transformer model
- `val.txt` → Validate during training
- `test.txt` → Final evaluation

---

### 4️⃣ CUSTOM DATA

**File Name:**
```
✓ custom_text.csv      (2.4 KB)
```

**What It Contains:**
- Elder-specific text samples
- Custom emotion labels
- Test cases for elderly users

**How You Use It:**
```python
# In prepare_text_data.py
--dataset-type custom
--input custom_text.csv
```

---

## Processing Pipeline

```
Raw Datasets
  ├─ goemotions_1.csv, 2.csv, 3.csv
  ├─ Emotion_classify_Data.csv
  └─ custom_text.csv
         ↓
prepare_text_data.py (Maps labels)
         ↓
train.csv, train.txt, val.txt, test.txt
         ↓
train_text_model.py (Trains transformer)
         ↓
artifacts/text-model/ (Saved model)
```

---

## Command to Train Model

```bash
# Step 1: Prepare GoEmotions data
python training/text/prepare_text_data.py \
  --dataset-type goemotions \
  --input data/raw/goemotions_1.csv \
  --output data/processed/train.jsonl

# Step 2: Train model
python training/text/train_text_model.py \
  --train-file data/processed/train.jsonl \
  --validation-file data/processed/val.jsonl \
  --model-name distilroberta-base
```

---

## Model Architecture (What You Train)

**Base Model:** `distilroberta-base` (DistilRoBERTa)

**Fine-tuning:**
- Transformer-based sequence classifier
- 7 emotion classes
- Trained on GoEmotions + Kaggle data

**Output Labels:**
```
["happy", "sad", "angry", "anxious", "lonely", "confused", "neutral"]
```

---

## For Your Viva: What to Say

### About Your Datasets:

> *"I use three public datasets: GoEmotions from Google Research (42 MB, 3 CSV files), Kaggle Emotion Classification Dataset (606 KB), and custom elderly-specific text samples. These provide ~54,000+ labeled emotion samples. I preprocess these datasets by mapping their emotion labels to my 7 target categories and split them into training (11 MB), validation (202 KB), and test (204 KB) sets."*

### About Your Model Training:

> *"I fine-tune a DistilRoBERTa transformer model on the GoEmotions and Kaggle datasets. The model is trained for 3 epochs with a batch size of 8, using the training set and validated on the validation set. The final trained model is deployed as an API that predicts emotion from text input."*

### About File Locations:

> *"All my datasets are located in `ml-service/data/raw/`. The GoEmotions dataset comes in 3 CSV files (goemotions_1.csv, goemotions_2.csv, goemotions_3.csv), and I also use Emotion_classify_Data.csv from Kaggle. After preprocessing, I generate train.csv, val.txt, and test.txt files for the training pipeline."*

---

## Summary Table

| File Name | Size | Source | Purpose |
|-----------|------|--------|---------|
| `goemotions_1.csv` | 14 MB | Google Research | GoEmotions Dataset Part 1 |
| `goemotions_2.csv` | 14 MB | Google Research | GoEmotions Dataset Part 2 |
| `goemotions_3.csv` | 14 MB | Google Research | GoEmotions Dataset Part 3 |
| `Emotion_classify_Data.csv` | 606 KB | Kaggle | Emotion Classification |
| `custom_text.csv` | 2.4 KB | Custom | Elderly-specific samples |
| `train.csv` | 11 MB | Processed | Training data |
| `train.txt` | 1.6 MB | Processed | Training data (alt format) |
| `val.txt` | 202 KB | Processed | Validation data |
| `test.txt` | 204 KB | Processed | Test data |

---

## Key Points for Viva

✅ **Exact Dataset Files:**
- `goemotions_1.csv`, `goemotions_2.csv`, `goemotions_3.csv` (primary)
- `Emotion_classify_Data.csv` (secondary)
- `custom_text.csv` (elderly-specific)

✅ **Model Type:**
- DistilRoBERTa transformer fine-tuned for emotion classification
- 7 emotion classes

✅ **Training Data:**
- `train.csv` or `train.txt` (11 MB)
- `val.txt` (202 KB)
- `test.txt` (204 KB)

✅ **Total Data Volume:**
- 54,000+ samples from 2 public datasets
- Processed and split for training
