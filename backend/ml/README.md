# ElderMeds Intake Monitoring ML

This folder contains the optional model-training pipeline for the medication intake monitoring component.

The runtime now prefers **pill object detection** for counting. It counts each
detected pill box in the palm photo, then falls back to the older tablet-count
classifier if detector weights are not available.

```text
palm photo -> trained pill detector -> count detected boxes
```

## Dataset Format

Use a CSV manifest:

```csv
image_path,count,split
data/intake-count/images/train/count_2/sample.jpg,2,train
data/intake-count/images/val/count_2/sample.jpg,2,val
```

`count` is the number of tablets visible in the user's palm for that intake.

## Actual Public Dataset Option

Use a public YOLO-format pill detection dataset, then convert bounding-box labels into tablet-count labels.

Recommended starting dataset:

```text
Pills detection dataset
https://www.kaggle.com/datasets/alexanderyyy/pills-detection-dataset
```

Why it fits:

- YOLO object detection format
- one object class: `pill`
- train/validation split
- each pill has its own bounding box
- count can be calculated from the number of labels per image

Expected extracted layout:

```text
backend/ml/data/public/pills-detection-dataset/
  images/
    train/
    val/
  labels/
    train/
    val/
```

Convert YOLO labels to the training manifest:

```powershell
cd backend\ml
python scripts\build_count_manifest_from_yolo.py `
  --dataset-root data\public\pills-detection-dataset `
  --output data\public\pills-detection-count-manifest.csv
```

Dose-focused count manifest for this app:

```powershell
python scripts\build_count_manifest_from_yolo.py `
  --dataset-root data\public\pills-detection-dataset `
  --output data\public\pills-detection-count-manifest-dose.csv `
  --max-count 6
```

Then train:

```powershell
python scripts\train_tablet_count_model.py `
  --manifest data\public\pills-detection-count-manifest-dose.csv `
  --output models\tablet_count_classifier.pt `
  --epochs 10 `
  --batch-size 32 `
  --pretrained `
  --cpu
```

For more accurate count results, train the detector model:

```powershell
cd backend\ml
python scripts\train_pill_detector_model.py `
  --data pill-detector-data.yaml `
  --epochs 3 `
  --image-size 416 `
  --batch-size 8 `
  --device cpu
```

The backend looks for detector weights at:

```text
backend/ml/runs/detect/pill_detector/weights/best.pt
```

You can override this path with:

```powershell
$env:INTAKE_DETECTOR_MODEL_PATH='D:\Document\SLIIT\Research\Project\ElderMeds\backend\ml\runs\detect\pill_detector\weights\best.pt'
```

Predict with the detector:

```powershell
python scripts\predict_pill_detector_count.py `
  --model runs\detect\pill_detector\weights\best.pt `
  --image data\public\pills-detection-dataset\images\val\sample.jpg
```

Quick public-dataset smoke training:

```powershell
python scripts\train_tablet_count_model.py `
  --manifest data\public\pills-detection-count-manifest-dose.csv `
  --output models\tablet_count_classifier_public_smoke.pt `
  --epochs 1 `
  --batch-size 16 `
  --max-train-rows 600 `
  --max-val-rows 160 `
  --cpu
```

## Generate Starter Dataset

This creates a small synthetic dataset for demonstrating the training pipeline:

```powershell
cd backend\ml
python scripts\generate_synthetic_count_dataset.py --output-dir data\intake-count --images-per-count 80 --max-count 5
```

For real research results, replace or extend the synthetic data with consent-based palm photos from test users.

## Train

```powershell
cd backend\ml
python scripts\train_tablet_count_model.py --manifest data\intake-count\manifest.csv --output models\tablet_count_classifier.pt --epochs 10 --pretrained --cpu
```

## Predict

```powershell
cd backend\ml
python scripts\predict_tablet_count.py --model models\tablet_count_classifier.pt --image data\intake-count\images\val\count_2\sample.jpg --cpu
```

## Use A Trained Model In The Backend

Set:

```powershell
$env:INTAKE_COUNT_MODEL_PATH='D:\Document\SLIIT\Research\Project\ElderMeds\backend\ml\models\tablet_count_classifier.pt'
```

Then the existing intake endpoint can use the trained model:

```text
POST /api/intake-monitoring/analyze-palm
```

The detector uses a default confidence threshold of `0.55`. Override with:

```powershell
$env:INTAKE_DETECTOR_CONFIDENCE='0.55'
```

The fallback classifier threshold can be overridden with:

```powershell
$env:INTAKE_COUNT_MODEL_CONFIDENCE='0.70'
```

## Current Runtime

Image processing remains available as fallback/explainability in:

```text
backend/scripts/analyze_palm_pills.py
```

The recommended production design is:

1. Use the trained detector for tablet count prediction.
2. Use the classifier only if detector weights are unavailable.
3. Use image processing as a fallback/explainability check.

## Motion Monitoring Without Dataset Training

Motion monitoring is rule-based, not trained:

```text
MediaPipe landmarks -> distance rules -> hand-to-mouth + mouth pause result
```

Rule analyzer:

```powershell
python ..\scripts\analyze_intake_motion_rules.py
```

Optional landmark extraction helper for a recorded video:

```powershell
python ..\scripts\extract_mediapipe_motion_landmarks.py `
  --video data\public\sample-intake.mp4 `
  --output data\public\sample-intake-landmarks.json
```

Install optional dependencies only if you want to extract landmarks from videos:

```powershell
pip install mediapipe opencv-python
```
