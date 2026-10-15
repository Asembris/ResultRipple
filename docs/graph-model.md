# Graph model

FalkorDB holds the authoritative connected context for ResultRipple: current
memberships, approved evidence bindings, registered occurrences, document
ownership, the recorded decision basis, review authority, and publication state.

Nothing in application logic caches those answers. With FalkorDB unavailable,
new impact, review, and release operations stop; already issued editions remain
readable from the artifact volume.

## What the graph is *not* authoritative for

- **The measurements.** `backend/data/batches.csv` is immutable input. The
  engine reads both and refuses when they disagree (`MEASUREMENT_MISMATCH`).
- **Arithmetic, wording, coverage, and permission checks.** Those belong to the
  deterministic engine in `backend/app/engine.py`.

## Nodes

| Label | Essential properties |
| --- | --- |
| `Workspace` | `id`, `context_revision`, `demo` |
| `Dataset` | `id`, `raw_sha`, `expected_batch_count`, `schema_version` |
| `Batch` | `id`, `cost_cents` (immutable), `recorded_lane` (historical input) |
| `Lane` | `id`, `name` |
| `Comparison` | `id`, `metric_key` (allowlisted), `min_n`, `display_precision` |
| `Claim` | `id`, `definition_version` — the shared finding identity |
| `Occurrence` | `id`, `card_style`, `block_id`, `original_assertion` (the typed assertion actually published) |
| `Document` | `id`, `title`, `template`, `source_revision`, `source_sha`, `source_blocks` |
| `Person` | `id`, `display_name`, `demo_role`, `review_capable` |
| `Team` | `id`, `name` |
| `Decision` | `id`, `title`, `status` |
| `CorrectionCase` | `id`, `status`, `source_note`, `source_note_sha`, `source_ref`, `from_lane_id`, `to_lane_id`, `request_text` |
| `ReviewPlan` | `id`, `version`, `status`, `raw_request`, `goal`, `alternative_flag`, `disposition`, `content_hash`, `execution_fingerprint`, `candidates`, `scope` |
| `Release` | `id`, `sequence`, `issued_at`, `artifacts`, `receipt`, `occurrence_snapshots`, `operation_id` |

Nested structures (source blocks, plan scope, release receipts) are stored as
canonical JSON strings. They are historical and render snapshots; they never
replace a current relationship query.

## Relationships

```
(Workspace)-[:HAS_DATASET]->(Dataset)
(Workspace)-[:CURRENT_RELEASE]->(Release)          exactly one, moved atomically

(Dataset)-[:HAS_BATCH]->(Batch)                    exactly one per batch
(Batch)-[:ASSIGNED_TO]->(Lane)                     exactly one effective lane

(Comparison)-[:USES_DATASET]->(Dataset)
(Comparison)-[:LEFT_SIDE]->(Lane)                  reference side
(Comparison)-[:RIGHT_SIDE]->(Lane)                 subject side
(Comparison)-[:OWNED_BY]->(Person)                 metric owner

(Claim)-[:BASED_ON]->(Comparison)                  human-approved binding
(Claim)-[:APPROVED_BY]->(Person)                   the analyst who confirmed it
(Occurrence)-[:OF_CLAIM]->(Claim)
(Occurrence)-[:IN_DOCUMENT]->(Document)
(Document)-[:OWNED_BY]->(Person)                   editorial owner

(Decision)-[:BASED_ON]->(Claim)                    recorded rationale
(Decision)-[:OWNED_BY]->(Team)
(Team)-[:REVIEWED_BY]->(Person)                    current review authority

(CorrectionCase)-[:CHANGES_BATCH]->(Batch)
(CorrectionCase)-[:AFFECTS_LANE {role}]->(Lane)    role is FROM or TO

(ReviewPlan)-[:FOR_CASE]->(CorrectionCase)
(ReviewPlan)-[:COVERS]->(Occurrence)               the complete registered scope
(ReviewPlan)-[:ASSIGNED_TO_REVIEWER]->(Person)
(ReviewPlan)-[:APPROVED_BY]->(Person)

(Release)-[:FROM_PLAN]->(ReviewPlan)
(Release)-[:INCLUDES_DOCUMENT]->(Document)
```

