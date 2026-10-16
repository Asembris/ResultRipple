# Essential queries

Every query lives in `backend/app/graph.py`. They are fixed and parameterized:
no caller — human, HTTP client, or model — supplies Cypher, labels, property
names, or a graph name.

## A. Effective evidence, preserving missing and duplicate assignments

```cypher
MATCH (ds:Dataset {id:$dataset_id})-[membership:HAS_BATCH]->(b:Batch)
OPTIONAL MATCH (b)-[assignment:ASSIGNED_TO]->(lane:Lane)
RETURN b.id AS batch_id, b.cost_cents AS cost_cents,
       lane.id AS lane_id, ds.raw_sha AS raw_sha,
       ds.expected_batch_count AS expected_batch_count,
       ID(membership) AS membership_edge_id,
       ID(assignment) AS assignment_edge_id
ORDER BY batch_id, lane_id
```

No `DISTINCT`: a duplicate edge must stay visible so the engine can hold rather
than silently average over it. The engine then cross-checks every cost against
the immutable CSV.

## B. Registered publication impact

```cypher
MATCH (ev:CorrectionCase {id:$case_id})-[:AFFECTS_LANE]->(lane:Lane),
      (cmp:Comparison)-[:LEFT_SIDE|RIGHT_SIDE]->(lane),
      (cl:Claim)-[:BASED_ON]->(cmp),
      (occ:Occurrence)-[:OF_CLAIM]->(cl),
      (occ)-[:IN_DOCUMENT]->(doc:Document)
RETURN DISTINCT cmp.id AS comparison_id, cl.id AS claim_id,
       occ.id AS occurrence_id, doc.id AS document_id
ORDER BY document_id, occurrence_id
```

A real traversal from the lanes the case affects, used as a cross-check rather
than as the scope: query C is the scope, and the engine holds
`IMPACT_SCOPE_MISMATCH` at staging, refresh and release unless both name exactly
the same occurrences. A missing edge therefore cannot shrink the scope, and an
empty traversal is a hold.

## C. Every registered card in the package

```cypher
MATCH (doc:Document)
OPTIONAL MATCH (occ:Occurrence)-[location:IN_DOCUMENT]->(doc)
OPTIONAL MATCH (occ)-[instance:OF_CLAIM]->(cl:Claim)
OPTIONAL MATCH (cl)-[binding:BASED_ON]->(cmp:Comparison)
OPTIONAL MATCH (doc)-[ownership:OWNED_BY]->(owner:Person)
RETURN doc.id AS document_id, ..., occ.id AS occurrence_id,
       ID(location) AS location_edge_id, ID(instance) AS instance_edge_id,
       ID(binding) AS binding_edge_id, ID(ownership) AS ownership_edge_id
ORDER BY document_id, occurrence_id
```

Rooted at `Document`, so an occurrence whose binding was removed stays visible
and holds the package. This is what makes a caller unable to exclude the second
report: the engine enumerates the scope itself.

## D. The decision and its current authority

```cypher
MATCH (decision:Decision {id:$decision_id})
OPTIONAL MATCH (decision)-[basis:BASED_ON]->(cl:Claim)
OPTIONAL MATCH (decision)-[ownership:OWNED_BY]->(team:Team)
OPTIONAL MATCH (team)-[authority:REVIEWED_BY]->(reviewer:Person)
RETURN decision.id AS decision_id, decision.status AS decision_status,
       cl.id AS basis_claim_id, team.id AS team_id, reviewer.id AS reviewer_id,
       ID(basis) AS basis_edge_id, ID(ownership) AS ownership_edge_id,
       ID(authority) AS authority_edge_id
```

A removed basis is a visible null, not a vanished decision. Zero or several
authority paths hold the case; exactly one is authenticated server-side. The
decision itself is a fixed primitive looked up by id, not reached by traversal.
Before any bytes are rendered the engine requires its basis to exist
(`MISSING_DECISION_BASIS`) and to be a claim placed in the document carrying the
decision block (`MISBOUND_PROVENANCE`).

## E. Applying the correction — one guarded mutation

