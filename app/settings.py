from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Privacy Firewall Core Engine"
    app_version: str = "0.1.0"
    debug: bool = False

    aipipe_base_url: str = "https://aipipe.org"
    aipipe_token: str | None = Field(default=None)
    aipipe_model: str = "gpt-5-nano"

    default_mode: str = "warn"
    auto_redact_threshold: float = 0.65


@lru_cache
def get_settings() -> AppSettings:
    return AppSettings()
