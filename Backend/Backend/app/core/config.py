"""Settings loaded from the backend's .env file or environment variables."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = "Automated Academic Timetable API"
    solver_time_limit_seconds: float = Field(default=10.0, gt=0, le=120)
    solver_max_candidates: int = Field(default=200_000, gt=0)
    database_path: Path = BACKEND_ROOT / "data" / "timetables.sqlite3"
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    model_config = SettingsConfigDict(
        env_file=BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