```cypher
MATCH (w:Workspace {id:$workspace_id}),
      (c:CorrectionCase {id:$case_id}),
      (target:Lane {id:$to_lane_id}),
      (b:Batch)-[old:ASSIGNED_TO]->(:Lane {id:$from_lane_id})
WHERE w.context_revision = $expected_revision
  AND c.status = 'CORRECTION_PENDING'
  AND b.id IN $batch_ids
WITH w, c, target, collect(DISTINCT b.id) AS moved, count(old) AS edge_count
WHERE size(moved) = $expected_count AND edge_count = $expected_count
UNWIND moved AS batch_id
MATCH (moving:Batch {id:batch_id})-[stale:ASSIGNED_TO]->(:Lane {id:$from_lane_id})
DELETE stale
CREATE (moving)-[:ASSIGNED_TO]->(target)
WITH DISTINCT w, c, moved
SET w.context_revision = w.context_revision + 1,
    c.status = 'CORRECTION_APPLIED', c.applied_by = $actor_id,
    c.applied_at = $applied_at
RETURN w.context_revision AS context_revision, size(moved) AS applied_edge_count
```

Every cardinality and state guard precedes the first write clause: matching two
of three requested batches is not a successful correction, and a zero-row result
is never reported as a commit.

The service additionally refuses a batch set that differs from the one the
dispatch note records (`CORRECTION_SCOPE_MISMATCH`), before this query runs.

## F. Issuing the release — one guarded mutation

```cypher
MATCH (w:Workspace {id:$workspace_id}),
      (p:ReviewPlan {id:$plan_id})-[:FOR_CASE]->(c:CorrectionCase),
      (decision:Decision {id:$decision_id})-[:BASED_ON]->(basis:Claim {id:$basis_claim_id}),
      (basis_use:Occurrence)-[:OF_CLAIM]->(basis),
      (doc:Document),
      (occ:Occurrence)
WHERE w.context_revision = $expected_revision
  AND p.status = 'APPROVED' AND p.version = $plan_version
  AND p.execution_fingerprint = $fingerprint
  AND basis_use.id IN $occurrence_ids
  AND doc.id IN $document_ids
  AND occ.id IN $occurrence_ids
OPTIONAL MATCH (w)-[pointer:CURRENT_RELEASE]->(prior:Release)
WITH w, p, c, decision, collect(DISTINCT pointer) AS pointers,
     collect(DISTINCT prior.id) AS prior_ids,
     collect(DISTINCT doc) AS docs, collect(DISTINCT occ) AS occs
WHERE size(pointers) <= 1
  AND coalesce(head(prior_ids), '') = $expected_prior_release_id
  AND size(docs) = $expected_document_count
  AND size(occs) = $expected_occurrence_count
WITH w, p, c, decision, head(pointers) AS pointer, docs
DELETE pointer
CREATE (r:Release { ... })
CREATE (r)-[:FROM_PLAN]->(p)
CREATE (w)-[:CURRENT_RELEASE]->(r)
SET p.status = 'ISSUED',
    c.status = 'ISSUED',
    decision.status = $decision_status,
    w.context_revision = w.context_revision + 1
WITH w, r, docs
UNWIND docs AS included
CREATE (r)-[:INCLUDES_DOCUMENT]->(included)
WITH DISTINCT w, r
UNWIND $occurrence_assertions AS entry
MATCH (target:Occurrence {id: entry[0]})
SET target.original_assertion = entry[1]
WITH DISTINCT w, r
RETURN r.id AS release_id, w.context_revision AS context_revision
```

One pointer covers the whole package; a single document pointer is never
updated on its own. More than one existing pointer refuses the write before
anything changes, and the decision status moves only through its recorded
`BASED_ON` path to a claim placed in the released scope. The files are written, fsynced, and renamed into an
immutable release directory before this runs, so a crash between the two leaves
a private orphan rather than a half-published edition. This is a local
filesystem protocol plus one guarded graph write — not a distributed
transaction, and it is not described as one.

## G. Reassigning review authority — operator capability only

```cypher
MATCH (w:Workspace {id:$workspace_id}),
      (next:Person {id:$to_person_id}),
      (decision:Decision {id:$decision_id})-[:OWNED_BY]->(team:Team),
      (team)-[old:REVIEWED_BY]->(holder:Person)
WHERE w.context_revision = $expected_revision AND next.review_capable = true
WITH w, next, collect(DISTINCT team) AS teams, collect(DISTINCT old) AS authority,
     collect(DISTINCT holder.id) AS holders
WHERE size(teams) = 1 AND size(authority) = 1
  AND head(holders) = $from_person_id
WITH w, next, head(teams) AS team, head(authority) AS stale,
     head(holders) AS previous_id
DELETE stale
CREATE (team)-[:REVIEWED_BY {assigned_by:$operator_id, source:$source, assigned_at:$at}]->(next)
SET w.context_revision = w.context_revision + 1
RETURN w.context_revision AS context_revision,
       previous_id AS previous_reviewer_id, next.id AS current_reviewer_id
```

