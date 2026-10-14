"""Application configuration, read once from the environment."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Non-secret runtime configuration. See `.env.example` at the repo root."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    falkordb_host: str = "127.0.0.1"
    falkordb_port: int = 6379
    falkordb_graph: str = "resultripple"

    # Readiness must not hang the event loop waiting on a dead socket.
    falkordb_timeout_seconds: float = 2.0

    # Browser origins allowed to call the API during local development.
    cors_origins: tuple[str, ...] = ("http://localhost:5173", "http://127.0.0.1:5173")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
