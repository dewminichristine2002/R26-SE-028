from fastapi import FastAPI

from app.config import get_settings
from app.routers import assistant, health, predict_fusion, predict_text, predict_voice

settings = get_settings()

app = FastAPI(title=settings.app_name)
app.include_router(health.router)
app.include_router(predict_text.router)
app.include_router(predict_voice.router)
app.include_router(predict_fusion.router)
app.include_router(assistant.router)
