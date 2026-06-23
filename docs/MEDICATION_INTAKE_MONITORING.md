# Medication Intake Monitoring

## Goal

This component focuses on safe medication behavior tracking. It does not identify the pill name. Instead, it verifies that the user is taking the expected number of tablets for the scheduled medicine before the app records the dose as taken.

## Current App Flow

1. User taps `One Time` for the current intake.
2. The app opens the camera.
3. User captures a palm photo showing all tablets for that intake.
4. Backend image processing estimates the number of tablet-like objects in the palm photo.
5. The app prefills the detected tablet count and lets the user correct it if needed.
6. The app compares the verified count with the expected count for that intake.
7. User confirms the intake action checks:
   - hand moved toward mouth
   - swallowing completed
8. Only after these checks pass, the app saves all medicines in that intake as `taken`.

The separate per-medicine `Taken` action does not use the camera or count detection. It directly marks that medicine as taken. The `One Time` action is the camera-based safety check for the whole current intake, and its result is shown as OK, overdose, or underdose.

## Current Image Processing

The backend endpoint is:

```text
POST /api/intake-monitoring/analyze-palm
```

The Python analyzer:

- decodes the palm photo
- estimates the image background
- separates tablet-like objects using brightness, saturation, and color-distance thresholds
- cleans the mask
- finds connected components
- filters components by area, aspect ratio, fill ratio, and circularity
- returns detected tablet count and confidence

This is a lightweight object-counting prototype. It does not identify the medicine name.

## Rule-Based Intake Motion Check

The project uses **no dataset and no training** for intake motion monitoring. The mobile app records a short intake video from the camera and sends it to the backend for rule-based image/video processing:

1. Extract hand landmarks and face/mouth landmarks with MediaPipe when available.
2. If MediaPipe is not installed, use the OpenCV motion fallback to estimate the moving hand position.
3. Calculate the normalized distance between the hand and mouth over time.
4. Smooth short landmark jitter so a single noisy camera frame does not fail the check.
5. Detect hand-to-mouth movement from the full clip, including cases where the hand starts closer to the face.
6. Detect a mouth pause when the hand stays near the mouth for about one second.
7. Detect swallow-like mouth activity from MediaPipe mouth opening/closing landmarks after the hand reaches the mouth.
8. Mark the camera motion as available only when hand-to-mouth movement and swallowing activity are both detected.

Backend endpoint:

```text
POST /api/intake-monitoring/analyze-motion
POST /api/intake-monitoring/analyze-motion-video
```

The endpoint accepts MediaPipe-style landmark frames:

```json
{
  "frames": [
    {
      "timestampMs": 0,
      "hand": { "wrist": { "x": 0.25, "y": 0.70 } },
      "face": {
        "mouthCenter": { "x": 0.52, "y": 0.48 },
        "leftCheek": { "x": 0.36, "y": 0.45 },
        "rightCheek": { "x": 0.68, "y": 0.45 }
      }
    }
  ],
  "swallowConfirmed": true
}
```

Rule script:

```text
backend/scripts/analyze_intake_motion_rules.py
```

Camera video landmark extraction helper:

```text
backend/scripts/extract_mediapipe_motion_landmarks.py
```

The mobile screen uses the camera result for the hand-to-mouth and swallowing check. Automatic swallowing detection needs MediaPipe face landmarks; the OpenCV fallback can still explain hand/face tracking failures but cannot confirm swallowing.

These checks can later be replaced by camera-based motion models.

## Safety Dashboard

The Safety Center summarizes today's behavior:

```text
Correct doses
Incorrect doses
Missed doses
```

In the current implementation:

- `taken` is shown as a correct dose.
- `overdose` is shown as an incorrect dose.
- `not-taken` is shown as a missed dose.

## Image Processing Usage

The current implementation provides camera proof, image-processing tablet counting, optional trained-model confirmation, and rule-based motion verification. No medication identity model is used.

The intake count decision uses a hybrid AI-first rule:

- image processing finds tablet-like objects and estimates the count
- if a trained tablet-count model exists in `backend/ml/models`, the backend also runs the model
- when the AI model is available, its count is used as the final `detectedCount`
- image processing is still returned for comparison and debugging
- if no AI model is available, the backend falls back to image-processing count

For best real-world accuracy, train the model with real palm photos from the target camera and lighting conditions.

Current trained count model:

```text
backend/ml/models/tablet_count_classifier.pt
```

This model was trained from:

```text
backend/ml/data/public/pills-detection-count-manifest-dose.csv
```

Training result from the public pill-detection dataset:

```text
validation accuracy: 70.58%
off-by-one accuracy: 91.98%
```

This dataset helps the AI count pills, but it is not a perfect replacement for real palm-photo training data. The app still lets the user verify and adjust the detected count before saving the intake.

Recommended components:

| Task | Current Approach |
| --- | --- |
| Tablet count | Hybrid image-processing count plus optional trained count model |
| Hand landmark detection | MediaPipe Hands |
| Mouth/face landmark detection | MediaPipe Face Mesh |
| Intake motion | Landmark distance and pause rules |
| Swallowing completion | User/caregiver confirmation |

## Limitation

The current app estimates tablet count from a still photo with image processing. It does not claim automatic swallowing recognition. Swallowing remains a confirmation step to avoid unsafe false positives.
