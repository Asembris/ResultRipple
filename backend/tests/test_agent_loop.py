"""The bounded loop, driven by a scripted model against a real FalkorDB.

The model's answers are scripted here so each failure mode is exercised exactly.
The tools, the graph, the engine, the rendered candidates and the persisted job
state are all real; only the completion is deterministic. Real NVIDIA inference
is exercised in `test_agent_live.py`.
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any, Callable

import httpx
import openai
import pytest

from app import domain, jobs, service
from app.agent import AgentRunner
from app.agent_tools import AgentToolbox, agent_principal
from app.config import get_settings
from app.deps import get_artifact_store, get_dataset_path, get_job_store
from app.service import Actor

ARI = Actor("person-ari", "Ari Mensah", "analyst", False)
REQUEST = "Update the reports, but keep South as the cheaper option in the rollout memo."


# -- a scripted completion endpoint -------------------------------------------


def _usage(prompt: int = 100, completion: int = 40, reasoning: int = 0) -> SimpleNamespace:
    return SimpleNamespace(
        prompt_tokens=prompt,
        completion_tokens=completion,
        total_tokens=prompt + completion,
        completion_tokens_details=SimpleNamespace(reasoning_tokens=reasoning),
    )


def tool_turn(name: str, arguments: Any, *, call_id: str = "call-1") -> Callable[[], Any]:
    """One completion that requests one tool call."""
    raw = arguments if isinstance(arguments, str) else json.dumps(arguments)

    def build() -> Any:
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    finish_reason="tool_calls",
                    message=SimpleNamespace(
                        content="",
                        tool_calls=[
                            SimpleNamespace(
                                id=call_id,
                                function=SimpleNamespace(name=name, arguments=raw),
                            )
                        ],
                    ),
                )
            ],
            usage=_usage(),
        )

    return build


def text_turn(content: str, *, finish_reason: str = "stop") -> Callable[[], Any]:
    def build() -> Any:
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    finish_reason=finish_reason,
                    message=SimpleNamespace(content=content, tool_calls=None),
                )
            ],
            usage=_usage(completion=4096, reasoning=4000),
        )

    return build


def raising_turn(error: Exception) -> Callable[[], Any]:
    def build() -> Any:
        raise error

    return build


class ScriptedModel:
    """Serves the scripted turns in order and records what it was asked."""

    def __init__(self, *turns: Callable[[], Any], between: Callable[[int], None] | None = None):
        self._turns = list(turns)
        self._between = between
        self.calls: list[dict[str, Any]] = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kwargs: Any) -> Any:
        index = len(self.calls)
        self.calls.append(kwargs)
        if self._between is not None:
            self._between(index)
        if index >= len(self._turns):
            # An exhausted script answers in prose, which the loop treats as
            # taking no action rather than as success.
            return text_turn("I have nothing further to do.")()
        return self._turns[index]()


def _request(request: httpx.Request | None = None) -> httpx.Request:
    return request or httpx.Request("POST", "https://integrate.api.nvidia.com/v1/chat/completions")


# -- fixtures -----------------------------------------------------------------


@pytest.fixture()
def corrected(seeded):
    """The analyst's correction is applied; the agent's job starts here."""
    graph = seeded["graph"]
    service.apply_correction(
        graph,
        actor=ARI,
        case_id=domain.CASE_ID,
        batch_ids=["B09", "B10", "B11"],
        expected_revision=int(graph.workspace(domain.WORKSPACE_ID)["context_revision"]),
    )
    return seeded


def _run(corrected, model: ScriptedModel, *, job_id: str = "job-scripted") -> dict[str, Any]:
    """Accept and execute one job with the scripted completion endpoint."""
    graph = corrected["graph"]
    store = get_job_store()
    accepted = store.accept(graph, actor=ARI, case_id=domain.CASE_ID, request_text=REQUEST)
    store.execute(
        graph,
        get_artifact_store(),
        get_dataset_path(),
        job_id=accepted["job_id"],
        case_id=domain.CASE_ID,
        actor=ARI,
        request_text=REQUEST,
        client=model,
    )
    return jobs.read_job(graph, accepted["job_id"]) or {}


def _revision(graph) -> int:
    return int(graph.workspace(domain.WORKSPACE_ID)["context_revision"])


def _stage_arguments(inspection_id: str, **overrides: Any) -> dict[str, Any]:
    arguments = {
        "case_id": domain.CASE_ID,
        "inspection_id": inspection_id,
        "requested_keep_target": "COST_CLAIM",
        "goal": domain.GOAL_RETAIN_CHEAPER_CLAIM,
        "disposition": domain.DISPOSITION_RETURN_FOR_REVIEW,
        "alternative_flag": True,
        "note": "South now costs more (occ-memo-cost-finding).",
        "idempotency_key": "k1",
    }
    arguments.update(overrides)
    return arguments


# -- the normal path ----------------------------------------------------------


def test_the_normal_path_is_two_turns_inspect_then_stage(corrected):
    graph = corrected["graph"]
    revision = _revision(graph)
    inspection_ids: list[str] = []

    class Script(ScriptedModel):
        def _create(self, **kwargs: Any) -> Any:
            index = len(self.calls)
            self.calls.append(kwargs)
            if index == 0:
                return tool_turn(
                    "inspect_impact",
                    {"case_id": domain.CASE_ID, "expected_context_revision": revision},
                )()
            # The second turn names the inspection id the first one returned.
            payload = json.loads(self.calls[-1]["messages"][-1]["content"])
            inspection_ids.append(payload["inspection_id"])
            return tool_turn(
                "stage_review", _stage_arguments(payload["inspection_id"]), call_id="call-2"
            )()

    model = Script()
    job = _run(corrected, model)

    assert job["status"] == "AWAITING_REVIEW"
    assert job["model_turn_count"] == 2
    assert job["tool_call_count"] == 2
    assert job["plan_id"] == "plan-case-dispatch-b09-b11-v1"
    assert job["usage"]["prompt_tokens"] == 200
    assert job["error_code"] is None
    assert job["terminal"] is True

    # The tools were declared to the model, with nothing beyond the four.
    declared = {spec["function"]["name"] for spec in model.calls[0]["tools"]}
    assert declared == {
        "get_case_context",
        "inspect_impact",
        "stage_review",
        "request_clarification",
    }

    plan = graph.plan(job["plan_id"])
    assert plan["status"] == "AWAITING_REVIEW"
    assert plan["goal"] == domain.GOAL_RETAIN_CHEAPER_CLAIM
    assert bool(plan["alternative_flag"]) is True
    assert sorted(plan["covered_occurrence_ids"]) == [domain.OCC_MEMO, domain.OCC_OPS]
    # The raw request is recorded from the case, not from the model.
    assert plan["raw_request"] == REQUEST
    assert plan["approved_by"] is None
    assert inspection_ids and inspection_ids[0].startswith("insp-")


def test_the_plan_records_this_run_s_request_not_the_one_on_the_case(corrected):
    """A later request must not be reviewed under the words that opened the case."""
    graph = corrected["graph"]
    revision = _revision(graph)
    later = "Please just fix both reports; the proposal can wait for its reviewer."
    assert graph.case(domain.CASE_ID)["request_text"] != later

    class Script(ScriptedModel):
        def _create(self, **kwargs: Any) -> Any:
            index = len(self.calls)
            self.calls.append(kwargs)
            if index == 0:
                # The quoted request the model is given is this run's own.
                assert later in kwargs["messages"][1]["content"]
                return tool_turn(
                    "inspect_impact",
                    {"case_id": domain.CASE_ID, "expected_context_revision": revision},
                )()
            payload = json.loads(self.calls[-1]["messages"][-1]["content"])
            return tool_turn(
                "stage_review",
                _stage_arguments(
                    payload["inspection_id"],
                    requested_keep_target="NOT_REQUESTED",
                    goal=domain.GOAL_CORRECT_FACTS,
                    alternative_flag=False,
                ),
                call_id="call-2",
            )()

    store = get_job_store()
    accepted = store.accept(graph, actor=ARI, case_id=domain.CASE_ID, request_text=later)
    store.execute(
        graph,
        get_artifact_store(),
        get_dataset_path(),
        job_id=accepted["job_id"],
        case_id=domain.CASE_ID,
        actor=ARI,
        request_text=later,
        client=Script(),
    )
    job = jobs.read_job(graph, accepted["job_id"]) or {}
    assert job["status"] == "AWAITING_REVIEW"
    assert graph.plan(job["plan_id"])["raw_request"] == later


def test_the_job_records_real_sanitized_events(corrected):
    revision = _revision(corrected["graph"])
    job = _run(
        corrected,
        ScriptedModel(
            tool_turn(
                "inspect_impact",
                {"case_id": domain.CASE_ID, "expected_context_revision": revision},
            ),
            text_turn("done"),
        ),
    )
    kinds = [event["kind"] for event in job["events"]]
    assert kinds[0] == "context"
    assert "tool_start" in kinds and "tool" in kinds and "model" in kinds

    tool_event = next(event for event in job["events"] if event["kind"] == "tool")
    assert tool_event["tool"] == "inspect_impact"
    assert tool_event["ok"] is True
    assert tool_event["arguments"] == {
        "case_id": domain.CASE_ID,
        "expected_context_revision": revision,
    }
    # No credential, header, or private reasoning anywhere in the record.
    recorded = json.dumps(job)
    assert get_settings().nvidia_api_key not in recorded
    assert "reasoning_content" not in recorded
    assert "authorization" not in recorded.lower()


def test_a_clarification_turn_leaves_the_case_waiting(corrected):
    revision = _revision(corrected["graph"])
    job = _run(
        corrected,
        ScriptedModel(
            tool_turn(
                "inspect_impact",
                {"case_id": domain.CASE_ID, "expected_context_revision": revision},
            ),
            tool_turn(
                "request_clarification",
                {
                    "case_id": domain.CASE_ID,
                    "missing_field": "INTENT_CLAIM_VERSUS_PROPOSAL",
                    "question": "Keep the proposal open, or keep the cheaper statement?",
                    "context_ids": [domain.DOC_MEMO],
                },
                call_id="call-2",
            ),
        ),
    )
    assert job["status"] == "NEEDS_CLARIFICATION"
    assert job["plan_id"] is None
    assert "cheaper statement" in job["clarification_question"]
    assert corrected["graph"].case(domain.CASE_ID)["status"] == "NEEDS_CLARIFICATION"
    assert corrected["graph"].plans_for_case(domain.CASE_ID) == []


def test_an_unresolved_intent_leaves_the_question_as_the_only_next_action(corrected):
    """Once the tools say the reading is unresolved, the loop narrows the choice.

    Otherwise a run can spend its whole budget re-attempting the staging the
    tool layer has already refused.
    """
    graph = corrected["graph"]
    revision = _revision(graph)

    class Script(ScriptedModel):
        def _create(self, **kwargs: Any) -> Any:
            index = len(self.calls)
            self.calls.append(kwargs)
            if index == 0:
                return tool_turn(
                    "inspect_impact",
                    {"case_id": domain.CASE_ID, "expected_context_revision": revision},
                )()
            last = json.loads(self.calls[-1]["messages"][-1]["content"])
            if index == 1:
                # The model's own reading says the request never said what to keep.
                return tool_turn(
                    "stage_review",
                    _stage_arguments(last["inspection_id"], requested_keep_target="UNSTATED"),
                    call_id="call-2",
                )()
            return tool_turn(
                "request_clarification",
                {
                    "case_id": domain.CASE_ID,
                    "missing_field": "INTENT_CLAIM_VERSUS_PROPOSAL",
                    "question": "Keep the proposal open, or keep the cheaper statement?",
                },
                call_id="call-3",
            )()

    model = Script()
    job = _run(corrected, model)

    assert model.calls[0]["tool_choice"] == "required"
    assert model.calls[1]["tool_choice"] == "required"
    # After the refusal, asking is the only call the model may make.
    assert model.calls[2]["tool_choice"] == {
        "type": "function",
        "function": {"name": "request_clarification"},
    }
    codes = [event.get("code") for event in job["events"] if event["kind"] == "tool"]
    assert "CLARIFICATION_REQUIRED" in codes
    assert job["status"] == "NEEDS_CLARIFICATION"
    assert graph.plans_for_case(domain.CASE_ID) == []


# -- model failure modes ------------------------------------------------------


def test_an_empty_completion_is_a_failure_not_a_success(corrected):
    job = _run(corrected, ScriptedModel(text_turn("")))
    assert job["status"] == "TOOL_ERROR"
    assert job["error_code"] == "MODEL_EMPTY_RESPONSE"
    assert job["plan_id"] is None


def test_a_truncated_completion_is_a_failure(corrected):
    job = _run(corrected, ScriptedModel(text_turn("", finish_reason="length")))
    assert job["status"] == "TOOL_ERROR"
    assert job["error_code"] == "MODEL_TRUNCATED"


def test_prose_without_any_tool_call_takes_no_action(corrected):
    job = _run(corrected, ScriptedModel(text_turn("South now costs more, I think.")))
    assert job["status"] == "TOOL_ERROR"
    assert job["error_code"] == "MODEL_TOOK_NO_ACTION"
    assert corrected["graph"].plans_for_case(domain.CASE_ID) == []


def test_rate_limiting_is_reported_honestly(corrected):
    error = openai.RateLimitError(
        "too many requests",
        response=httpx.Response(429, request=_request()),
        body=None,
    )
    job = _run(corrected, ScriptedModel(raising_turn(error)))
    assert job["status"] == "TOOL_ERROR"
    assert job["error_code"] == "MODEL_RATE_LIMITED"


def test_a_model_timeout_is_reported_as_a_timeout(corrected):
    job = _run(
        corrected, ScriptedModel(raising_turn(openai.APITimeoutError(request=_request())))
    )
    assert job["status"] == "TIMED_OUT"
    assert job["error_code"] == "MODEL_TIMEOUT"


def test_an_unreachable_endpoint_is_a_recoverable_failure(corrected):
    error = openai.APIConnectionError(request=_request())
    job = _run(corrected, ScriptedModel(raising_turn(error)))
    assert job["status"] == "TOOL_ERROR"
    assert job["error_code"] == "MODEL_UNAVAILABLE"


def test_a_refused_request_keeps_its_status_code(corrected):
    error = openai.APIStatusError(
        "service unavailable", response=httpx.Response(503, request=_request()), body=None
    )
    job = _run(corrected, ScriptedModel(raising_turn(error)))
    assert job["error_code"] == "MODEL_HTTP_503"


def test_an_unconfigured_model_cannot_be_called_at_all(corrected):
    runner = AgentRunner(settings=get_settings().model_copy(update={"nvidia_api_key": ""}))
    toolbox = AgentToolbox(
        graph=corrected["graph"],
        store=get_artifact_store(),
        csv_path=get_dataset_path(),
        principal=agent_principal(ARI),
        case_id=domain.CASE_ID,
        job_id="job-unconfigured",
    )
    with pytest.raises(Exception) as failure:
        runner.run(toolbox, raw_request=REQUEST, summary=toolbox.case_summary())
    assert getattr(failure.value, "code", "") == "MODEL_NOT_CONFIGURED"


# -- malformed and unknown calls ----------------------------------------------


def test_malformed_tool_arguments_are_refused(corrected):
    job = _run(
        corrected,
        ScriptedModel(tool_turn("inspect_impact", '{"case_id": "case-dispatch-b09-b1')),
    )
    codes = [event.get("code") for event in job["events"] if event["kind"] == "tool"]
    assert "MALFORMED_ARGUMENTS" in codes
    assert job["plan_id"] is None
    assert corrected["graph"].plans_for_case(domain.CASE_ID) == []


def test_an_invented_tool_is_refused_and_the_run_still_ends_safely(corrected):
    job = _run(
        corrected,
        ScriptedModel(
            tool_turn("approve_plan", {"plan_id": "plan-anything", "reviewer_id": "person-sam"})
        ),
    )
    codes = [event.get("code") for event in job["events"] if event["kind"] == "tool"]
    assert "UNKNOWN_TOOL" in codes
    assert job["plan_id"] is None
    assert (
        corrected["graph"].workspace(domain.WORKSPACE_ID)["current_release_id"]
        == corrected["version_one"]["release_id"]
    )


def test_the_tool_call_budget_is_bounded(corrected):
    revision = _revision(corrected["graph"])
    turns = [
        tool_turn(
            "inspect_impact",
            {"case_id": domain.CASE_ID, "expected_context_revision": revision + 50},
            call_id=f"call-{index}",
        )
        for index in range(8)
    ]
    job = _run(corrected, ScriptedModel(*turns))
    assert job["model_turn_count"] <= get_settings().agent_max_model_turns
    assert job["tool_call_count"] <= get_settings().agent_max_tool_calls
    assert job["status"] == "STALE_CONTEXT"
    assert job["plan_id"] is None


# -- a changed world between inspection and staging ---------------------------


def test_a_reviewer_change_mid_run_is_rejected_then_recovered(corrected):
    graph = corrected["graph"]
    revision = _revision(graph)
    operator = Actor("person-operator", "Demo Operator", "operator", False)

    def between(index: int) -> None:
        if index == 1:
            # The world moves after the inspection and before staging.
            service.reassign_reviewer(
                graph,
                actor=operator,
                from_person_id=domain.PERSON_NOOR,
                to_person_id=domain.PERSON_SAM,
                expected_revision=_revision(graph),
            )

    class Script(ScriptedModel):
        def _create(self, **kwargs: Any) -> Any:
            index = len(self.calls)
            self.calls.append(kwargs)
            if self._between:
                self._between(index)
            if index == 0:
                return tool_turn(
                    "inspect_impact",
                    {"case_id": domain.CASE_ID, "expected_context_revision": revision},
                )()
            last = json.loads(self.calls[-1]["messages"][-1]["content"])
            if index == 1:
                # Stage against the now-stale inspection.
                return tool_turn(
                    "stage_review", _stage_arguments(last["inspection_id"]), call_id="call-2"
                )()
            if index == 2:
                # The refusal reports the current revision; re-inspect with it.
                assert last["error"]["code"] == "STALE_INSPECTION"
                return tool_turn(
                    "inspect_impact",
                    {
                        "case_id": domain.CASE_ID,
                        "expected_context_revision": last["error"]["current_context_revision"],
                    },
                    call_id="call-3",
                )()
            return tool_turn(
                "stage_review",
                _stage_arguments(last["inspection_id"], idempotency_key="k2"),
                call_id="call-4",
            )()

    job = _run(corrected, Script(between=between))

    codes = [event.get("code") for event in job["events"] if event["kind"] == "tool"]
    assert "STALE_INSPECTION" in codes
    assert job["status"] == "AWAITING_REVIEW"
    plan = graph.plan(job["plan_id"])
    # Fresh authority decides who the review goes to.
    assert plan["assigned_reviewer_id"] == domain.PERSON_SAM
    assert len(graph.plans_for_case(domain.CASE_ID)) == 1


def test_a_repeated_stage_call_does_not_create_a_second_plan(corrected):
    graph = corrected["graph"]
    revision = _revision(graph)

    class Script(ScriptedModel):
        def _create(self, **kwargs: Any) -> Any:
            index = len(self.calls)
            self.calls.append(kwargs)
            if index == 0:
                return tool_turn(
                    "inspect_impact",
                    {"case_id": domain.CASE_ID, "expected_context_revision": revision},
                )()
            inspection = json.loads(self.calls[0 if index == 1 else -1]["messages"][-1]["content"])
            return tool_turn(
                "stage_review",
                _stage_arguments(inspection.get("inspection_id", "insp-missing")),
                call_id=f"call-{index}",
            )()

    first = _run(corrected, Script())
    assert first["status"] == "AWAITING_REVIEW"

    # A second run, for the same case, cannot be accepted while one is under
    # review, so there is no way to stage a duplicate plan behind the reviewer.
    with pytest.raises(Exception) as refused:
        get_job_store().accept(
            graph, actor=ARI, case_id=domain.CASE_ID, request_text=REQUEST
        )
    assert getattr(refused.value, "code", "") == "CASE_STATE"
    assert len(graph.plans_for_case(domain.CASE_ID)) == 1
