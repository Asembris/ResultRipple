# ResultRipple

When evidence behind a recommendation changes, ResultRipple finds every linked report,
prepares the responsible person's review, and issues corrected editions after approval.

An analyst registers a reusable, approved finding from a cost comparison while writing an
operations review, reuses the same finding in an executive memo, and explicitly connects
it to a proposed business decision. A later evidence correction then becomes a complete
correction-and-review case — corrected editions, a decision returned to its owner, and a
release that only the currently assigned reviewer can authorize — instead of a warning
someone has to chase across documents.

Built for [WeMakeDevs × FalkorDB Graph Hacks 2026](https://www.wemakedevs.org/hackathons/falkordb),
**Track 3 — Company Brain**. FalkorDB is the authoritative connected context: the live
graph determines which published work a correction affects, whose decision it touches, and
who may approve the release.

## Stack

| Part | Choice |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, plain CSS |
| API | Python 3.12, FastAPI, Pydantic, Uvicorn (single worker) |
| Graph | FalkorDB 6.0.2, official `falkordb` Python client |
| Model | `nvidia/nemotron-3-super-120b-a12b`, NVIDIA-hosted, through the OpenAI-compatible client |
| Artifacts | Jinja2 with autoescaping, standard-library exact arithmetic |
| Infrastructure | Docker Compose, one named volume with AOF persistence |

## Local setup

Requirements: Docker, Python 3.12, Node.js 20+.

### 1. Start FalkorDB

```bash
cp .env.example .env
docker compose up -d
```

### 2. Seed the demo workspace

```bash
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements-dev.txt   # Linux/macOS: .venv/bin/python
.venv/Scripts/python -m scripts.seed_demo --reset
```

Seeding writes only primitive facts — the 15-batch dataset, three lanes, one comparison,
one shared finding registered in two reports, one proposal and its reviewer, and the
dispatch correction note. It then issues **Version 1 by running the real staging,
approval, verification and release path once**, with its approvals labelled demo setup.
No corrected file, affected-document list, or reviewer answer is seeded.

**Authoring-start workspace (tests and CI).** `--fresh` writes the same primitive facts
into an *empty* graph, but with no claim, no occurrence, no finding block and no decision
basis, and no edition. It refuses any graph that already holds nodes, so it never clears a
workspace in use:

```bash
FALKORDB_GRAPH=rr_authoring .venv/Scripts/python -m scripts.seed_demo --fresh
```

The analyst then registers the finding, places it in both reports and records the basis
through the UI, and the first edition is issued from the **Initial publication** case
through the same staging, approval and release path as any revision. One API process
serves one graph; the backend tests and the `e2e-authoring` CI job use this seed on their
own graph. The deployed workspace's starting state, "demo setup" or "authoring start",
will come from the operator reset planned in G3.

### 3. Start the API

```bash
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

Signing in as a demo identity needs a server-side passcode. With `DEMO_PASSCODES`
unset, the API generates throwaway ones for this process and logs them at startup:

```
DEMO_PASSCODES is unset; generated development passcodes for this process only:
person-ari=... person-noor=... person-sam=... person-operator=...
```

Copy them from that log when you sign in. They are never committed, never shipped
in the frontend bundle, and never returned by any endpoint.

The agent needs an NVIDIA credential. Put it in the repository-root `.env` (which is
Git-ignored) or in the environment; either location is loaded whichever directory you
start Uvicorn from, and real environment variables win over both:

```
NVIDIA_API_KEY=...
NVIDIA_API_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=nvidia/nemotron-3-super-120b-a12b
```

Without it the API still runs: `GET /ready` reports `agent.configured: false`, agent runs
are refused with `MODEL_NOT_CONFIGURED`, and the app offers the labelled manual
correction workflow instead.

### 4. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. The dev server proxies `/api` to the backend so the
HttpOnly demo session cookie stays first-party.

## Walking through the case

1. Sign in as **Ari Mensah** (analyst) in the role bar, pasting that identity's
   passcode from the API log. Without a session you are an observer: every read
   works and every mutation returns 401.
2. Read the dispatch note `DX-2026-0914` and click **Confirm correction**. Three effective
   memberships move from South to Pilot; the raw CSV and every recorded cost stay
   unchanged. Both published cards are immediately marked out of date — by direction, not
   by magnitude, since the effect stays 40 cents while its meaning reverses.
3. Under **Ask the agent**, send the request in your own words — the composer starts
   with *"Update the reports, but keep South as the cheaper option in the rollout memo."*
   The run's real tool events appear as they complete. The agent investigates through the
   graph, recognises that the requested cost endorsement is contradicted, and stages an
   explicit alternative: correct both registered uses and return the proposal for review.
   The engine enumerates every registered occurrence itself, renders both candidate
   editions, and assigns the review to whoever the graph currently names — not to a
   document owner. Ask it something ambiguous instead — *"Keep South in the memo; send
   it."* — and it records one focused question rather than guessing.
4. Sign in as **Noor Haddad** with her own passcode, open both candidate previews,
   acknowledge the proposed alternative, and click **Approve revision**. Approval binds to
   one exact plan version and execution fingerprint.
5. Click **Issue editions**. The server re-reads the graph, regenerates the bytes, requires
   exact agreement with the approved hashes, audits them independently, writes the package,
   and moves one current-release pointer.

Try it as the wrong person: Sam owns the memo and holds a review-capable identity, and
still cannot approve the case. Try it with the wrong credential: Ari's passcode does not
authenticate anyone as Noor. Try telling the agent it already has permission — there is no
tool through which it could act on that.

## The frozen dataset

15 synthetic batches of equal analytical weight, integer cents per parcel, in
`backend/data/batches.csv`:

| Batches | Initial lane | Cost (cents) | Corrected lane |
| --- | --- | --- | --- |
| B01–B04 | North | 380, 400, 420, 400 | North |
| B05–B08 | South | 420, 440, 460, 440 | South |
| B09–B11 | South | 240, 250, 270 | **Pilot** |
| B12–B15 | Pilot | 250, 260, 240, 250 | Pilot |

North stays 1600/4 = 400 cents. South moves from 2520/7 = 360 to 1760/4 = 440. North minus
South therefore moves from **+40 to −40 cents**, and the published claim changes from
"South costs $0.40 less per parcel than North" to "South costs $0.40 more per parcel than
North" (dollars, operations review) and from "40 cents cheaper" to "40 cents more
expensive" (cents, memo). The CSV bytes and all 15 costs are untouched; exactly three
effective membership relationships change.

The four-batch minimum is a declared demo policy, not evidence of statistical
significance. This is a descriptive comparison, not a causal savings estimate.

## Environment variables

Copy `.env.example` to `.env`; it contains no secrets.

| Variable | Default | Meaning |
| --- | --- | --- |
| `FALKORDB_HOST` | `127.0.0.1` | FalkorDB host the API connects to |
| `FALKORDB_PORT` | `6379` | Published FalkorDB port (compose and API) |
| `FALKORDB_GRAPH` | `resultripple` | Graph name the API selects |
| `FALKORDB_TIMEOUT_SECONDS` | `2.0` | Connect and socket timeout for graph calls |
| `API_HOST` / `API_PORT` | `127.0.0.1` / `8000` | Uvicorn bind address |
| `ARTIFACT_ROOT` | `backend/runtime/artifacts` | Staged candidates and immutable issued editions |
| `DATASET_CSV_PATH` | `backend/data/batches.csv` | Immutable measurements |
| `APP_ENV` | `development` | `development` or `test` allow generated local credentials; anything else is a deployment |
| `SESSION_SECRET` | development placeholder | Signs the demo session cookie. A deployment must set a real value of at least 32 characters |
| `DEMO_PASSCODES` | unset | `person-id=passcode` pairs gating sign-in. Generated and logged locally; required in a deployment |
| `PUBLIC_ORIGIN` | unset | The deployed site's own `https://` origin. Required in a deployment; the only origin allowed to change state there |
| `VITE_API_BASE_URL` | `/api` | API base used by the frontend (same-origin by default) |
| `NVIDIA_API_KEY` | unset | The agent's credential. Environment only; never logged, returned, or written into an artifact |
| `NVIDIA_API_BASE_URL` | `https://integrate.api.nvidia.com/v1` | OpenAI-compatible endpoint |
| `NVIDIA_MODEL` | `nvidia/nemotron-3-super-120b-a12b` | The one frozen model |
| `NVIDIA_REASONING` | `false` | Hosted reasoning control, verified supported. See [docs/agent.md](docs/agent.md) |
| `AGENT_DEADLINE_SECONDS` | `25` | Request through persisted candidates |
| `AGENT_MAX_MODEL_TURNS` · `AGENT_MAX_TOOL_CALLS` | `4` · `6` | Per-job ceilings |
| `AGENT_MAX_COMPLETION_TOKENS` | `4096` | Per-job ceiling, including reported reasoning |
| `AGENT_MAX_CONCURRENT_JOBS` | `2` | Process-wide bound; one worker, one lock |

If port 8000 is already taken, start Uvicorn elsewhere and point the dev proxy at it with
`API_PROXY_TARGET=http://127.0.0.1:8010 npm run dev`.

## Endpoints

| Endpoint | Behaviour |
| --- | --- |
| `GET /health` | Liveness only. Touches no external dependency. |
| `GET /ready` | Runs a real parameterized FalkorDB query. `200` when the graph answers, `503` with a typed `error_code` when it does not. |
| `POST /auth/demo-session` | Signs in a provisioned demo identity against its server-side passcode. Capability is then resolved from the graph, never from a request body. |
| `POST /auth/sign-out` | Drops the session and returns to observing, which is read-only. |
| `GET /workspace` | Current evidence, live comparison, registered scope, per-occurrence freshness, decision and current reviewer, cases and releases. |
| `GET /comparisons/{id}` | What the analyst confirms: dataset, both sides, metric, sample counts, unit and the server-generated sentence, computed live. |
| `POST /findings` | Analyst only. Registers the displayed comparison as an approved finding, given its ID, the revision the analyst saw and the explicit "This is the intended comparison" confirmation. No free prose. |
| `POST /documents/{id}/linked-findings` | Analyst only. Creates or reuses the finding's one placement in a document, in that layout's approved style (dollars in the operations report, cents in the memo), and updates the source-block inventory in the same guarded write. |
| `POST /decisions/{id}/basis` | Analyst only. Records an explicit, confirmed `Decision -[BASED_ON]-> Claim`; the finding must already sit in the document that carries the decision block. |
| `POST /corrections/{case_id}/apply` | Analyst confirms the dispatch source; one guarded mutation moves exactly the recorded batches. |
| `POST /cases/{case_id}/agent-runs` | Starts one bounded agent job from the analyst's own words. Persisted before any inference; `202` with a job id. |
| `GET /jobs/{job_id}` | Real status, completed tool events, usage, elapsed time, errors and the resulting plan id. |
| `GET /cases/{case_id}/agent-runs` | The runs recorded for a case. |
| `POST /cases/{case_id}/stage-review` | The manual fallback: renders real candidates and persists one review plan over the complete registered scope. |
| `POST /cases/{case_id}/refresh-review` | Deterministic re-staging for an authorized reviewer-only change. No inference, no transferred approval. |
| `GET /plans/{id}` · `/plans/{id}/candidates/{document_id}` | Plan fingerprint and scope; the actual staged draft bytes. |
| `POST /plans/{id}/approve` · `/reject` | Current assigned reviewer only, against one exact version and fingerprint. |
| `POST /plans/{id}/release` | Re-reads context, regenerates, verifies, commits the whole package. Idempotent per `operation_id`. |
| `GET /editions/{release_id}/{document_id}` | Serves only an allowlisted path recorded in a committed release. |
| `GET /releases/{id}/receipt` | Run receipt: hashes, approval, authority at issue, verification result. |
| `POST /demo/reviewer-assignment` | Guarded synthetic rota change. Demo-operator capability only; no model or analyst path. |
| `POST /demo/reset` | Demo-operator only. `{"mode": "demo_setup"}` or `{"mode": "authoring_start"}`. Refuses while another workspace write (issuing editions included) holds the lock or any agent run is unfinished; otherwise clears the graph, then the artifact volume, reseeds through the same seed functions as the CLI, issues a real Version 1 for `demo_setup`, and returns a receipt with the release and edition hashes it reads back. |

Refusals carry a stable code — `CORRECTION_SCOPE_MISMATCH`, `MISSING_PROVENANCE`,
`DUPLICATE_PROVENANCE`, `NO_REVIEWER`, `AMBIGUOUS_REVIEWER`, `NOT_AUTHORIZED`,
`ALTERNATIVE_NOT_ACKNOWLEDGED`, `STALE_PLAN`, `AUTHORITY_CHANGED`, `CANDIDATE_MISMATCH`,
`VERIFICATION_FAILED`, `MODEL_NOT_CONFIGURED`, `AGENT_RUN_IN_FLIGHT`, `AGENT_BUSY`,
`STALE_REVISION`, `BINDING_NOT_CONFIRMED`, `BASIS_NOT_CONFIRMED`, `CARD_STYLE_NOT_ALLOWED`,
`BASIS_REQUIRES_LINKED_FINDING`, `BASIS_ALREADY_RECORDED`, `ORIGIN_REFUSED`,
`ORIGIN_REQUIRED`, `WORKSPACE_BUSY` — plus the witness the UI needs to explain them.

Every state-changing request must name its origin (`Origin`, or `Referer` as a fallback)
and that origin must be the site's own. In a deployment a request naming neither is
refused; locally a request with neither is a test client or script and is let through,
but a named foreign origin never is.

## Graph model and queries

See [docs/graph-model.md](docs/graph-model.md) for the schema, the cardinality rules, and
the FalkorDB 6.0.2 compatibility notes, and [docs/queries.md](docs/queries.md) for the
essential queries including both guarded mutations.

## The agent

See [docs/agent.md](docs/agent.md) for the four typed tools, the bounded loop, the
authority boundary, the model configuration and the measured latency. In short: the model
interprets the request and chooses between correcting and holding; the engine owns every
figure, the card wording, the complete scope and every permission check; and a staged plan
is a draft that only the currently assigned reviewer can approve.

## How correctness is enforced

- **Arithmetic** uses integer cents and exact `Fraction` means. Rounding happens only for
  display, under a pinned half-up rule, and direction is decided on the exact signed
  difference rather than on rounded text.
- **The factual grammar is finite**: lower cost, higher cost, equal mean cost, or an
  explicit withheld comparison with a reason. A card is rendered whole from a closed
  template; no free-text span is ever patched.
- **Scope is enumerated by the engine**, from a document-rooted inventory query. A caller
  cannot silently exclude the second report.
- **Candidate-content identity** covers measurements, memberships, the evidence definition
  and binding, every source block and occurrence, the typed decision disposition, the bound
  intent, and the template version. **Execution identity** adds the candidate hashes, the
  current reviewer, the context revision, the plan version, and the prior release. A
  reviewer change therefore preserves the bytes while invalidating the approval.
- **Guarded mutations write everything or nothing.** Every existence and cardinality
  check precedes the first write clause, so a missing document or occurrence prevents a
  release or plan from being created rather than suppressing its return value. A filter
  placed after a write is not a rollback.
- **Issuing a session requires a credential.** Naming an identity is not authenticating
  as one. Passcodes are held server-side, compared in constant time, and never served to
  the browser; a deployment that still carries the development session secret or has no
  passcodes provisioned refuses to start.
- **The model supplies no fact.** It has four typed tools with strict schemas and no
  capability to approve, release, reassign, correct evidence, or name a path. Its
  principal is not a `Person` in the graph, so every authority check fails for it by
  construction. Its note is shown as unassessed commentary and never enters a card. A
  missing, empty or truncated completion is reported as a failure, never narrated as a
  staged review.
- **An independent verifier** (`backend/app/verify_artifacts.py`) re-reads the immutable
  CSV and the membership snapshot, re-derives the arithmetic, re-states the expected
  sentence from its own copy of the grammar, and parses the actual generated bytes. It
  imports nothing from the engine, the renderer, or the templates.

## Tests

```bash
cd backend && .venv/Scripts/python -m pytest -q
```

```bash
cd frontend && npm run typecheck && npm run test && npm run build
```

The backend suite runs against a **real FalkorDB** on an isolated graph (`rr_test`) and an
isolated artifact volume; nothing mocks the graph. It covers the hand-derived arithmetic,
the immutable CSV hash with exactly three changed memberships, impact discovered through
real traversal, complete occurrence coverage that a caller cannot narrow, missing and
duplicate provenance, missing and ambiguous review authority, reviewer enforcement,
unacknowledged alternatives, stale approval, tampered candidates, idempotent release, and
an authority change that refuses a previously valid approval. Separate suites prove that a
refused release or plan leaves the graph byte-identical, and that a session cannot be
issued by naming an identity, by guessing a passcode, by reusing another identity's
passcode, or by forging a cookie. The independent verifier is
exercised against the real issued bytes and must reject a reversed direction, a changed
magnitude, a contradicted assertion left behind, edited narrative, a wrong decision
disposition, a missing second report, and bytes that differ from the approved hashes.

The agent is covered at three levels. Its tools run against the real graph with no model
involved: unknown tools, invalid arguments, a stale revision, a provenance gap, a focused
subset that cannot narrow the scope, repeated staging that cannot duplicate a plan, an
unstated request target that cannot be staged under any goal, a persisted clarification,
and an agent principal that cannot approve, reject, release, reassign or correct. The
bounded loop runs against a scripted completion endpoint for the failure modes — empty,
truncated, prose-only, rate-limited, timed out, unreachable, malformed arguments, an
invented tool, an exhausted budget, a world that changes between inspection and staging,
and the turn after an unresolved intent being constrained to the question. Finally,
`tests/test_agent_live.py` makes **real NVIDIA calls** for the semantic scenarios — a
contradicted instruction, an ordinary request, genuine ambiguity, an instruction injected
into the source note, and a real tool failure — and verifies the candidate bytes the agent
actually staged with the independent verifier. Those skip when no credential is
configured; the five-run latency measurement is marked `readiness` and deselected by
default because it spends five inference budgets.

Authoring has its own suites on a fresh workspace: the full authoring, first edition,
correction, staging, approval and release path, with both issued files parsed for their
typed cards and a graph query showing exactly 1 claim, 2 occurrences, 2 documents and 1
basis link; and the refusals: an observer or reviewer authoring, an unknown comparison, a
stale revision, a retried or duplicated write (including the Cypher guards on their own),
an unsupported style, an unconfirmed binding or basis, and a missing source block that
blocks staging and release.

The browser suite has two Playwright projects, each needing its own workspace:
`npm run test:e2e -- --project=workflow` against the demo-setup seed, and
`npm run test:e2e -- --project=authoring` against a `--fresh` graph. CI runs them as the
separate `e2e` and `e2e-authoring` jobs.

Live-graph tests skip themselves when no FalkorDB is reachable, and refuse to run against
the `resultripple` demo graph.

Persistence check (the current editions survive a container restart):

```bash
docker compose exec falkordb redis-cli CONFIG GET appendonly appendfsync
```

## Current implementation status

The complete manual vertical slice works end to end against real FalkorDB:

- The frozen 15-batch dataset, the graph schema, and seeding, with Version 1 issued by the
  real publication path rather than shipped as a file.
- Evidence correction through one guarded mutation; exactly three effective memberships
  change and the raw measurements do not.
- Impact and authority discovered by live Cypher traversal, with the complete registered
  scope enumerated independently of the caller.
- Exact aggregation, a finite factual grammar, and whole-card rendering into two
  standalone autoescaped HTML editions.
- An independent verifier that parses the real generated bytes.
- Separate **Approve revision** and **Issue editions** actions behind passcode-gated,
  signed, expiring, HttpOnly demo sessions, with release re-reading authoritative context
  and failing closed on stale approval or changed authority.
- Immutable editions, a single current-release pointer, idempotent retries, and a run
  receipt; verified to survive a FalkorDB container restart.
- Natural finding authoring: register the displayed comparison, insert the linked finding
  into both reports, record the decision basis, and issue the initial publication, each a
  single guarded and idempotent graph write behind the analyst's session.
- A real NVIDIA tool-using agent that interprets the request, investigates through live
  graph queries, exposes the conflict between what was asked and what the evidence
  supports, and stages a reviewable alternative — or asks one question instead. Bounded
  jobs, honest failure states, and an unfinished run marked interrupted after a restart.

Not implemented yet: the reviewer-reassignment and review-refresh *interface* (the API, its guards and its tests
already exist, because the release guard depends on them) and the final production UI.
Those arrive on later feature branches. Deployment is described below.

The manual staging path remains as an explicitly labelled fallback for when inference is
unavailable. It runs the same deterministic staging with a human-chosen typed frame, and
is not an agent demonstration.

## Deployment

One host runs [compose.prod.yaml](compose.prod.yaml): FalkorDB, the API and Caddy, and
nothing else.

| Service | Exposure | State |
| --- | --- | --- |
| `falkordb` (`falkordb/falkordb:6.0.2`) | Internal Docker network only, no published port | Named volume `falkordb-data`, AOF with `appendfsync always` |
| `api` ([backend/Dockerfile](backend/Dockerfile)) | Private networks only; reached through Caddy | Named volume `api-runtime` for staged candidates and issued editions |
| `caddy` ([frontend/Dockerfile](frontend/Dockerfile)) | Ports 80 and 443 | Named volumes for certificates and Caddy state |

Caddy serves the built frontend at `/`, proxies `/api/*` to the API with the prefix
stripped, and obtains the certificate for `SITE_HOST` automatically. The API runs one
Uvicorn worker with `APP_ENV=production`, which refuses to start without a
`SESSION_SECRET` of at least 32 characters, `DEMO_PASSCODES`, and an `https://`
`PUBLIC_ORIGIN`. The session cookie is then `Secure; HttpOnly; SameSite=Lax`.

Server layout:

```
/opt/resultripple/.env   chmod 600: SITE_HOST, SESSION_SECRET, DEMO_PASSCODES, NVIDIA_API_KEY
/opt/resultripple/app    a clone of this repository
```

`SESSION_SECRET` and the passcodes are generated on the server and never printed;
`NVIDIA_API_KEY` is copied there with `scp`. Nothing secret is in the repository, the
images or a log. To start or update the stack and seed it the first time:

```bash
cd /opt/resultripple/app
docker compose --env-file /opt/resultripple/.env -f compose.prod.yaml up -d --build
docker compose --env-file /opt/resultripple/.env -f compose.prod.yaml exec api python -m scripts.seed_demo
```

After that the operator resets the workspace through `POST /api/demo/reset`. Visitors
without a session get the observer workspace: every read works and every mutation is
refused by the server, while a signed-in role sees each action and receives the server's
own refusal when it is not its to take. The frontend tells an unreachable API (a proxy
`502`/`503` or a network failure) apart from FalkorDB being unavailable (reported by
`/ready`).

## Limitations

ResultRipple checks registered finding cards and the typed decision-status block in named
report versions. Narrative outside those blocks is not assessed. Approved provenance can
still be factually wrong: human approval and template correctness do not establish
real-world truth. An artifact hash proves which bytes were issued, not that the dispatch
note was right. Old downloads and external copies stay untouched; the app issues new
editions and marks its own hosted history.

Demo passcodes are a sandbox gate for a workspace of fictional data, not enterprise
authentication: there is no account system, password rotation, multi-factor step, or
sign-in rate limit. They stop an unauthenticated caller from simply claiming to be the
reviewer; they are not a substitute for real identity management.

There is no rate limiting anywhere: not on sign-in, agent runs, resets or reads. The
deployment is a single small host for a fictional demo, and a determined caller can
exhaust its agent budget or its CPU. Passcode guessing is bounded only by the passcodes'
length.

The commit protocol is a local filesystem protocol plus one guarded graph write, not a
distributed transaction. Before the pointer commit a crash can leave a private orphan
directory; after it, referenced files must exist and hash-match. The API runs as a single
worker because the mutation lock is in-process.

The model's interpretation is fallible. A typed goal is the model's reading of a request,
not proof that the analyst meant it, which is why the raw request stays beside it and a
human has to acknowledge any alternative before approving. Measured over repeated runs the
ambiguous request reached a question every time once the tool layer began forcing it, but
this is a stochastic model on a shared endpoint: both its choices and its latency vary.

All organizational data in this project is fictional demo setup.

## Development assistance

Development assistance: Claude Code was used for implementation support. Architecture,
testing, verification, and submission decisions were reviewed by the project author.

## License

See [LICENSE](LICENSE).
