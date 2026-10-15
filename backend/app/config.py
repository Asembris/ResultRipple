"""Application configuration, read once from the environment."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parent.parent

# A recognisable placeholder, so a deployment that forgot to set a real secret
# fails loudly at startup instead of signing sessions with a published value.
DEV_SESSION_SECRET = "dev-only-insecure-session-secret"

# Environments where generated development credentials are acceptable.
LOCAL_ENVIRONMENTS = frozenset({"development", "test"})


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

    # "development", "test", or anything else, which is treated as a deployment
    # and must supply real credentials.
    app_env: str = "development"

    # Demo sessions are signed and expiring. A deployment must override this.
    session_secret: str = DEV_SESSION_SECRET
    session_cookie: str = "rr_session"
    session_max_age_seconds: int = 12 * 3600

    # Server-side credentials gating demo-identity sign-in, as
    # "person-ari=...,person-noor=...". Never committed and never served to the
    # browser; locally, the API generates and logs throwaway values instead.
    demo_passcodes: str = ""

    @property
    def is_local(self) -> bool:
        return self.app_env.strip().lower() in LOCAL_ENVIRONMENTS


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


class InsecureDeployment(RuntimeError):
    """Raised at startup when a deployment still carries development defaults."""


def enforce_deployment_safety(settings: Settings) -> None:
    """Refuse to serve a deployment that would sign or gate sessions insecurely.

    Development and test keep working with generated local credentials; any
    other `APP_ENV` must supply both a real session secret and real passcodes.
    """
    if settings.is_local:
        return
    problems = []
    if settings.session_secret == DEV_SESSION_SECRET:
        problems.append("SESSION_SECRET is still the development placeholder")
    elif len(settings.session_secret) < 32:
        problems.append("SESSION_SECRET must be at least 32 characters")
    if not settings.demo_passcodes.strip():
        problems.append("DEMO_PASSCODES must provision a credential for each demo identity")
    if problems:
        raise InsecureDeployment(
            f"refusing to start with APP_ENV={settings.app_env!r}: " + "; ".join(problems)
        )
