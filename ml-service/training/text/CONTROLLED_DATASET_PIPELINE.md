# Controlled Text Dataset Pipeline

This pipeline builds a reviewable text emotion dataset for ElderMeds from Kaggle Emotion Dataset and GoEmotions sources. It prepares data only; it does not train a model.

## Output Labels

The builder writes only these seven final labels:

- `happy`
- `neutral`
- `sad`
- `lonely`
- `angry`
- `anxious`
- `confused`

## Builder Script

Run from the repository root:

```powershell
python ml-service\training\text\build_controlled_text_dataset.py `
  --kaggle-input path\to\kaggle.csv `
  --goemotions-input path\to\goemotions.csv
```

Or run from `ml-service`:

```powershell
python training\text\build_controlled_text_dataset.py `
  --kaggle-input path\to\kaggle.csv `
  --goemotions-input path\to\goemotions.csv
```

Default outputs are written under `ml-service/data/processed/review/`:

- `controlled_text_dataset.csv`
- `controlled_text_dataset.jsonl`
- `controlled_text_dataset_summary.json`
- `controlled_text_dataset_samples.json`

## What The Script Does

1. Loads Kaggle and GoEmotions CSV, JSON, or JSONL files.
2. Maps source labels into the seven ElderMeds labels.
3. Drops ambiguous, unmapped, overly noisy, too short, too long, URL-heavy, or duplicate rows.
4. Assigns `lonely` only when strict loneliness terms appear in the text.
5. Downsamples dominant labels using `--max-per-label` and the observed median label count.
6. Writes reviewable CSV/JSONL files plus summary and sample reports.

## Important Rules

`lonely` is not taken directly from either dataset label space. It is derived only from text patterns such as `alone`, `lonely`, `isolated`, `left out`, `no one`, or `nobody`.

GoEmotions multi-label rows are accepted only when all mapped emotions collapse to one final ElderMeds label. Rows that map to conflicting final labels are dropped as ambiguous.

Kaggle `surprise` and GoEmotions categories that do not fit the seven-label ElderMeds space are excluded.

## Common Options

```powershell
python ml-service\training\text\build_controlled_text_dataset.py `
  --kaggle-input path\to\kaggle.csv `
  --goemotions-input path\to\goemotions.csv `
  --kaggle-text-column text `
  --kaggle-label-column label `
  --goemotions-text-column text `
  --goemotions-label-column labels `
  --max-per-label 2500
```

The GoEmotions input can use a `labels` column containing label names or indexes. It can also use the common one-hot format with emotion columns such as `joy`, `sadness`, `neutral`, and `anger`.
