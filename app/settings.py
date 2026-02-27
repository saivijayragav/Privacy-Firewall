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
    aipipe_model: str = "openai/gpt-4.1-nano"

    default_mode: str = "warn"
    auto_redact_threshold: float = 0.65

    # Cloudflare R2 object storage (optional – omit to stay local-only)
    r2_endpoint_url: str | None = Field(default=None, description="e.g. https://<account_id>.r2.cloudflarestorage.com")
    r2_access_key_id: str | None = Field(default=None)
    r2_secret_access_key: str | None = Field(default=None)
    r2_bucket_name: str = "privacy-firewall"

    # Local file cleanup
    local_file_max_age_hours: int = Field(default=1, description="Delete local uploads/outputs older than this")


@lru_cache
def get_settings() -> AppSettings:
    return AppSettings()
