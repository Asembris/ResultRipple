"""Application configuration, read once from the environment."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parent.parent


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

    # Immutable dataset bytes. The graph stores its SHA-256; the engine and the
    # independent verifier both read this file rather than trusting the graph.
    dataset_csv_path: Path = BACKEND_ROOT / "data" / "batches.csv"

    # Staged candidates and issued editions. Generated state, never source.
    artifact_root: Path = BACKEND_ROOT / "runtime" / "artifacts"

    # Demo sessions are signed and expiring. A real deployment overrides this.
    session_secret: str = "resultripple-local-development-secret"
    session_cookie: str = "rr_session"
    session_max_age_seconds: int = 12 * 3600


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
