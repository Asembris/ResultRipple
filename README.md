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
| Infrastructure | Docker Compose, one named volume with AOF persistence |

## Local setup

Requirements: Docker, Python 3.12, Node.js 20+.

### 1. Start FalkorDB

```bash
cp .env.example .env
docker compose up -d
```

### 2. Start the API

```bash
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements-dev.txt   # Linux/macOS: .venv/bin/python
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. The page shows live API and FalkorDB readiness, read from
the backend's `/ready` endpoint — not a hard-coded status.

## Environment variables

Copy `.env.example` to `.env`; it contains no secrets.

| Variable | Default | Meaning |
| --- | --- | --- |
| `FALKORDB_HOST` | `127.0.0.1` | FalkorDB host the API connects to |
| `FALKORDB_PORT` | `6379` | Published FalkorDB port (compose and API) |
| `FALKORDB_GRAPH` | `resultripple` | Graph name the API selects |
| `FALKORDB_TIMEOUT_SECONDS` | `2.0` | Connect and socket timeout for graph calls |
| `API_HOST` / `API_PORT` | `127.0.0.1` / `8000` | Uvicorn bind address |
| `VITE_API_BASE_URL` | `http://127.0.0.1:8000` | API base URL used by the frontend |

If port 8000 is already taken on your machine, start Uvicorn with another port and set
`VITE_API_BASE_URL` to match.

## Endpoints

| Endpoint | Behaviour |
| --- | --- |
| `GET /health` | Liveness only. Touches no external dependency. |
| `GET /ready` | Runs a real parameterized FalkorDB query. `200` when the graph answers, `503` with a typed `error_code` when it does not. |

## Smoke tests

```bash
cd backend && .venv/Scripts/python -m pytest -q
```

```bash
cd frontend && npm run typecheck && npm run test && npm run build
```

Backend tests cover liveness, readiness in both directions, and a typed failure from an
unreachable port. The live-graph probe test skips itself when no FalkorDB is running.

Persistence check (survives a container restart):

```bash
docker compose exec falkordb redis-cli CONFIG GET appendonly appendfsync
```

## Current implementation status

Bootstrap foundation only:

- Docker Compose running FalkorDB 6.0.2 with a named volume, AOF enabled and
  `appendfsync always`, verified to survive a container restart.
- FastAPI service with typed configuration, a single FalkorDB access module using fixed
  parameterized queries, liveness and graph-backed readiness endpoints, and typed errors.
- React + TypeScript + Vite shell that displays real backend and FalkorDB readiness,
  including the failure reason when the graph is unreachable.
- Backend pytest smoke tests; frontend typecheck, Vitest tests, and production build.

Not implemented yet: the domain graph schema, the synthetic dataset and seeding, finding
registration and reuse, the correction case, the deterministic publication engine and
independent verifier, human approval and immutable editions, the NVIDIA tool-using agent,
reviewer reassignment, and deployment. Those arrive on later feature branches.

## Limitations

ResultRipple checks registered finding cards and the typed decision-status block in named
report versions. Narrative outside those blocks is not assessed. Approved provenance can
still be factually wrong: human approval and template correctness do not establish
real-world truth. All organizational data in this project is fictional demo setup.

## Development assistance

Development assistance: Claude Code was used for implementation support. Architecture,
testing, verification, and submission decisions were reviewed by the project author.

## License

See [LICENSE](LICENSE).
