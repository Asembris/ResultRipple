"""Application configuration, read once from the environment."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_ROOT.parent

# Absolute env-file paths, so `uvicorn app.main:app` behaves the same whether it
# is launched from the repository root or from `backend/`. Explicit environment
# variables still win over both files, and a later file wins over an earlier
# one, so a backend-local override beats the shared repository file.
ENV_FILES = (REPO_ROOT / ".env", BACKEND_ROOT / ".env")

# A recognisable placeholder, so a deployment that forgot to set a real secret
# fails loudly at startup instead of signing sessions with a published value.
DEV_SESSION_SECRET = "dev-only-insecure-session-secret"

# Environments where generated development credentials are acceptable.
LOCAL_ENVIRONMENTS = frozenset({"development", "test"})


class Settings(BaseSettings):
    """Non-secret runtime configuration. See `.env.example` at the repo root."""

    model_config = SettingsConfigDict(env_file=ENV_FILES, extra="ignore")

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

    # -- the one NVIDIA-hosted model -----------------------------------------
    # The key lives only in the environment. It is never logged, never returned
    # by an endpoint, and never written into an artifact or a receipt.
    nvidia_api_key: str = ""
    nvidia_api_base_url: str = "https://integrate.api.nvidia.com/v1"
    nvidia_model: str = "nvidia/nemotron-3-super-120b-a12b"

    # Model-card sampling recommendation for this model.
    nvidia_temperature: float = 1.0
    nvidia_top_p: float = 0.95

    # Verified against this hosted endpoint: `chat_template_kwargs.thinking` is
    # honoured, and turning it off reports `reasoning_tokens: 0`. A top-level
    # `reasoning_effort` is accepted but changes nothing, so the control is
    # effectively binary.
    #
    # Reasoning is off by default. With it on, the measured two-turn job ran 22
    # to 28 seconds against the frozen 25-second budget; with it off the same
    # runs reached the same typed intent in roughly half the time. This is the
    # one supported reasoning configuration chosen on observed correctness and
    # latency, not a second model. Private reasoning text, when enabled, is read
    # only to judge completion status and is never logged or persisted.
    nvidia_reasoning: bool = False

    # -- bounded agent job budget --------------------------------------------
    agent_max_model_turns: int = 4
    agent_max_tool_calls: int = 6
    agent_max_completion_tokens: int = 4096
    # Request through persisted complete candidates, the frozen demo budget.
    agent_deadline_seconds: float = 25.0
    # A per-request cap below the job deadline. One slow turn is still bounded
    # by the deadline itself, which is checked before every model call.
    agent_request_timeout_seconds: float = 24.0
    # One API worker with an in-process lock: keep concurrent jobs small.
    agent_max_concurrent_jobs: int = 2

    @property
    def is_local(self) -> bool:
        return self.app_env.strip().lower() in LOCAL_ENVIRONMENTS

    @property
    def model_configured(self) -> bool:
        return bool(self.nvidia_api_key.strip() and self.nvidia_model.strip())


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
