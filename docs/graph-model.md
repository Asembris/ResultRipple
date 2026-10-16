# Graph model

FalkorDB holds the authoritative connected context for ResultRipple: current
memberships, approved evidence bindings, registered occurrences, document
ownership, the recorded decision basis, review authority, and publication state.

Nothing in application logic caches those answers. With FalkorDB unavailable,
every graph-backed operation stops with `503`, and that includes serving an
already issued edition: an edition is served only through the path and hash its
release recorded in the graph. The files stay intact on the artifact volume and
are served again once FalkorDB answers.

## What the graph is *not* authoritative for

- **The measurements.** `backend/data/batches.csv` is immutable input. The
  engine reads both and refuses when they disagree (`MEASUREMENT_MISMATCH`).
- **Arithmetic, wording, coverage, and permission checks.** Those belong to the
  deterministic engine in `backend/app/engine.py`.

## Nodes

| Label | Essential properties |
| --- | --- |
| `Workspace` | `id`, `context_revision`, `demo`, `label` |
| `Dataset` | `id`, `title`, `raw_sha`, `expected_batch_count`, `schema_version` |
| `Batch` | `id`, `cost_cents` (immutable), `recorded_lane` (historical input) |
| `Lane` | `id`, `name` |
| `Comparison` | `id`, `metric_key` (allowlisted), `min_n`, `display_precision` |
| `Claim` | `id`, `definition_version`, `title`, `approved_at`, `approval_statement`, `approval_witness` — the shared finding identity |
| `Occurrence` | `id`, `card_style`, `block_id`, `original_assertion` (the typed assertion actually published), `registered_by`, `registered_at` |
| `Document` | `id`, `title`, `template`, `source_revision`, `source_sha`, `source_blocks` |
| `Person` | `id`, `display_name`, `demo_role`, `review_capable` |
| `Team` | `id`, `name` |
| `Decision` | `id`, `title`, `status` |
| `CorrectionCase` | `id`, `status`, `source_note`, `source_note_sha`, `source_ref`, `from_lane_id`, `to_lane_id`, `request_text`, `decision_id`, `comparison_id`, `applied_by`, `applied_at`, `demo_setup`, `clarification_*` |
| `ReviewPlan` | `id`, `version`, `status`, `raw_request`, `goal`, `alternative_flag`, `disposition`, `note`, `content_hash`, `execution_fingerprint`, `candidates`, `scope`, `context_revision`, `prior_release_id`, `staged_at`, `staged_by`, `idempotency_key`, `approved_at`, `approved_by`, `acknowledged_alternative`, `invalidation_reason`, `superseded_by`, `refused_action`, `refused_at`, `invalidated_at`, `rejected_at` |
| `Release` | `id`, `sequence`, `issued_at`, `artifacts`, `receipt`, `occurrence_snapshots`, `operation_id` |
| `AgentJob` | `id`, `status`, `request_text`, `requested_by`, `model`, `endpoint`, `reasoning`, `started_at`, `finished_at`, `events`, `usage`, `tool_call_count`, `model_turn_count`, `elapsed_ms`, `plan_id`, `error_code`, `error_detail`, `clarification_*` |

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
                                                   {recorded_by, recorded_at, statement}
(Decision)-[:OWNED_BY]->(Team)
(Team)-[:REVIEWED_BY]->(Person)                    current review authority
                                                   {source, assigned_by, assigned_at}

(CorrectionCase)-[:CHANGES_BATCH]->(Batch)
(CorrectionCase)-[:AFFECTS_LANE {role}]->(Lane)    FROM and TO for an evidence
                                                   correction; LEFT and RIGHT, with
                                                   source 'initial-publication',
                                                   for a first edition

(ReviewPlan)-[:FOR_CASE]->(CorrectionCase)
(ReviewPlan)-[:COVERS]->(Occurrence)               the complete registered scope
(ReviewPlan)-[:ASSIGNED_TO_REVIEWER]->(Person)
(ReviewPlan)-[:APPROVED_BY]->(Person)

(Release)-[:FROM_PLAN]->(ReviewPlan)
(Release)-[:INCLUDES_DOCUMENT]->(Document)

(AgentJob)-[:FOR_CASE]->(CorrectionCase)           one bounded agent run
```

Document ownership and review authority are deliberately separate paths. Sam
owns the memo and holds a review-capable identity, yet cannot approve the case
unless `(Team)-[:REVIEWED_BY]->(Sam)` currently holds. Replacing that one edge
changes whose approval is usable without changing a single candidate byte.

## Statuses

| Node | Values |
| --- | --- |
| `CorrectionCase` | `CORRECTION_PENDING` → `CORRECTION_APPLIED` → `AWAITING_REVIEW` → `APPROVED` → `ISSUED`, with `NEEDS_CLARIFICATION` and `NEEDS_CHANGES` |
| `ReviewPlan` | `AWAITING_REVIEW` → `APPROVED` → `ISSUED`, with `REJECTED`, `INVALIDATED`, `STALE_AUTHORITY` and `SUPERSEDED` |

A plan whose approval or release is refused because the reviewer changed becomes
`STALE_AUTHORITY`, with `invalidation_reason: AUTHORITY_CHANGED`, the `refused_action`
(`APPROVAL` or `RELEASE`) and `refused_at`. The deterministic refresh then stages the next
version for the current reviewer and marks the old one `SUPERSEDED`, keeping that history.
A plan the evidence or sources moved past becomes `INVALIDATED` and reopens its case
(`NEEDS_CHANGES`). In both cases the old approval is kept as history, never as
permission.

## Seeded state and reset

Both seeds create two correction cases. The first is a first-edition case whose
`AFFECTS_LANE` edges carry `source: 'initial-publication'`. In demo setup it is the
`DEMO-SETUP` case, which issues Version 1 at once through the real release path. In the
`--fresh` authoring seed it is the **Initial publication** case, issued once the analyst
has authored the reports. The second is the `DX-2026-0914` dispatch case, which waits for
the analyst. The operator's `POST /demo/reset` clears the graph
with `MATCH (n) DETACH DELETE n`, clears the artifact volume, and reseeds through the
same functions as the CLI.

## What decides the publication scope

The scope is every registered card in every `Document` (query C), never a list a
caller supplies. The case's impact traversal (query B) walks from the lanes the
case affects through comparison, claim and occurrence to each document, and the
two must name exactly the same occurrences at staging, refresh and release. The
traversal is a cross-check on the inventory, not the source of the scope: it
cannot add a card the inventory lacks, and an empty traversal is a hold, never
"no dependencies".

The decision is a fixed workspace primitive (`dec-south-expansion`), not found by
traversal. Its status changes at release only through its recorded
`(Decision)-[:BASED_ON]->(Claim)` path to a claim placed in the released scope;
without that path the release writes nothing.

Not covered: memberships are not reconciled against direct graph writes made
outside the API. A batch moved by an out-of-band write is published as the
effective membership it now has; only the correction mutation enforces "exactly
the recorded batches move".

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
| Occurrence bound to another comparison than the one rendered, or a decision basis not placed beside the decision block | `MISBOUND_PROVENANCE` |
| Decision block with no recorded basis | `MISSING_DECISION_BASIS` |
| The case's impact traversal and the registered inventory disagree | `IMPACT_SCOPE_MISMATCH` |
| More than one current-release pointer | `AMBIGUOUS_CURRENT_RELEASE` |
| A comparison withheld below its minimum sample or display resolution, at staging | `RESULT_WITHHELD` |

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
