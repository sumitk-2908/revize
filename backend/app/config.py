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
        "https://revize-in.vercel.app",
        "https://academic-portal-git-beta-sumitk2408-s-projects.vercel.app",
    ]
    SENTRY_DSN: str | None = None

    # LLM provider keys for AI summaries and study sets. Both are optional: with
    # neither set, app.llm returns None and every AI feature is simply absent.
    #
    # The fallback exists because Groq's free tier allows 200K tokens/day for the
    # whole organisation, so a busy afternoon of approvals genuinely exhausts it
    # and a 429 is routine rather than exceptional. Any OpenAI-compatible
    # /chat/completions endpoint works as the fallback (Gemini, Cerebras,
    # Mistral, OpenRouter); it needs a base URL because only Groq's is hardcoded.
    GROQ_API_KEY: str | None = None
    LLM_FALLBACK_API_KEY: str | None = None
    LLM_FALLBACK_BASE_URL: str | None = None
    LLM_FALLBACK_MODEL: str | None = None

    # Summaries are short and easy, so they run on the smaller model; flashcards
    # and quizzes need real comprehension. Both support Groq's strict structured
    # outputs (constrained decoding), which qwen and the compound systems do not.
    LLM_MODEL_FAST: str = "openai/gpt-oss-20b"
    LLM_MODEL_STRONG: str = "openai/gpt-oss-120b"

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