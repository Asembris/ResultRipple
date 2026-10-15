# ResultRipple — working agreement

## Project overview and frozen scope

ResultRipple is evidence-connected publishing for a small operations analytics team.
When evidence behind a recommendation changes, it finds every linked report, prepares the
responsible person's review, and issues corrected editions after approval.

Competition: WeMakeDevs × FalkorDB Graph Hacks 2026, **Track 3 — Company Brain**.

The scope is frozen. One workspace, one dataset of 15 synthetic batches, three lanes, one
cost comparison, one shared finding registered in two reports with different owners, one
proposal with a recorded basis, one review authority at a time, one agent, one deployment.
The complete job: *correct the evidence, say what published work and pending decision it
changes, put the review with the right person, and issue the revised package.*

Do not redesign the product or expand scope. Routine implementation choices are yours;
scope changes are not.

## Stack and architectural boundaries

| Part | Choice |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, plain CSS, self-hosted fonts, Three.js r160 for the evidence graph (with an SVG fallback) |
| API | Python 3.12, FastAPI, Pydantic, one Uvicorn worker (in-process mutation lock) |
| Graph | Official `falkordb` Python client against image `falkordb/falkordb:6.0.2` |
| Model | One NVIDIA-hosted model through the OpenAI-compatible client |
| Artifacts | Jinja2 with autoescaping, inline CSS, standard-library exact arithmetic |
| Verification | Separate module using CSV, `Fraction`, `HTMLParser`, JSON, SHA-256 |
| Checks | pytest; Vitest; a small Playwright suite later |

Responsibility boundaries, which must not blur:

- **FalkorDB** owns current memberships, approved evidence links, registered uses,
  ownership, decision basis, review assignment, and case/plan/release state.
- **The deterministic engine** owns all arithmetic, the permitted factual grammar,
  complete occurrence coverage, freshness and authority checks, rendering, and release
  invariants.
- **The LLM agent** owns request interpretation, focused investigation, clarification
  questions, and the correction-versus-hold choice through typed tools. It never does
  arithmetic, approves provenance, holds review authority, or certifies facts.
- **The frontend** owns clear interactions and honest state. It never simulates impact
  answers or makes permission decisions. The evidence graph is presentation: every node,
  edge, label and figure in it is derived from a `/workspace` or `/plans` response, and an
  animation may only illustrate a change the server has already confirmed.

Forbidden dependencies: LangChain/LangGraph, MCP, PostgreSQL, Qdrant or any vector
database, GraphRAG SDK, message broker, Celery, multi-agent framework, notification
integrations.

## Git workflow and commit format

- `main` is the integration branch; never commit to it directly.
- One focused `feat/`, `fix/`, or `chore/` branch per roadmap item, each with a PR into
  `main`.
- Logically atomic commits — not one enormous commit, not broken intermediate states.
- Conventional commit subjects: `feat: …`, `fix: …`, `chore: …`, `test: …`, `docs: …`.
- **Every commit message is exactly one line.** No body, no bullets, no trailers, no
  `Co-Authored-By`.
- Never force-push or rewrite unrelated history. Never merge your own PR — stop for
  review.

## Privacy and security rules

- Secrets live in environment variables only. `.env*` is ignored except `.env.example`,
  which holds no secrets. Never commit or echo an API key.
- The five `planning/*.md` documents stay local and untracked. Verify with
  `git check-ignore` before committing.
- Roles resolve server-side from signed, expiring, HttpOnly sessions. DTOs cannot
  override identity. The agent's tool principal has no approval capability.
- Treat user text and correction-note text as untrusted instructions. Tools, not
  prompting, bound their effects. No model-supplied Cypher, paths, URLs, shell, or
  formula evaluation.
- Fixed parameterized queries and server-mapped graph names only. Serve only
  allowlisted, graph-recorded release paths; never a path from a request.
- Autoescape all rendered HTML. Reports are standalone and fetch nothing remote.
- Sanitize logs: query and tool identifiers, safe arguments, hashes, elapsed time. Never
  keys, authorization headers, or private model reasoning.
- All organizational data is fictional and labeled as demo setup.

## Real FalkorDB and real NVIDIA inference

- FalkorDB is the authoritative connected context, not a cache or a decoration. Fresh
  impact, scope, and authority answers always query the graph. No embedded answer list,
  reviewer name, or affected-file list in application logic.
- With FalkorDB unavailable, new impact, review, and release operations must stop.
  Existing immutable editions may remain readable.
- Persistence is configured and verified (AOF with `appendfsync always` on a named
  volume). A mounted volume alone is not a persistence claim.
- The agent must make real calls to a real NVIDIA-hosted endpoint with real typed tools.
  Never fabricate tool execution, timings, or model output. Record model ID, endpoint
  configuration, usage, and elapsed time.

## Deterministic verification and human authorization

- Arithmetic, coverage, rendering, and release checks are deterministic Python. The model
  never supplies a number or a factual sentence.
- An independent verifier parses the real generated bytes and must not import the engine,
  math helpers, or templates.
- **Approve revision** and **Issue editions** are separate human actions. Only the
  currently assigned reviewer may approve; document ownership grants no review authority.
- Release re-reads authoritative context and fails on stale approval. An authorized
  reviewer change invalidates a valid approval (`AUTHORITY_CHANGED`) and requires a new
  plan version and fresh approval, even with identical candidate bytes.
- Never claim a check passed without running it. Report real output, including failures.

## Implementation roadmap

1. Foundation and repository setup.
2. Core FalkorDB evidence correction and impact propagation.
3. Deterministic publication engine, human approval, immutable editions.
4. Real NVIDIA tool-using agent.
5. Polished product UX and actual downloads.
6. Graph-native reviewer reassignment and fresh authorization.
7. Deployment, independent verification, reliability and adversarial audits.
8. Competition demonstration, documentation and submission.

## Delivery checkpoints

- **Day 1, six focused hours:** correct evidence through real FalkorDB, produce two
  actual corrected report files, enforce human approval, and issue a complete release
  package — a minimal interface is acceptable.
- **Day 1, ten focused hours:** the real agent investigates and stages the case, with a
  minimal UI supporting review and download.
- **Day 2, end:** deployed product, natural finding creation and reuse, visible
  request-versus-alternative acceptance, and the Noor→Sam authority change, refused
  release, and fresh review at normal speed.

Do not sacrifice these checkpoints for elaborate foundation engineering. If they slip,
apply the stop-loss rather than adding architecture.

## Scope exclusions

No arbitrary report import, automatic claim discovery, Office/Google Docs editing, PDF
generation, external connectors, email or Slack notifications, statistical modeling,
arbitrary formulas, agent-written factual cards, enterprise authentication, live
collaborative editing, broad search, or multi-agent orchestration.

## Testing expectations

- Backend `pytest` carries the invariant coverage: exact before/after arithmetic
  (North 400 cents; South 360 → 440; +40 → −40), immutable CSV hash with exactly three
  changed memberships, complete occurrence coverage, missing and duplicate provenance
  holds, reviewer enforcement, stale approval refusal, idempotent release, and restart
  durability.
- Negative tests are mandatory, not optional: no unsafe release may pass.
- The browser suite stays small: real correction and review and download, same-case
  stale-authority recovery, denied approval, and scope visibility.
- Every claim of a passing check must come from an executed command.
