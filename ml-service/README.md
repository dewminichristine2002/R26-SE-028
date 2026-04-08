# ElderMeds ML Service

This service hosts the machine learning layer for the Emotional and Cognitive Engagement Support module.

## Scope

- Text emotion inference
- Voice emotion inference scaffold
- Multimodal fusion scaffold
- Training scripts for text data preparation and model fine-tuning

## Final Label Space

- `happy`
- `neutral`
- `sad`
- `lonely`
- `stressed`

## Recommended Workflow

1. Prepare a mapped text dataset with `training/text/prepare_text_data.py`
2. Fine-tune the text model with `training/text/train_text_model.py`
3. Start the FastAPI app and expose `/predict/text`
4. Update the Node backend to call this service from `emotionAnalysisService.js`
5. Add the voice and fusion models next

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