The team is the one that owns the decision, resolved through its `OWNED_BY`
edge rather than named by the caller, and it must hold exactly one
`REVIEWED_BY` edge, to the expected person, before anything is written.

No evidence or document content changes. A previously valid approval becomes
unusable (`AUTHORITY_CHANGED`) and a fresh plan version plus fresh approval are
required, even though the candidate bytes are identical.

## H. Authoring: three guarded mutations

Every guard precedes the first write clause, and each write is keyed by a
stable ID, so a retry can never double an edge or a card.

**H1. Register a finding from the displayed comparison**

```cypher
MATCH (w:Workspace {id:$workspace_id}),
      (cmp:Comparison {id:$comparison_id}),
      (analyst:Person {id:$actor_id})
WHERE w.context_revision = $expected_revision AND analyst.demo_role = 'analyst'
OPTIONAL MATCH (bound:Claim)-[:BASED_ON]->(cmp)
OPTIONAL MATCH (clash:Claim {id:$claim_id})
WITH w, cmp, analyst, count(DISTINCT bound) AS bindings,
     count(DISTINCT clash) AS clashes
WHERE bindings = 0 AND clashes = 0
CREATE (cl:Claim {id:$claim_id, definition_version:1, title:$title,
                  approved_at:$approved_at, approval_statement:$statement,
                  approval_witness:$witness})
CREATE (cl)-[:BASED_ON]->(cmp)
CREATE (cl)-[:APPROVED_BY]->(analyst)
SET w.context_revision = w.context_revision + 1
RETURN cl.id AS claim_id, w.context_revision AS context_revision
```

**H2. Place the finding in a document and update its block inventory**

```cypher
MATCH (w:Workspace {id:$workspace_id}),
      (doc:Document {id:$document_id}),
      (cl:Claim {id:$claim_id})-[binding:BASED_ON]->(:Comparison)
WHERE w.context_revision = $expected_revision
  AND doc.source_revision = $expected_source_revision
  AND doc.source_sha = $expected_source_sha
OPTIONAL MATCH (placed:Occurrence)-[:OF_CLAIM]->(cl), (placed)-[:IN_DOCUMENT]->(doc)
OPTIONAL MATCH (clash:Occurrence {id:$occurrence_id})
WITH w, doc, cl, count(DISTINCT binding) AS bindings,
     count(DISTINCT placed) AS here, count(DISTINCT clash) AS clashes
WHERE bindings = 1 AND here = 0 AND clashes = 0
CREATE (occ:Occurrence {id:$occurrence_id, card_style:$card_style,
                        block_id:$block_id, original_assertion:'',
                        registered_by:$actor_id, registered_at:$registered_at})
CREATE (occ)-[:OF_CLAIM]->(cl)
CREATE (occ)-[:IN_DOCUMENT]->(doc)
SET doc.source_blocks = $source_blocks,
    doc.source_sha = $source_sha,
    doc.source_revision = doc.source_revision + 1,
    w.context_revision = w.context_revision + 1
RETURN occ.id AS occurrence_id, doc.source_revision AS source_revision,
       w.context_revision AS context_revision
```

The style is checked before the write: it must be the layout's approved style
(`DOLLARS` for the operations report, `CENTS` for the memo).

**H3. Record the decision basis**

```cypher
MATCH (w:Workspace {id:$workspace_id}),
      (decision:Decision {id:$decision_id}),
      (cl:Claim {id:$claim_id})-[:BASED_ON]->(:Comparison),
      (occ:Occurrence)-[:OF_CLAIM]->(cl),
      (occ)-[:IN_DOCUMENT]->(:Document {id:$decision_document_id})
WHERE w.context_revision = $expected_revision
OPTIONAL MATCH (decision)-[existing:BASED_ON]->(:Claim)
WITH w, decision, cl, count(DISTINCT existing) AS bases
WHERE bases = 0
CREATE (decision)-[:BASED_ON {recorded_by:$actor_id, recorded_at:$recorded_at,
                              statement:$statement}]->(cl)
SET w.context_revision = w.context_revision + 1
RETURN decision.id AS decision_id, cl.id AS claim_id,
       w.context_revision AS context_revision
```

After authoring, the correction case's traversal (query B) reaches the authored
claim and both occurrences, and must equal the inventory (query C). The decision
is read by id (query D); the release changes its status only through its
recorded basis path (query F). No document list is supplied anywhere.

## Running them yourself

```bash
docker exec -it resultripple-falkordb-1 redis-cli GRAPH.QUERY resultripple "MATCH (b:Batch)-[:ASSIGNED_TO]->(l:Lane) RETURN l.name, count(b), sum(b.cost_cents)"
```
