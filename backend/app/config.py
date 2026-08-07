import json
from functools import lru_cache
from typing import Annotated, Any

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

class Settings(BaseSettings):
    APP_NAME: str = "Academic Portal API"
    APP_ENV: str = "development"
    DEBUG: bool = False
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    CORS_ORIGINS: Annotated[list[str], NoDecode] = [
        "http://localhost:3000",
        "https://academic-portal-blush.vercel.app",
        "https://academic-portal-git-beta-sumitk2408-s-projects.vercel.app",
    ]
    SENTRY_DSN: str | None = None

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _parse_cors_origins(cls, value: Any) -> Any:
        """Accept a JSON array, a bare JSON string, or a comma-separated list.

        The env/dotenv source passes the raw value through untouched (NoDecode),
        since a plain comma-separated string would otherwise fail JSON decoding
        before this validator ever runs.
        """
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
            except json.JSONDecodeError:
                parsed = [origin.strip() for origin in value.split(",") if origin.strip()]
            if isinstance(parsed, str):
                parsed = [parsed]
            return parsed
        return value

@lru_cache
def get_settings() -> Settings:
    return Settings()

settings = get_settings()