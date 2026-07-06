# Medication Intake Model Training

## Research Scope

This model-training part supports **safe medication intake monitoring**. It does not identify the medicine name. The model learns to count how many tablet-like objects are visible in the user's palm.

```text
palm photo -> tablet count model -> count prediction
```

The count is compared with the scheduled intake amount. If the predicted count does not match, the system marks the intake as incorrect or asks for confirmation.

## Why Model Training Is Needed

Image-processing rules can count simple tablet photos, but they can fail under:

- poor lighting
- different skin tones
- tablet colors similar to the palm/background
- overlapping tablets
- motion blur
- camera distance changes

A trained model can learn more robust visual patterns from example palm photos.

## Dataset

Recommended dataset format:

```csv
image_path,count,split
data/intake-count/images/train/count_2/sample.jpg,2,train
data/intake-count/images/val/count_2/sample.jpg,2,val
```

Dataset label:

```text
count = number of tablets visible in palm
```

## Actual Public Dataset

For an actual public dataset, use a pill object detection dataset instead of a pill identity dataset.

Recommended option:

```text
Pills detection dataset
https://www.kaggle.com/datasets/alexanderyyy/pills-detection-dataset
```

Why this dataset matches the project:

- It is made for pill detection.
- It uses YOLO-style object detection labels.
- The class is `pill`.
- Each visible pill is annotated with a separate bounding box.
- Tablet count can be calculated from the number of YOLO label rows in each image.

This supports your feature:

```text
palm/tablet photo -> detect pill objects -> count objects -> compare with scheduled intake amount
```

Alternative smaller public datasets:

- Medical-pills by Ultralytics on Kaggle
- countingpills object detection datasets on Roboflow Universe
- Pill detection and counting dataset on Roboflow Universe

The Kaggle pills detection dataset is the strongest starting point because it has a larger image and instance count and is already in YOLO format.

## Convert Public YOLO Dataset To Count Manifest

After downloading and extracting the dataset to:

```text
backend/ml/data/public/pills-detection-dataset/
```

Expected structure:

```text
images/train
images/val
labels/train
labels/val
```

Build the count manifest:

```powershell
cd backend\ml
python scripts\build_count_manifest_from_yolo.py `
  --dataset-root data\public\pills-detection-dataset `
  --output data\public\pills-detection-count-manifest.csv
```

For medication intake, create a dose-focused manifest with realistic counts:

```powershell
python scripts\build_count_manifest_from_yolo.py `
  --dataset-root data\public\pills-detection-dataset `
  --output data\public\pills-detection-count-manifest-dose.csv `
  --max-count 6
```

The converter counts the number of YOLO label rows per image:

```text
one bounding box = one tablet object
```

Recommended real dataset collection:

- Ask test users to place 0 to 5 tablets in the palm.
- Capture images under different lighting conditions.
- Include different tablet colors and shapes.
- Label each image with the visible tablet count.
- Do not store patient identity in the dataset.

## Model

The training script uses:

- MobileNetV3 Small
- transfer learning
- CrossEntropyLoss
- AdamW optimizer
- image augmentation

Model task:

```text
classification: count_0, count_1, count_2, count_3, count_4, count_5
```

## Training Command

```powershell
cd backend\ml
python scripts\train_tablet_count_model.py `
  --manifest data\public\pills-detection-count-manifest-dose.csv `
  --output models\tablet_count_classifier.pt `
  --epochs 10 `
  --batch-size 32 `
  --pretrained `
  --cpu
```

For the public Kaggle dataset manifest:

```powershell
cd backend\ml
python scripts\train_tablet_count_model.py `
  --manifest data\public\pills-detection-count-manifest-dose.csv `
  --output models\tablet_count_classifier_public.pt `
  --epochs 10 `
  --batch-size 32 `
  --pretrained `
  --cpu
```

Quick viva/demo training from the public dataset:

```powershell
cd backend\ml
python scripts\train_tablet_count_model.py `
  --manifest data\public\pills-detection-count-manifest-dose.csv `
  --output models\tablet_count_classifier_public_smoke.pt `
  --epochs 1 `
  --batch-size 16 `
  --max-train-rows 600 `
  --max-val-rows 160 `
  --cpu
```

This proves the public dataset training pipeline runs quickly. For a final model, remove `--max-train-rows` and `--max-val-rows`, increase `--epochs`, and use GPU if available.

## Evaluation Metrics

The script reports:

- validation accuracy
- off-by-one accuracy

Example meaning:

```text
validation accuracy = exact count is correct
off-by-one accuracy = predicted count is within +/- 1 tablet
```

For medication safety, exact accuracy is the important metric. Off-by-one is only used for analysis.

## Prediction Command

```powershell
cd backend\ml
python scripts\predict_tablet_count.py `
  --model models\tablet_count_classifier.pt `
  --image data\public\pills-detection-dataset\images\val\sample.jpg `
  --cpu
```

## Use The Trained Model In The Backend

The backend analyzer can use a trained model when this environment variable points to a `.pt` file:

```powershell
$env:INTAKE_COUNT_MODEL_PATH='D:\Document\SLIIT\Research\Project\ElderMeds\backend\ml\models\tablet_count_classifier.pt'
```

When the variable is set, the response includes:

```json
{
  "countSource": "trained-model",
  "modelPrediction": {
    "count": 2,
    "confidence": 0.91
  }
}
```

If no model path is configured, the backend keeps using image-processing counting.

The analyzer also checks the project model folder automatically and uses the first available model in this order:

```text
backend/ml/models/tablet_count_classifier.pt
backend/ml/models/tablet_count_classifier_public.pt
backend/ml/models/tablet_count_classifier_public_smoke.pt
```

Set `INTAKE_COUNT_MODEL_PATH` when you want to force a specific trained model.

The backend only accepts model output when confidence is high enough. Default threshold:

```text
INTAKE_COUNT_MODEL_CONFIDENCE=0.55
```

If the trained model confidence is below that value, the backend falls back to image-processing count.

## Local Smoke Run

A public-dataset smoke model was trained from the pill detection dataset:

```text
backend/ml/models/tablet_count_classifier_public_smoke.pt
```

Public-dataset smoke result:

```text
validation accuracy: 14.29%
off-by-one accuracy: 42.86%
```

This confirms real public dataset training works. Accuracy is low because it is a short CPU smoke run using a small subset and no pretrained weights. For final results, train `tablet_count_classifier_public.pt` longer with `--pretrained` and a GPU.

## How It Fits The App

Current app:

```text
palm photo -> image processing count -> user confirmation -> taken
```

Future trained model flow:

```text
palm photo -> trained count model -> count prediction
           -> image processing fallback
           -> compare with expected intake count
           -> action checks
           -> mark taken or uncertain
```

## Viva Explanation

My model-training part focuses on medication intake verification, not pill identity. I train a tablet count classification model using palm photos labeled with the number of visible tablets. The model predicts how many tablets are in the user's palm, and the system compares that count with the scheduled intake amount. This helps detect incorrect dosage before the user marks the medicine as taken.
