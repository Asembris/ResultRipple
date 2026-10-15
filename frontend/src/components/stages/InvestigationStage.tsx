import { useCallback, useEffect, useRef, useState } from "react";

import { ApiRefusal, fetchJob, startAgentRun, stageReview } from "../../api";
import type { AgentEvent, AgentJob, JobStatus } from "../../types";
import { RELATION_PHRASE, money } from "../../workflow";
import type { StageContext } from "./context";

/**
 * Step 3 — one real agent run.
 *
 * Every line in the run record is an event the server recorded, with the
 * elapsed time it measured. There is no typing effect, no invented reasoning
 * and no success state the job did not reach. The triptych reads the staged
 * plan; the figures in it come from the deterministic engine, never the model.
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

const EVENT_KIND: Record<string, string> = {
  context: "graph",
  model: "model",
  tool: "tool",
  tool_start: "tool",
  message: "model",
  delay: "delay",
};

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

/** Suggestions, not presets: each is sent verbatim as the analyst's request. */
const SUGGESTIONS = [
  "Correct the affected reports and send the expansion proposal back for review.",
  "Keep South in the memo; send it.",
];

export default function InvestigationStage({ context }: { context: StageContext }) {
  const { workspace, kase, actor, plan, readiness } = context;
  const [draft, setDraft] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<AgentJob | null>(null);
  const [starting, setStarting] = useState(false);
  const finished = useRef<string | null>(null);

  const latestRun = kase?.agent_runs.at(-1) ?? null;

  useEffect(() => {
    if (!jobId && latestRun) setJobId(latestRun.job_id);
  }, [jobId, latestRun?.job_id]);

  useEffect(() => {
    if (kase) setDraft((value) => value || kase.request_text);
  }, [kase?.request_text]);

  const poll = useCallback(async () => {
    if (!jobId) return;
    try {
      const next = await fetchJob(jobId);
      setJob(next);
      if (next.terminal && finished.current !== next.job_id) {
        finished.current = next.job_id;
        // A finished run moved the world: re-read it rather than assume.
        await context.commit(async () => next);
      }
    } catch {
      /* a lost poll is not a state change */
    }
  }, [jobId, context]);

  useEffect(() => {
    if (!jobId) return;
    void poll();
    // Short polling against the real job record; there is nothing to animate.
    const timer = window.setInterval(() => void poll(), 900);
    return () => window.clearInterval(timer);
  }, [jobId, poll]);

  if (!kase) return null;

  const agent = readiness?.agent ?? null;
  // Any session sees the action; the server decides who may take it.
  const signedIn = actor !== null;
  const running = Boolean(job && !job.terminal);
  const canRun =
    signedIn &&
    !starting &&
    !running &&
    draft.trim().length > 0 &&
    (agent?.configured ?? false) &&
    ["CORRECTION_APPLIED", "NEEDS_CHANGES", "NEEDS_CLARIFICATION"].includes(kase.status);

  const run = async () => {
    setStarting(true);
    setJob(null);
    try {
      const accepted = await startAgentRun(kase.case_id, draft.trim());
      finished.current = null;
      setJobId(accepted.job_id);
    } catch (error) {
      // Show the server's own refusal, such as a reviewer starting a run.
      context.notify(
        error instanceof ApiRefusal ? `${error.code}: ${error.detail}` : "The run could not be started.",
      );
      console.error(error);
    } finally {
      setStarting(false);
    }
  };

  const staged = plan && plan.status !== "ISSUED" ? plan : null;
  const comparison = workspace.comparison;
  const analystName = workspace.people.find((p) => p.person_id === kase.applied_by)?.display_name;
  const heading = staged
    ? `${(plan?.staged_by && workspace.people.find((p) => p.person_id === plan.staged_by)?.display_name.split(" ")[0]) ?? analystName?.split(" ")[0] ?? "The analyst"} asked to ${GOAL_LABEL[staged.goal] ?? staged.goal.toLowerCase()}.`
    : running
      ? "The agent is investigating."
      : "What should happen to the published work?";

  return (
    <section className="rr-stage" role="region" aria-label="Ask the agent">
      <h1>{heading}</h1>

      <div>
        <label className="rr-field" htmlFor="rr-request">
          {actor ? `${actor.display_name}'s request, in their own words` : "The analyst's request"}
        </label>
        <textarea
          id="rr-request"
          className="rr-composer"
          rows={3}
          value={draft}
          maxLength={2000}
          disabled={!signedIn || running}
          onChange={(event) => setDraft(event.target.value)}
        />
      </div>

      {!staged && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {signedIn ? (
            <button type="button" className="rr-primary" onClick={run} disabled={!canRun}>
              <span>{running ? "Agent is working…" : "Run agent"}</span>
              <span>→</span>
            </button>
          ) : (
            <p className="rr-copy">Sign in as the analyst above to send a request.</p>
          )}
          <div className="rr-buttons">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="rr-secondary"
                disabled={!signedIn || running}
                onClick={() => setDraft(suggestion)}
              >
                {suggestion.length > 46 ? `${suggestion.slice(0, 44)}…` : suggestion}
              </button>
            ))}
          </div>
          {agent?.configured ? (
            <div className="rr-mono">
              {agent.model} at {agent.endpoint} · at most {agent.max_model_turns} model turns,{" "}
              {agent.max_tool_calls} tool calls and {agent.max_completion_tokens} completion tokens,
              within {agent.deadline_seconds}s{agent.reasoning ? " · reasoning on" : ""}. The agent
              cannot approve, publish, or reassign anyone.
            </div>
          ) : (
            <div className="rr-alert-coral">
              <div className="rr-alert-coral__label">Manual correction workflow — AI unavailable</div>
              <div className="rr-alert-coral__meta">
                No NVIDIA credential is configured, so the deterministic staging below is the honest
                fallback. It is not an agent demonstration.
              </div>
              {signedIn && (
                <button
                  type="button"
                  className="rr-outline"
                  style={{ marginTop: 12 }}
                  onClick={() =>
                    void context.commit(() =>
                      stageReview(kase.case_id, {
                        raw_request: draft.trim() || kase.request_text,
                        goal: "RETAIN_CHEAPER_CLAIM",
                        disposition: "RETURN_FOR_REVIEW",
                        alternative_flag: true,
                        note: "Staged by a person because inference is unavailable. The engine owns the scope, the numbers and the card wording.",
                        idempotency_key: `${kase.case_id}-manual-stage`,
                      }),
                    )
                  }
                >
                  Stage manually instead
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {job && (
        <div className="rr-run">
          <div className="rr-run__head">
            <span>Run record · {job.job_id}</span>
            <span
              style={{
                color: FAILED.includes(job.status)
                  ? "var(--rr-coral)"
                  : job.status === "AWAITING_REVIEW"
                    ? "var(--rr-sage)"
                    : "var(--rr-amber)",
              }}
            >
              {STATUS_LABEL[job.status]}
            </span>
          </div>
          {job.events
            .filter((event) => event.kind !== "tool_start")
            .map((event, index) => (
              <div className="rr-run__event" key={`${event.at}-${index}`}>
                <span className={`rr-run__kind rr-run__kind--${event.ok === false ? "error" : (EVENT_KIND[event.kind] ?? "model")}`}>
                  {event.ok === false ? "refused" : (EVENT_KIND[event.kind] ?? event.kind)}
                </span>
                <span className="rr-run__text">{describe(event)}</span>
                <span className="rr-run__ms">
                  {typeof event.elapsed_ms === "number" ? `${event.elapsed_ms} ms` : ""}
                </span>
              </div>
            ))}
          {running && <div className="rr-run__pending">Investigating current context…</div>}
          {job.terminal && (
            <div className="rr-run__usage">
              {job.model_turn_count} model turn{job.model_turn_count === 1 ? "" : "s"} ·{" "}
              {job.tool_call_count} tool call{job.tool_call_count === 1 ? "" : "s"} ·{" "}
              {(job.elapsed_ms / 1000).toFixed(1)}s · {job.usage.total_tokens ?? 0} tokens
              {job.usage.reasoning_tokens ? ` (${job.usage.reasoning_tokens} reasoning)` : ""} ·{" "}
              {job.model}
            </div>
          )}
        </div>
      )}

      {job && FAILED.includes(job.status) && (
        <div className="rr-refusal" role="alert">
          <div className="rr-refusal__head">
            <span className="rr-refusal__kicker">Run failed</span>
          </div>
          <div className="rr-refusal__code rr-refusal__code--small">{job.error_code}</div>
          <div className="rr-refusal__detail rr-refusal__detail--small">
            {job.error_detail}. Nothing was staged, approved, or published.
          </div>
        </div>
      )}

      {job?.status === "NEEDS_CLARIFICATION" && job.clarification_question && (
        <div className="rr-triptych">
          <div className="rr-trip rr-trip--requested">
            <div className="rr-trip__label">Requested</div>
            <div className="rr-trip__requested">{job.request_text}</div>
          </div>
          <div className="rr-trip rr-trip--evidence">
            <div className="rr-trip__label">Evidence</div>
            <div className="rr-trip__headline">
              {comparison ? evidenceSentence(comparison) : "held"}
            </div>
          </div>
          <div className="rr-trip rr-trip--proposed" style={{ background: "linear-gradient(90deg,transparent,#E8B06A0C)" }}>
            <div className="rr-trip__label" style={{ color: "var(--rr-coral)" }}>
              Question
            </div>
            <div>
              <div className="rr-trip__headline">{job.clarification_question}</div>
              <div className="rr-trip__meta">
                <span>recorded as {job.clarification_field}</span>
                <span className="rr-pill rr-pill--coral">NOTHING STAGED</span>
              </div>
            </div>
          </div>
          <p className="rr-copy" style={{ marginTop: 16 }}>
            Answer it by sending a clearer request above. No review is staged and nothing is
            published while it is open.
          </p>
        </div>
      )}

      {staged && (
        <>
          <div className="rr-triptych">
            <div className="rr-trip rr-trip--requested">
              <div className="rr-trip__label">Requested</div>
              <div>
                <div className="rr-trip__requested">{staged.raw_request}</div>
                <div className="rr-trip__meta">
                  <span>goal {staged.goal}</span>
                  {staged.alternative_flag && <span className="rr-pill rr-pill--coral">CONTRADICTED</span>}
                </div>
              </div>
            </div>

            <div className="rr-trip rr-trip--evidence">
              <div className="rr-trip__label">Evidence</div>
              <div>
                <div className="rr-trip__headline">
                  {comparison ? evidenceSentence(comparison) : "held"}
                </div>
                {comparison && (
                  <div className="rr-trip__meta">
                    <span>
                      {comparison.left.lane_name} {money(comparison.left.mean_display_cents)} ·{" "}
                      {comparison.right.lane_name} {money(comparison.right.mean_display_cents)} ·
                      figures from the deterministic engine, not the model
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="rr-trip rr-trip--proposed">
              <div className="rr-trip__label">Proposed</div>
              <div>
                <div className="rr-trip__headline">
                  Correct {staged.covered_occurrence_ids.length} registered use
                  {staged.covered_occurrence_ids.length === 1 ? "" : "s"} and return the{" "}
                  {workspace.decision?.title ?? "proposal"} for review.
                </div>
                <div className="rr-trip__meta">
                  <span>{staged.disposition}</span>
                  {staged.alternative_flag && (
                    <span className="rr-pill rr-pill--amber">ALTERNATIVE · NEEDS ACKNOWLEDGMENT</span>
                  )}
                </div>
              </div>
            </div>

            {staged.note && <p className="rr-note">“{staged.note}”</p>}
            <div className="rr-note__label">agent note · unassessed commentary</div>

            <div className="rr-copy" style={{ marginTop: 20 }}>
              Plan v{staged.version} is staged as a draft for{" "}
              <span style={{ color: "var(--rr-ink)" }}>
                {staged.assigned_reviewer_name ?? staged.assigned_reviewer_id}
              </span>
              , the current reviewer.
            </div>
          </div>

          {context.serverStep > 3 && (
            <button type="button" className="rr-primary" onClick={() => context.goTo(4)}>
              <span>Open {staged.assigned_reviewer_name?.split(" ")[0] ?? "the"}&apos;s review</span>
              <span>→</span>
            </button>
          )}
        </>
      )}
    </section>
  );
}

function evidenceSentence(comparison: NonNullable<StageContext["workspace"]["comparison"]>): string {
  if (comparison.relation === "WITHHELD") return comparison.hold_reason ?? "comparison withheld";
  if (comparison.relation === "EQUAL_COST")
    return `${comparison.right.lane_name} and ${comparison.left.lane_name} have equal mean cost per parcel.`;
  return `${comparison.right.lane_name} costs ${money(comparison.magnitude_cents)} ${
    RELATION_PHRASE[comparison.relation] === "cheaper" ? "less" : "more"
  } per parcel than ${comparison.left.lane_name}.`;
}
