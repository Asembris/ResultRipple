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

### 3. Start the API

```bash
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

### 4. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. The dev server proxies `/api` to the backend so the
HttpOnly demo session cookie stays first-party.

## Walking through the case

1. Sign in as **Ari Mensah** (analyst) in the role bar.
2. Read the dispatch note `DX-2026-0914` and click **Confirm correction**. Three effective
   memberships move from South to Pilot; the raw CSV and every recorded cost stay
   unchanged. Both published cards are immediately marked out of date — by direction, not
   by magnitude, since the effect stays 40 cents while its meaning reverses.
3. Click **Stage the review**. The engine enumerates every registered occurrence itself,
   renders both candidate editions, and assigns the review to whoever the graph currently
   names — not to a document owner.
4. Sign in as **Noor Haddad**, open both candidate previews, acknowledge the proposed
   alternative, and click **Approve revision**. Approval binds to one exact plan version
   and execution fingerprint.
5. Click **Issue editions**. The server re-reads the graph, regenerates the bytes, requires
   exact agreement with the approved hashes, audits them independently, writes the package,
   and moves one current-release pointer.

Try it as the wrong person: Sam owns the memo and holds a review-capable identity, and
still cannot approve the case.

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
| `SESSION_SECRET` | development value | Signs the demo session cookie; override in any deployment |
| `VITE_API_BASE_URL` | `/api` | API base used by the frontend (same-origin by default) |

If port 8000 is already taken, start Uvicorn elsewhere and point the dev proxy at it with
`API_PROXY_TARGET=http://127.0.0.1:8010 npm run dev`.

## Endpoints

| Endpoint | Behaviour |
| --- | --- |
| `GET /health` | Liveness only. Touches no external dependency. |
| `GET /ready` | Runs a real parameterized FalkorDB query. `200` when the graph answers, `503` with a typed `error_code` when it does not. |
| `POST /auth/demo-session` | Signs in a provisioned demo identity. Capability is resolved from the graph, never from a request body. |
| `GET /workspace` | Current evidence, live comparison, registered scope, per-occurrence freshness, decision and current reviewer, cases and releases. |
| `GET /comparisons/{id}` | Approved definition plus live counts and the exact result. |
| `POST /corrections/{case_id}/apply` | Analyst confirms the dispatch source; one guarded mutation moves exactly the recorded batches. |
| `POST /cases/{case_id}/stage-review` | Renders real candidates and persists one review plan over the complete registered scope. |
| `POST /cases/{case_id}/refresh-review` | Deterministic re-staging for an authorized reviewer-only change. No inference, no transferred approval. |
| `GET /plans/{id}` · `/plans/{id}/candidates/{document_id}` | Plan fingerprint and scope; the actual staged draft bytes. |
| `POST /plans/{id}/approve` · `/reject` | Current assigned reviewer only, against one exact version and fingerprint. |
| `POST /plans/{id}/release` | Re-reads context, regenerates, verifies, commits the whole package. Idempotent per `operation_id`. |
| `GET /editions/{release_id}/{document_id}` | Serves only an allowlisted path recorded in a committed release. |
| `GET /releases/{id}/receipt` | Run receipt: hashes, approval, authority at issue, verification result. |
| `POST /demo/reviewer-assignment` | Guarded synthetic rota change. Demo-operator capability only; no model or analyst path. |

Refusals carry a stable code — `CORRECTION_SCOPE_MISMATCH`, `MISSING_PROVENANCE`,
`DUPLICATE_PROVENANCE`, `NO_REVIEWER`, `AMBIGUOUS_REVIEWER`, `NOT_AUTHORIZED`,
`ALTERNATIVE_NOT_ACKNOWLEDGED`, `STALE_PLAN`, `AUTHORITY_CHANGED`, `CANDIDATE_MISMATCH`,
`VERIFICATION_FAILED` — plus the witness the UI needs to explain them.

## Graph model and queries

See [docs/graph-model.md](docs/graph-model.md) for the schema, the cardinality rules, and
the FalkorDB 6.0.2 compatibility notes, and [docs/queries.md](docs/queries.md) for the
essential queries including both guarded mutations.

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
an authority change that refuses a previously valid approval. The independent verifier is
exercised against the real issued bytes and must reject a reversed direction, a changed
magnitude, a contradicted assertion left behind, edited narrative, a wrong decision
disposition, a missing second report, and bytes that differ from the approved hashes.

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
- Separate **Approve revision** and **Issue editions** actions behind signed, expiring,
  HttpOnly demo sessions, with release re-reading authoritative context and failing closed
  on stale approval or changed authority.
- Immutable editions, a single current-release pointer, idempotent retries, and a run
  receipt; verified to survive a FalkorDB container restart.

Not implemented yet: finding creation and reuse through the UI, the NVIDIA tool-using
agent and natural-language intent interpretation, the reviewer-reassignment and
review-refresh *interface* (the API, its guards and its tests already exist, because the
release guard depends on them), the final production UI, and deployment. Those arrive on
later feature branches.

In this phase the typed intent frame is chosen deterministically by a person rather than
by a model. The staging path, the scope enumeration, the rendering, and every permission
check are the same ones the agent will drive through typed tools.

## Limitations

ResultRipple checks registered finding cards and the typed decision-status block in named
report versions. Narrative outside those blocks is not assessed. Approved provenance can
still be factually wrong: human approval and template correctness do not establish
real-world truth. An artifact hash proves which bytes were issued, not that the dispatch
note was right. Old downloads and external copies stay untouched; the app issues new
editions and marks its own hosted history.

The commit protocol is a local filesystem protocol plus one guarded graph write, not a
distributed transaction. Before the pointer commit a crash can leave a private orphan
directory; after it, referenced files must exist and hash-match. The API runs as a single
worker because the mutation lock is in-process.

All organizational data in this project is fictional demo setup.

## Development assistance

Development assistance: Claude Code was used for implementation support. Architecture,
testing, verification, and submission decisions were reviewed by the project author.

## License

See [LICENSE](LICENSE).
