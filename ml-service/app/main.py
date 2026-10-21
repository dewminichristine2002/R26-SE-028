from fastapi import FastAPI

from app.config import get_settings
from app.routers import (
    assistant,
    health,
    predict_diabetes,
    predict_fusion,
    predict_hypertension,
    predict_medicine_safety,
    predict_stroke,
    predict_text,
    predict_voice,
)

settings = get_settings()

app = FastAPI(title=settings.app_name)
app.include_router(health.router)
app.include_router(predict_text.router)
app.include_router(predict_voice.router)
app.include_router(predict_fusion.router)
app.include_router(predict_diabetes.router)
app.include_router(predict_stroke.router)
app.include_router(predict_hypertension.router)
app.include_router(predict_medicine_safety.router)
app.include_router(assistant.router)
