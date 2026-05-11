# ElderMeds ML Service

This service hosts the machine learning layer for the Emotional and Cognitive Engagement Support module.

## Scope

- Text emotion inference
- Voice emotion inference scaffold
- Multimodal fusion scaffold
- Diabetes risk prediction (phase 1)
- Stroke risk prediction (phase 1)
- Hypertension risk prediction (phase 1)
- Controlled health-risk advice generation for diabetes, stroke, and hypertension (phase 2 RAG)
- Training scripts for text data preparation and model fine-tuning

## Final Label Space

- `happy`
- `sad`
- `angry`
- `anxious`
- `lonely`
- `confused`
- `neutral`

## Recommended Workflow

1. Prepare a mapped text dataset with `training/text/prepare_text_data.py`
2. Fine-tune the text model with `training/text/train_text_model.py`
3. Start the FastAPI app and expose `/predict/text`
4. Update the Node backend to call this service from `emotionAnalysisService.js`
5. Keep chatbot replies template-based in the Node emotional-support module

For diabetes phase 1:

1. Put `diabetes_binary_health_indicators_BRFSS2015.csv` in `ml-service/data/raw/`
2. Train with `python training/diabetes/train_diabetes_model.py`
3. Start the FastAPI service and use `POST /predict/diabetes`

For stroke phase 1:

1. Put `healthcare-dataset-stroke-data.csv` in `ml-service/data/raw/`
2. Train with `python training/stroke/train_stroke_model.py`
3. Start the FastAPI service and use `POST /predict/stroke`

For hypertension phase 1:

1. Put `hypertension_dataset.csv` in `ml-service/data/raw/`
2. Train with `python training/hypertension/train_hypertension_model.py`
3. Start the FastAPI service and use `POST /predict/hypertension`

## Run Locally

```bash
cd ml-service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Endpoints

- `GET /health`
- `POST /predict/text`
- `POST /predict/voice`
- `POST /predict/fusion`
- `POST /predict/diabetes`
- `POST /predict/stroke`
- `POST /predict/hypertension`
- `POST /assistant/health-advice`
