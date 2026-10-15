import { useCallback, useEffect, useRef, useState } from "react";

import { fetchJob, startAgentRun } from "../api";
import type { Actor, AgentEvent, AgentJob, AgentStatus, JobStatus, Workspace } from "../types";

/**
 * The request composer and the live record of one real agent run.
 *
 * Everything shown here comes from the server: the recorded tool events, the
 * model turns, the measured elapsed time and usage, and the persisted outcome.
 * Nothing is simulated -- no typing animation, no invented reasoning trace, no
 * success state that the server did not report.
 */

const STATUS_LABEL: Record<JobStatus, string> = {
  QUEUED: "Queued",
  INVESTIGATING: "Investigating current context",
  STAGING: "Staging the review",
  AWAITING_REVIEW: "Staged for review",
  NEEDS_CLARIFICATION: "Waiting for your answer",
  TOOL_ERROR: "Run failed",
  STALE_CONTEXT: "Context moved during the run",
  TIMED_OUT: "Timed out",
  INTERRUPTED: "Interrupted by a restart",
};

const GOAL_LABEL: Record<string, string> = {
  CORRECT_FACTS: "correct the published facts",
  PRESERVE_PROPOSAL: "keep the proposal open for review",
  RETAIN_CHEAPER_CLAIM: "keep the cheaper claim",
  UNKNOWN: "unclear",
};

const TOOL_LABEL: Record<string, string> = {
  get_case_context: "re-read the case",
  inspect_impact: "investigated registered impact",
  stage_review: "staged the candidate review",
  request_clarification: "recorded one question",
};

const FAILED: JobStatus[] = ["TOOL_ERROR", "STALE_CONTEXT", "TIMED_OUT", "INTERRUPTED"];

/** Suggestions, not presets: each is sent verbatim as the analyst's request. */
const SUGGESTIONS = [
  "Correct the affected reports and send the expansion proposal back for review.",
  "Keep South in the memo; send it.",
];

