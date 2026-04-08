from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "ElderMeds ML Service"
    environment: str = "development"
    text_model_name: str = "distilroberta-base"
    text_model_dir: Path = Path("artifacts/text-model")
    voice_model_dir: Path = Path("artifacts/voice-model")
    fusion_model_dir: Path = Path("artifacts/fusion-model")
    use_model_artifacts: bool = True

    model_config = SettingsConfigDict(
        env_prefix="ELDERMEDS_ML_",
        env_file=".env",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
