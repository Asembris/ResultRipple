"""Typed request and response bodies.

Request DTOs deliberately carry no actor, reviewer, scope, file path, number,
or factual sentence. Those are resolved server-side from the signed session and
from current FalkorDB context.
"""

from typing import Literal

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Liveness: the API process answers. It says nothing about FalkorDB."""

    status: Literal["ok"] = "ok"
    service: str = "resultripple-api"
    version: str


class GraphStatus(BaseModel):
    """Outcome of one real FalkorDB round trip."""

    connected: bool
    graph: str
    endpoint: str
    # Populated only when `connected` is true.
    latency_ms: float | None = None
    server_version: str | None = None
    # Populated only when `connected` is false: a stable code plus a safe detail.
    error_code: Literal["GRAPH_UNREACHABLE", "GRAPH_QUERY_FAILED"] | None = None
    error_detail: str | None = None


class AgentStatus(BaseModel):
    """What model the agent would call. Never the credential itself."""

    configured: bool
    model: str
    endpoint: str
    reasoning: bool
    max_model_turns: int
    max_tool_calls: int
    max_completion_tokens: int
    deadline_seconds: float


class ReadinessResponse(BaseModel):
    """Readiness: the API can serve graph-backed work."""

    ready: bool
    service: str = "resultripple-api"
    version: str
    falkordb: GraphStatus
    agent: AgentStatus
    implemented_scope: list[str] = Field(default_factory=list)


class DemoSessionRequest(BaseModel):
    """Sign in as a provisioned demo identity with its server-side passcode.

    Naming the identity is not enough: the capability still comes from the
    graph, and the passcode proves the caller may act as that person at all.
    """

    person_id: str = Field(min_length=1, max_length=64)
    passcode: str = Field(min_length=1, max_length=128)


class SessionResponse(BaseModel):
    person_id: str
    display_name: str
    demo_role: str
    review_capable: bool


class ApplyCorrectionRequest(BaseModel):
    """The analyst confirms the source note against the batches it identifies."""

    batch_ids: list[str] = Field(min_length=1, max_length=50)
    expected_context_revision: int
    source_confirmed: bool = False


class CreateFindingRequest(BaseModel):
    """Register the displayed comparison as an approved finding.

    It names a comparison and the revision the analyst saw, plus the explicit
    confirmation. There is no free prose: the server writes the finding's title
    and every sentence later rendered from it.
    """

    comparison_id: str = Field(min_length=1, max_length=120)
    expected_context_revision: int
    confirmed_intended_comparison: bool = False


class LinkedFindingRequest(BaseModel):
    """Place a registered finding in a document with its approved card style."""

    claim_id: str = Field(min_length=1, max_length=120)
    card_style: str = Field(min_length=1, max_length=32)
    expected_context_revision: int


class StageReviewRequest(BaseModel):
    """A typed intent frame. The raw request stays visible beside it."""

    raw_request: str = Field(min_length=1, max_length=2000)
    goal: str
    disposition: str
    alternative_flag: bool = False
    note: str = Field(default="", max_length=2000)
    # Recorded for transparency only; it can never narrow the registered scope.
    focus_occurrence_ids: list[str] = Field(default_factory=list, max_length=20)
    idempotency_key: str = Field(min_length=1, max_length=120)


class AgentRunRequest(BaseModel):
    """What the analyst wants done, in their own words.

    It carries no actor, scope, reviewer, disposition, or number: the request is
    untrusted text that the model interprets and the engine never trusts.
    """

    request_text: str = Field(min_length=1, max_length=2000)


class ApprovalRequest(BaseModel):
    """Approval attaches to one exact plan version and fingerprint."""

    plan_version: int
    execution_fingerprint: str = Field(min_length=16, max_length=128)
    acknowledged_alternative: bool = False


class RejectionRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=1000)


class ReleaseRequest(BaseModel):
    """`operation_id` makes a lost response reconcilable rather than duplicated."""

    operation_id: str = Field(min_length=1, max_length=120)


class ReviewerAssignmentRequest(BaseModel):
    """Guarded synthetic rota change. Operator capability only."""

    from_person_id: str = Field(min_length=1, max_length=64)
    to_person_id: str = Field(min_length=1, max_length=64)
    expected_context_revision: int


class ErrorBody(BaseModel):
    code: str
    detail: str
    context: dict = Field(default_factory=dict)