Document ownership and review authority are deliberately separate paths. Sam
owns the memo and holds a review-capable identity, yet cannot approve the case
unless `(Team)-[:REVIEWED_BY]->(Sam)` currently holds. Replacing that one edge
changes whose approval is usable without changing a single candidate byte.

## Cardinality and failing closed

Reads return relationship identities (`ID(rel)`) wherever node IDs alone would
hide a duplicate edge. The engine checks exact cardinality and holds otherwise:

| Condition | Code |
| --- | --- |
| Batch with no effective lane | `MISSING_ASSIGNMENT` |
| Batch with several effective lanes | `DUPLICATE_ASSIGNMENT` |
| Graph costs disagreeing with the CSV | `MEASUREMENT_MISMATCH` |
| Comparison without a dataset or a side | `MISSING_DATASET_SOURCE`, `MISSING_COMPARISON_SIDE` |
| Occurrence with no claim or claim with no comparison | `MISSING_PROVENANCE` |
| Duplicate location, claim link, or comparison binding | `DUPLICATE_PROVENANCE` |
| Authored finding blocks disagreeing with registered occurrences | `SCOPE_INVENTORY_MISMATCH` |
| No current reviewer / several current reviewers | `NO_REVIEWER`, `AMBIGUOUS_REVIEWER` |

"Unknown" is not "false". It narrows what may be done; it never licenses reusing
a stale supported statement.

## Context revision

`Workspace.context_revision` increments on real company and evidence changes:
applying a correction, changing the reviewer assignment, committing a release
with its decision disposition, and each authoring write (registering a finding,
placing it in a document, recording a decision basis). Staging a plan does
**not** increment it, because planning must not invalidate itself.

## Authoring

A finding is registered, placed and recorded as a basis only through three
analyst actions, each one guarded mutation keyed by a stable ID (queries H1 to
H3 in `queries.md`):

- `claim-{comparison_id}`: one approved finding per comparison, with the
  confirmation statement and a server-computed witness of what was shown.
- `occ-{document}-{comparison}` with block `finding-{claim_id}`: one placement
  per document. The occurrence, its two edges, the document's new source blocks,
  its source revision and source hash change in the same write, so registered
  cards and authored finding blocks never disagree.
- `(Decision)-[:BASED_ON]->(Claim)`: recorded only when the finding already
  sits in the document that carries the decision block, and never beside an
  existing basis.

A retry returns the existing record and writes nothing. A request made against
a revision the analyst did not see is refused with `STALE_REVISION`.

The verification scope statement in every edition and receipt is counted from
the inventory actually checked (registered occurrences and typed decision
blocks), so a one-card package states one, never two.

## FalkorDB 6.0.2 compatibility notes

Two server behaviours were reproduced against the pinned image
`falkordb/falkordb:6.0.2` (Redis 8.10.2) with client `falkordb==1.0.10`, and the
queries in `backend/app/graph.py` are written to avoid both:

1. **A relationship `MATCH` after a `WHERE`-filtered `MATCH` yields no rows.**
   For example `MATCH (w:Workspace {id:$id}) WHERE w.context_revision = 1
   MATCH (t:Team)-[:REVIEWED_BY]->(p:Person) RETURN ...` returns nothing, while
   the same patterns comma-joined in one `MATCH` with one trailing `WHERE`
   return the expected row. All guard queries therefore comma-join their
   patterns and use a single `WHERE`.

2. **The compact reply encoder panics on an aggregation beside a NULL column.**
   A `RETURN` with five or more columns that mixes an aggregate (`count(...)`)
   with a NULL projection crashes the server process (`reply.rs` `unwrap()` on
   `None`) and drops the connection. Aggregating queries therefore `coalesce`
   every nullable projection.

Both are worked around in the client, not patched in the server, and both are
covered by the integration suite.