export default function AgentRun({
  state,
  actor,
  agent,
  onChange,
  onError,
}: {
  state: Workspace;
  actor: Actor | null;
  agent: AgentStatus | null;
  onChange: () => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const current = state.cases.find((c) => c.source_ref === "DX-2026-0914");
  const [draft, setDraft] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<AgentJob | null>(null);
  const [busy, setBusy] = useState(false);
  const finished = useRef<string | null>(null);

  const latestRun = current?.agent_runs.at(-1) ?? null;

  // Resume the most recent run after a reload, so a refresh never loses it.
  useEffect(() => {
    if (!jobId && latestRun) setJobId(latestRun.job_id);
  }, [jobId, latestRun?.job_id]);

  useEffect(() => {
    if (current) setDraft((value) => value || current.request_text);
  }, [current?.request_text]);

  const poll = useCallback(async () => {
    if (!jobId) return;
    try {
      const next = await fetchJob(jobId);
      setJob(next);
      if (next.terminal && finished.current !== next.job_id) {
        finished.current = next.job_id;
        await onChange();
      }
    } catch (error) {
      onError(error);
    }
  }, [jobId, onChange, onError]);

  useEffect(() => {
    if (!jobId) return;
    void poll();
    // Short polling against the real job record; there is nothing to animate.
    const timer = window.setInterval(() => {
      void poll();
    }, 900);
    return () => window.clearInterval(timer);
  }, [jobId, poll]);

  if (!current) return null;

  const isAnalyst = actor?.demo_role === "analyst";
  const running = Boolean(job && !job.terminal);
  const canRun =
    isAnalyst &&
    !busy &&
    !running &&
    draft.trim().length > 0 &&
    (agent?.configured ?? false) &&
    ["CORRECTION_APPLIED", "NEEDS_CHANGES", "NEEDS_CLARIFICATION"].includes(current.status);

  const run = async () => {
    setBusy(true);
    setJob(null);
    try {
      const accepted = await startAgentRun(current.case_id, draft.trim());
      finished.current = null;
      setJobId(accepted.job_id);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  const plan = job?.plan_id
    ? current.plans.find((candidate) => candidate.plan_id === job.plan_id)
    : undefined;
  const staged = state.assessment.length > 0 ? state.assessment[0] : null;

  return (
    <section className="panel" aria-labelledby="agent-heading">
      <h2 id="agent-heading">Ask the agent</h2>
      <p className="panel__lead">
        The agent reads current FalkorDB context, investigates the correction and stages a
        review. It cannot approve, publish, or reassign anyone.
      </p>

      {current.status === "CORRECTION_PENDING" && (
        <p className="meta">Confirm the correction above first; the agent investigates after it.</p>
      )}

      <div className="card">
        <label className="field" htmlFor="agent-request">
          Your request, in your own words
        </label>
        <textarea
          id="agent-request"
          className="composer"
          rows={3}
          value={draft}
          maxLength={2000}
          disabled={!isAnalyst || running}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="buttons">
          <button type="button" onClick={run} disabled={!canRun}>
            {running ? "Agent is working…" : "Run agent"}
          </button>
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="secondary"
              disabled={!isAnalyst || running}
              onClick={() => setDraft(suggestion)}
            >
              {suggestion.length > 46 ? `${suggestion.slice(0, 44)}…` : suggestion}
            </button>
          ))}
        </div>
        {!isAnalyst && <p className="meta">Sign in as the analyst to send a request.</p>}
        {agent && !agent.configured && (
          <p className="flag flag--held">
            Manual correction workflow &mdash; AI unavailable. No NVIDIA credential is
            configured, so the deterministic staging below is the honest fallback.
          </p>
        )}
        {agent?.configured && (
          <p className="meta">
            {agent.model} at {agent.endpoint} &middot; at most {agent.max_model_turns} model
            turns, {agent.max_tool_calls} tool calls and {agent.max_completion_tokens} completion
            tokens, within {agent.deadline_seconds}s
            {agent.reasoning ? " · reasoning on" : ""}
          </p>
        )}
      </div>

      {job && (
        <div className="card">
          <h3>
            Run {job.job_id} &middot;{" "}
            <span className={statusClass(job.status)}>{STATUS_LABEL[job.status]}</span>
          </h3>
          <p className="published">
            <span className="label">Original instruction</span>
            {job.request_text}
          </p>

          <ol className="events">
            {job.events
              .filter((event) => event.kind !== "tool_start")
              .map((event, index) => (
                <li key={`${event.at}-${index}`} className={event.ok === false ? "events__failed" : ""}>
                  {describe(event)}
                  {typeof event.elapsed_ms === "number" && (
                    <span className="meta"> {event.elapsed_ms} ms</span>
                  )}
                </li>
              ))}
            {running && <li className="events__pending">Still running&hellip;</li>}
          </ol>

          {job.terminal && (
            <p className="meta">
              {job.model_turn_count} model turn{job.model_turn_count === 1 ? "" : "s"},{" "}
              {job.tool_call_count} tool call{job.tool_call_count === 1 ? "" : "s"},{" "}
              {(job.elapsed_ms / 1000).toFixed(1)}s, {job.usage.total_tokens ?? 0} tokens
              {job.usage.reasoning_tokens ? ` (${job.usage.reasoning_tokens} reasoning)` : ""}
            </p>
          )}

          {FAILED.includes(job.status) && (
            <p className="flag flag--held">
              <strong>{job.error_code}</strong> &mdash; {job.error_detail}. Nothing was staged,
              approved, or published. The manual workflow below still works.
            </p>
          )}

          {job.status === "NEEDS_CLARIFICATION" && job.clarification_question && (
            <div className="intent-frame">
              <h4>One question before anything is staged</h4>
              <p className="question">{job.clarification_question}</p>
              <p className="meta">
                Recorded as {job.clarification_field}. Answer it by sending a clearer request
                above; no review is staged and nothing is published while it is open.
              </p>
            </div>
          )}

          {plan && (
            <div className="intent-frame">
              <h4>What the agent proposes</h4>
              <ul className="intent">
                <li>
                  <span className="label">Requested</span> {GOAL_LABEL[plan.goal] ?? plan.goal}
                </li>
                <li>
                  <span className="label">Evidence</span>{" "}
                  {state.comparison
                    ? `${state.comparison.right.lane_name} costs ${state.comparison.magnitude_cents} cents ${
                        state.comparison.relation === "HIGHER_COST" ? "more" : "less"
                      } per parcel than ${state.comparison.left.lane_name}`
                    : "held"}
                </li>
                <li>
                  <span className="label">Proposed</span> correct{" "}
                  {state.assessment.length} registered use
                  {state.assessment.length === 1 ? "" : "s"} and return the proposal for review
                  {staged?.relation_changed ? ", reversing the published direction" : ""}
                </li>
              </ul>
              {plan.note && <p className="note">{plan.note}</p>}
              <p className="meta">
                Plan {plan.plan_id} is a draft for{" "}
                {state.decision?.current_reviewer_name ?? plan.assigned_reviewer_id}, staged by{" "}
                {plan.staged_by ?? "the agent"}.
                {plan.alternative_flag
                  ? " This differs from what was requested: an alternative is a proposal, not consent, and the reviewer must acknowledge it below before approving."
                  : " The reviewer approves it below; issuing the editions is a separate action."}
              </p>
              <p className="unassessed">
                The agent's note is unassessed commentary. The figures and the card wording in
                the candidates come from the deterministic engine.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function statusClass(status: JobStatus): string {
  if (status === "AWAITING_REVIEW") return "flag flag--ok";
  if (FAILED.includes(status)) return "flag flag--stale";
  if (status === "NEEDS_CLARIFICATION") return "flag flag--held";
  return "flag";
}

/** One recorded event, in plain words. The server supplied every part of it. */
function describe(event: AgentEvent): string {
  if (event.kind === "context") return `Read current context from FalkorDB: ${event.summary}`;
  if (event.kind === "model") {
    const tools = event.requested_tools?.length
      ? `asked for ${event.requested_tools.join(", ")}`
      : "answered without a tool call";
    return `Model turn ${event.turn}: ${tools}`;
  }
  if (event.kind === "delay") return `Provider delay: ${event.summary}`;
  if (event.kind === "message") return `Model message: ${event.summary}`;
  const label = TOOL_LABEL[event.tool ?? ""] ?? event.tool ?? "tool";
  if (event.ok === false) return `Refused ${event.tool}: ${event.code}`;
  return `${label}${event.summary ? ` — ${event.summary}` : ""}`;
}
