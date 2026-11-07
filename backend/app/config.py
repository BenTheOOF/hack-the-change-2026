from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Repo root is two levels up from this file. The file is missing on Fly, where real env vars are used.
ROOT_ENV = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_ENV, extra="ignore")

    supabase_url: str = Field(validation_alias="NEXT_PUBLIC_SUPABASE_URL")
    supabase_publishable_key: str = Field(validation_alias="NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
    supabase_secret_key: str = Field(validation_alias="SUPABASE_SECRET_KEY")
    cors_origins: str = Field(validation_alias="CORS_ORIGINS")
    llm_api_key: str = Field("", validation_alias="ANTHROPIC_API_KEY")
    llm_model: str = Field("", validation_alias="LLM_MODEL")
    llm_max_tokens: int = Field(512, validation_alias="LLM_MAX_TOKENS")


settings = Settings()
