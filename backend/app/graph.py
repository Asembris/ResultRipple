"""The only module that talks to FalkorDB.

Every query here is fixed and parameterized. No caller -- human, HTTP client, or
model -- supplies Cypher, labels, property names, or a graph name.

FalkorDB is authoritative for current memberships, approved evidence bindings,
registered occurrences, document ownership, decision basis, review authority,
and publication state. Reads return relationship identities wherever node IDs
alone would conceal a duplicate edge, so the engine can fail closed.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Any

from falkordb import FalkorDB
from redis.exceptions import RedisError

from .config import Settings
from .models import GraphStatus

# A trivial read that still exercises the module: parse, plan, execute, return.
# FalkorDB 6.0.2 compatibility, both reproduced against the pinned image:
#  1. A non-optional relationship MATCH placed after a WHERE-filtered MATCH
#     silently yields no rows. Guard patterns are therefore comma-joined into a
#     single MATCH with one trailing WHERE.
#  2. Its compact reply encoder panics (and drops the
#     connection) when one RETURN mixes an aggregation with a NULL column across
#     five or more columns, so aggregating queries coalesce every nullable
#     projection. See docs/graph-model.md.
_PROBE_QUERY = "RETURN $probe AS probe"
_PROBE_VALUE = "resultripple"

# One pooled FalkorDB handle per endpoint, shared by every GraphClient instance.
_CONNECTIONS: dict[tuple[str, int, float], FalkorDB] = {}
_CONNECTION_LOCK = threading.Lock()


class GraphUnavailable(RuntimeError):
    """Raised when authoritative context cannot be reached or read.

    With FalkorDB unavailable, new impact, review, and release operations stop.
    """

    def __init__(self, code: str, detail: str) -> None:
        super().__init__(detail)
        self.code = code
        self.detail = detail


class GuardFailed(RuntimeError):
    """A guarded mutation matched zero rows: its preconditions did not hold.

    A zero-row guarded query is never a commit receipt.
    """

    def __init__(self, code: str, detail: str) -> None:
        super().__init__(detail)
        self.code = code
        self.detail = detail


@dataclass(frozen=True)
class GraphClient:
    """Thin wrapper over the official FalkorDB client."""

    settings: Settings

    @property
    def endpoint(self) -> str:
        return f"{self.settings.falkordb_host}:{self.settings.falkordb_port}"

    @property
    def graph_name(self) -> str:
        return self.settings.falkordb_graph

    def _connect(self) -> FalkorDB:
        """One pooled client per endpoint.

        A fresh TCP connection per query exhausts the server; the underlying
        redis client already pools, so the handle is cached and shared.
        """
        key = (
            self.settings.falkordb_host,
            self.settings.falkordb_port,
            self.settings.falkordb_timeout_seconds,
        )
        with _CONNECTION_LOCK:
            client = _CONNECTIONS.get(key)
            if client is None:
                client = FalkorDB(
                    host=key[0],
                    port=key[1],
                    socket_timeout=key[2],
                    socket_connect_timeout=key[2],
                )
                _CONNECTIONS[key] = client
            return client

    def _reconnect(self) -> FalkorDB:
        key = (
            self.settings.falkordb_host,
            self.settings.falkordb_port,
            self.settings.falkordb_timeout_seconds,
        )
        with _CONNECTION_LOCK:
            _CONNECTIONS.pop(key, None)
        return self._connect()

    # -- raw access -----------------------------------------------------------

    def run(self, query: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        """Execute one fixed query and return rows as dicts keyed by alias."""
        try:
            result = self._connect().select_graph(self.graph_name).query(query, params or {})
        except (ConnectionError, TimeoutError) as exc:
            # One retry on a dropped pooled socket, then fail closed.
            try:
                result = self._reconnect().select_graph(self.graph_name).query(
                    query, params or {}
                )
            except Exception as retry_exc:
                raise GraphUnavailable(
                    "GRAPH_UNREACHABLE", f"{type(retry_exc).__name__}: {retry_exc}"
                ) from exc
        except RedisError as exc:
            raise GraphUnavailable("GRAPH_QUERY_FAILED", f"{type(exc).__name__}: {exc}") from exc
        except Exception as exc:  # the client wraps some driver errors itself
            raise GraphUnavailable("GRAPH_QUERY_FAILED", f"{type(exc).__name__}: {exc}") from exc
        header = [str(column[1]) for column in result.header]
        return [dict(zip(header, row, strict=True)) for row in result.result_set]

    def run_one(self, query: str, params: dict[str, Any] | None = None) -> dict[str, Any] | None:
        rows = self.run(query, params)
        return rows[0] if rows else None

    def probe(self) -> GraphStatus:
        """Run one real query against the configured graph.

        Never raises: readiness reports a typed failure instead, so the frontend
        can show why graph-backed work is unavailable.
        """
        started = time.perf_counter()
        try:
            db = self._connect()
            server_version = str(db.connection.info("server").get("redis_version", ""))
            result = db.select_graph(self.graph_name).query(_PROBE_QUERY, {"probe": _PROBE_VALUE})
        except RedisError as exc:
            return self._failure("GRAPH_UNREACHABLE", exc)
        except Exception as exc:
            return self._failure("GRAPH_QUERY_FAILED", exc)

        if not result.result_set or result.result_set[0][0] != _PROBE_VALUE:
            return GraphStatus(
                connected=False,
                graph=self.graph_name,
                endpoint=self.endpoint,
                error_code="GRAPH_QUERY_FAILED",
                error_detail="probe query returned an unexpected result set",
            )

        return GraphStatus(
            connected=True,
            graph=self.graph_name,
            endpoint=self.endpoint,
            latency_ms=round((time.perf_counter() - started) * 1000, 2),
            server_version=server_version or None,
        )

    def _failure(self, code: str, exc: Exception) -> GraphStatus:
        return GraphStatus(
            connected=False,
            graph=self.graph_name,
            endpoint=self.endpoint,
            error_code=code,  # type: ignore[arg-type]
            error_detail=f"{type(exc).__name__}: {exc}".strip(),
        )

    # -- workspace ------------------------------------------------------------

    def workspace(self, workspace_id: str) -> dict[str, Any]:
        row = self.run_one(
            """
            MATCH (w:Workspace {id:$workspace_id})
            OPTIONAL MATCH (w)-[pointer:CURRENT_RELEASE]->(rel:Release)
            RETURN w.id AS workspace_id, w.context_revision AS context_revision,
                   w.demo AS demo, coalesce(rel.id, '') AS current_release_id,
                   count(pointer) AS pointer_count
            """,
            {"workspace_id": workspace_id},
        )
        if row is None:
            raise GraphUnavailable("WORKSPACE_MISSING", f"workspace {workspace_id} not found")
        return row

    # -- evidence -------------------------------------------------------------

    def effective_evidence(self, dataset_id: str) -> list[dict[str, Any]]:
        """Every imported batch with its effective lane assignment.

        No DISTINCT: a duplicate assignment edge must stay visible so the engine
        can hold rather than silently average over it.
        """
        return self.run(
            """
            MATCH (ds:Dataset {id:$dataset_id})-[membership:HAS_BATCH]->(b:Batch)
            OPTIONAL MATCH (b)-[assignment:ASSIGNED_TO]->(lane:Lane)
            RETURN b.id AS batch_id, b.cost_cents AS cost_cents,
                   lane.id AS lane_id, ds.raw_sha AS raw_sha,
                   ds.expected_batch_count AS expected_batch_count,
                   ID(membership) AS membership_edge_id,
                   ID(assignment) AS assignment_edge_id
            ORDER BY batch_id, lane_id
            """,
            {"dataset_id": dataset_id},
        )

    def comparison(self, comparison_id: str) -> list[dict[str, Any]]:
        """Comparison definition with its source, both sides, and metric owner."""
        return self.run(
            """
            MATCH (cmp:Comparison {id:$comparison_id})
            OPTIONAL MATCH (cmp)-[source:USES_DATASET]->(ds:Dataset)
            OPTIONAL MATCH (cmp)-[left:LEFT_SIDE]->(leftLane:Lane)
            OPTIONAL MATCH (cmp)-[right:RIGHT_SIDE]->(rightLane:Lane)
            OPTIONAL MATCH (cmp)-[metric:OWNED_BY]->(owner:Person)
            RETURN cmp.id AS comparison_id, cmp.metric_key AS metric_key,
                   cmp.min_n AS min_n, cmp.display_precision AS display_precision,
                   ds.id AS dataset_id, leftLane.id AS left_lane_id,
                   leftLane.name AS left_lane_name, rightLane.id AS right_lane_id,
                   rightLane.name AS right_lane_name, owner.id AS owner_id,
                   owner.display_name AS owner_name,
                   ID(source) AS source_edge_id, ID(left) AS left_edge_id,
                   ID(right) AS right_edge_id, ID(metric) AS metric_edge_id
            """,
            {"comparison_id": comparison_id},
        )

    # -- registered publication scope ----------------------------------------

    def package_inventory(self) -> list[dict[str, Any]]:
        """Every registered card in the workspace package.

        Rooted at Document so an occurrence whose claim binding is missing stays
        visible: a broken path must not make registered work disappear.
        """
        return self.run(
            """
            MATCH (doc:Document)
            OPTIONAL MATCH (occ:Occurrence)-[location:IN_DOCUMENT]->(doc)
            OPTIONAL MATCH (occ)-[instance:OF_CLAIM]->(cl:Claim)
            OPTIONAL MATCH (cl)-[binding:BASED_ON]->(cmp:Comparison)
            OPTIONAL MATCH (doc)-[ownership:OWNED_BY]->(owner:Person)
            RETURN doc.id AS document_id, doc.title AS document_title,
                   doc.template AS document_template,
                   doc.source_blocks AS source_blocks,
                   doc.source_revision AS source_revision,
                   doc.source_sha AS source_sha,
                   owner.id AS owner_id, owner.display_name AS owner_name,
                   occ.id AS occurrence_id, occ.card_style AS card_style,
                   occ.block_id AS block_id, occ.original_assertion AS original_assertion,
                   cl.id AS claim_id, cl.definition_version AS claim_definition_version,
                   cmp.id AS comparison_id,
                   ID(location) AS location_edge_id, ID(instance) AS instance_edge_id,
                   ID(binding) AS binding_edge_id, ID(ownership) AS ownership_edge_id
            ORDER BY document_id, occurrence_id
            """
        )

    def impacted_occurrences(self, case_id: str) -> list[dict[str, Any]]:
        """Real impact traversal from the affected lanes of the case.

        Necessary but never sufficient: package_inventory runs alongside it so a
        missing edge cannot shrink the scope.
        """
        return self.run(
            """
            MATCH (ev:CorrectionCase {id:$case_id})-[:AFFECTS_LANE]->(lane:Lane),
                  (cmp:Comparison)-[:LEFT_SIDE|RIGHT_SIDE]->(lane),
                  (cl:Claim)-[:BASED_ON]->(cmp),
                  (occ:Occurrence)-[:OF_CLAIM]->(cl),
                  (occ)-[:IN_DOCUMENT]->(doc:Document)
            RETURN DISTINCT cmp.id AS comparison_id, cl.id AS claim_id,
                   occ.id AS occurrence_id, doc.id AS document_id
            ORDER BY document_id, occurrence_id
            """,
            {"case_id": case_id},
        )

    # -- decision and authority ----------------------------------------------

    def decision_authority(self, decision_id: str) -> list[dict[str, Any]]:
        """The decision, its recorded basis, owning team, and current reviewer.

        Edge identities are returned so zero or several authority paths stay
        distinguishable from exactly one.
        """
        return self.run(
            """
            MATCH (decision:Decision {id:$decision_id})
            OPTIONAL MATCH (decision)-[basis:BASED_ON]->(cl:Claim)
            OPTIONAL MATCH (decision)-[ownership:OWNED_BY]->(team:Team)
            OPTIONAL MATCH (team)-[authority:REVIEWED_BY]->(reviewer:Person)
            RETURN decision.id AS decision_id, decision.status AS decision_status,
                   decision.title AS decision_title, cl.id AS basis_claim_id,
                   team.id AS team_id, team.name AS team_name,
                   reviewer.id AS reviewer_id, reviewer.display_name AS reviewer_name,
                   ID(basis) AS basis_edge_id, ID(ownership) AS ownership_edge_id,
                   ID(authority) AS authority_edge_id
            """,
            {"decision_id": decision_id},
        )

    def person(self, person_id: str) -> dict[str, Any] | None:
        return self.run_one(
            """
            MATCH (p:Person {id:$person_id})
            RETURN p.id AS person_id, p.display_name AS display_name,
                   p.demo_role AS demo_role, p.review_capable AS review_capable
            """,
            {"person_id": person_id},
        )

    def people(self) -> list[dict[str, Any]]:
        return self.run(
            """
            MATCH (p:Person)
            RETURN p.id AS person_id, p.display_name AS display_name,
                   p.demo_role AS demo_role, p.review_capable AS review_capable
            ORDER BY person_id
            """
        )

    # -- correction cases -----------------------------------------------------

    def case(self, case_id: str) -> dict[str, Any] | None:
        row = self.run_one(
            """
            MATCH (c:CorrectionCase {id:$case_id})
            RETURN c.id AS case_id, c.status AS status, c.source_note AS source_note,
                   c.source_note_sha AS source_note_sha, c.source_ref AS source_ref,
                   c.from_lane_id AS from_lane_id, c.to_lane_id AS to_lane_id,
                   c.request_text AS request_text, c.decision_id AS decision_id,
                   c.comparison_id AS comparison_id, c.applied_by AS applied_by,
                   c.applied_at AS applied_at
            """,
            {"case_id": case_id},
        )
        if row is None:
            return None
        row["changed_batch_ids"] = [
            r["batch_id"]
            for r in self.run(
                """
                MATCH (c:CorrectionCase {id:$case_id})-[:CHANGES_BATCH]->(b:Batch)
                RETURN b.id AS batch_id ORDER BY batch_id
                """,
                {"case_id": case_id},
            )
        ]
        row["affected_lanes"] = self.run(
            """
            MATCH (c:CorrectionCase {id:$case_id})-[a:AFFECTS_LANE]->(lane:Lane)
            RETURN lane.id AS lane_id, a.role AS role ORDER BY role
            """,
            {"case_id": case_id},
        )
        return row

    def cases(self) -> list[dict[str, Any]]:
        return self.run(
            """
            MATCH (c:CorrectionCase)
            RETURN c.id AS case_id, c.status AS status, c.source_ref AS source_ref
            ORDER BY case_id
            """
        )

    def apply_correction(
        self,
        *,
        workspace_id: str,
        case_id: str,
        batch_ids: list[str],
        from_lane_id: str,
        to_lane_id: str,
        expected_revision: int,
        actor_id: str,
        applied_at: str,
    ) -> dict[str, Any]:
        """One guarded mutation replaces exactly the requested memberships.

        All cardinality and state guards precede the first write clause, so
        matching two of three requested batches is not a successful correction.
        """
        row = self.run_one(
            """
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
                c.status = 'CORRECTION_APPLIED',
                c.applied_by = $actor_id,
                c.applied_at = $applied_at
            RETURN w.context_revision AS context_revision,
                   size(moved) AS applied_edge_count
            """,
            {
                "workspace_id": workspace_id,
                "case_id": case_id,
                "batch_ids": sorted(set(batch_ids)),
                "from_lane_id": from_lane_id,
                "to_lane_id": to_lane_id,
                "expected_revision": expected_revision,
                "expected_count": len(set(batch_ids)),
                "actor_id": actor_id,
                "applied_at": applied_at,
            },
        )
        if row is None:
            raise GuardFailed(
                "CORRECTION_GUARD_FAILED",
                "expected revision, case state, or the exact batch set did not hold",
            )
        return row

    # -- review plans ---------------------------------------------------------

    def plan(self, plan_id: str) -> dict[str, Any] | None:
        row = self.run_one(
            """
            MATCH (p:ReviewPlan {id:$plan_id})
            OPTIONAL MATCH (p)-[:FOR_CASE]->(c:CorrectionCase)
            OPTIONAL MATCH (p)-[:APPROVED_BY]->(approver:Person)
            OPTIONAL MATCH (p)-[:ASSIGNED_TO_REVIEWER]->(reviewer:Person)
            RETURN p.id AS plan_id, p.version AS version, p.status AS status,
                   p.raw_request AS raw_request, p.goal AS goal,
                   p.alternative_flag AS alternative_flag,
                   p.disposition AS disposition, p.note AS note,
                   p.content_hash AS content_hash,
                   p.execution_fingerprint AS execution_fingerprint,
                   p.candidates AS candidates, p.scope AS scope,
                   p.context_revision AS context_revision,
                   p.prior_release_id AS prior_release_id,
                   p.staged_at AS staged_at, p.approved_at AS approved_at,
                   p.acknowledged_alternative AS acknowledged_alternative,
                   p.invalidation_reason AS invalidation_reason,
                   p.superseded_by AS superseded_by,
                   p.idempotency_key AS idempotency_key,
                   c.id AS case_id, approver.id AS approved_by,
                   reviewer.id AS assigned_reviewer_id,
                   reviewer.display_name AS assigned_reviewer_name
            """,
            {"plan_id": plan_id},
        )
        if row is None:
            return None
        row["covered_occurrence_ids"] = [
            r["occurrence_id"]
            for r in self.run(
                """
                MATCH (p:ReviewPlan {id:$plan_id})-[:COVERS]->(occ:Occurrence)
                RETURN occ.id AS occurrence_id ORDER BY occurrence_id
                """,
                {"plan_id": plan_id},
            )
        ]
        return row

    def plans_for_case(self, case_id: str) -> list[dict[str, Any]]:
        return self.run(
            """
            MATCH (p:ReviewPlan)-[:FOR_CASE]->(c:CorrectionCase {id:$case_id})
            OPTIONAL MATCH (p)-[:ASSIGNED_TO_REVIEWER]->(reviewer:Person)
            RETURN p.id AS plan_id, p.version AS version, p.status AS status,
                   p.content_hash AS content_hash,
                   p.execution_fingerprint AS execution_fingerprint,
                   p.invalidation_reason AS invalidation_reason,
                   p.approved_by AS approved_by,
                   reviewer.id AS assigned_reviewer_id
            ORDER BY version
            """,
            {"case_id": case_id},
        )

    def plan_by_idempotency_key(self, case_id: str, key: str) -> dict[str, Any] | None:
        row = self.run_one(
            """
            MATCH (p:ReviewPlan {idempotency_key:$key})-[:FOR_CASE]->(:CorrectionCase {id:$case_id})
            RETURN p.id AS plan_id ORDER BY p.version DESC LIMIT 1
            """,
            {"case_id": case_id, "key": key},
        )
        return self.plan(row["plan_id"]) if row else None

    def create_plan(
        self,
        *,
        case_id: str,
        plan: dict[str, Any],
        occurrence_ids: list[str],
        reviewer_id: str,
        supersedes_plan_id: str | None = None,
        supersede_reason: str = "SUPERSEDED",
    ) -> dict[str, Any]:
        """Persist one review plan version and assign it to the current reviewer.

        Staging does not touch the workspace context revision: planning must not
        invalidate itself.
        """
        row = self.run_one(
            """
            MATCH (c:CorrectionCase {id:$case_id}), (reviewer:Person {id:$reviewer_id})
            CREATE (p:ReviewPlan {
                id:$plan_id, version:$version, status:'AWAITING_REVIEW',
                raw_request:$raw_request, goal:$goal,
                alternative_flag:$alternative_flag, disposition:$disposition,
                note:$note, content_hash:$content_hash,
                execution_fingerprint:$execution_fingerprint,
                candidates:$candidates, scope:$scope,
                context_revision:$context_revision,
                prior_release_id:$prior_release_id, staged_at:$staged_at,
                idempotency_key:$idempotency_key, staged_by:$staged_by
            })
            CREATE (p)-[:FOR_CASE]->(c)
            CREATE (p)-[:ASSIGNED_TO_REVIEWER]->(reviewer)
            WITH p, c
            UNWIND $occurrence_ids AS occurrence_id
            MATCH (occ:Occurrence {id:occurrence_id})
            CREATE (p)-[:COVERS]->(occ)
            WITH DISTINCT p, c, count(occ) AS covered
            WHERE covered = $expected_scope_size
            SET c.status = 'AWAITING_REVIEW'
            RETURN p.id AS plan_id
            """,
            {
                "case_id": case_id,
                "reviewer_id": reviewer_id,
                "occurrence_ids": sorted(occurrence_ids),
                "expected_scope_size": len(set(occurrence_ids)),
                **plan,
            },
        )
        if row is None:
            raise GuardFailed(
                "PLAN_WRITE_FAILED",
                "case, reviewer, or the complete registered scope could not be resolved",
            )
        if supersedes_plan_id:
            self.run(
                """
                MATCH (old:ReviewPlan {id:$old_id})
                SET old.status = 'SUPERSEDED',
                    old.superseded_by = $new_id,
                    old.invalidation_reason = $reason
                """,
                {
                    "old_id": supersedes_plan_id,
                    "new_id": plan["plan_id"],
                    "reason": supersede_reason,
                },
            )
        return row

    def approve_plan(
        self,
        *,
        plan_id: str,
        version: int,
        fingerprint: str,
        reviewer_id: str,
        approved_at: str,
        acknowledged_alternative: bool,
    ) -> dict[str, Any]:
        """Record approval of one exact plan version and execution fingerprint."""
        row = self.run_one(
            """
            MATCH (p:ReviewPlan {id:$plan_id})-[:ASSIGNED_TO_REVIEWER]->(reviewer:Person {id:$reviewer_id})
            WHERE p.status = 'AWAITING_REVIEW' AND p.version = $version
              AND p.execution_fingerprint = $fingerprint
            SET p.status = 'APPROVED', p.approved_at = $approved_at,
                p.approved_by = $reviewer_id,
                p.acknowledged_alternative = $acknowledged_alternative
            CREATE (p)-[:APPROVED_BY]->(reviewer)
            WITH p
            MATCH (p)-[:FOR_CASE]->(c:CorrectionCase)
            SET c.status = 'APPROVED'
            RETURN p.id AS plan_id, p.version AS version
            """,
            {
                "plan_id": plan_id,
                "version": version,
                "fingerprint": fingerprint,
                "reviewer_id": reviewer_id,
                "approved_at": approved_at,
                "acknowledged_alternative": acknowledged_alternative,
            },
        )
        if row is None:
            raise GuardFailed(
                "APPROVAL_GUARD_FAILED",
                "plan state, version, fingerprint, or reviewer assignment did not hold",
            )
        return row

    def reject_plan(
        self, *, plan_id: str, reviewer_id: str, reason: str, at: str
    ) -> dict[str, Any]:
        row = self.run_one(
            """
            MATCH (p:ReviewPlan {id:$plan_id})-[:ASSIGNED_TO_REVIEWER]->(:Person {id:$reviewer_id})
            WHERE p.status = 'AWAITING_REVIEW'
            SET p.status = 'REJECTED', p.invalidation_reason = $reason, p.rejected_at = $at
            WITH p
            MATCH (p)-[:FOR_CASE]->(c:CorrectionCase)
            SET c.status = 'NEEDS_CHANGES'
            RETURN p.id AS plan_id
            """,
            {"plan_id": plan_id, "reviewer_id": reviewer_id, "reason": reason, "at": at},
        )
        if row is None:
            raise GuardFailed("REJECT_GUARD_FAILED", "plan is not awaiting this reviewer")
        return row

    def mark_plan_stale(self, *, plan_id: str, reason: str) -> None:
        """Keep a previously valid approval as invalid history, never as permission."""
        self.run(
            """
            MATCH (p:ReviewPlan {id:$plan_id})
            WHERE p.status IN ['APPROVED', 'AWAITING_REVIEW']
            SET p.status = 'STALE_AUTHORITY', p.invalidation_reason = $reason
            """,
            {"plan_id": plan_id, "reason": reason},
        )

    # -- releases -------------------------------------------------------------

    def release(self, release_id: str) -> dict[str, Any] | None:
        row = self.run_one(
            """
            MATCH (r:Release {id:$release_id})
            OPTIONAL MATCH (r)-[:FROM_PLAN]->(p:ReviewPlan)
            OPTIONAL MATCH (w:Workspace)-[current:CURRENT_RELEASE]->(r)
            RETURN r.id AS release_id, r.sequence AS sequence, r.issued_at AS issued_at,
                   r.artifacts AS artifacts, r.receipt AS receipt,
                   r.occurrence_snapshots AS occurrence_snapshots,
                   r.operation_id AS operation_id, coalesce(p.id, '') AS plan_id,
                   coalesce(p.version, -1) AS plan_version,
                   count(current) > 0 AS is_current
            """,
            {"release_id": release_id},
        )
        if row is None:
            return None
        row["document_ids"] = [
            r["document_id"]
            for r in self.run(
                """
                MATCH (r:Release {id:$release_id})-[:INCLUDES_DOCUMENT]->(doc:Document)
                RETURN doc.id AS document_id ORDER BY document_id
                """,
                {"release_id": release_id},
            )
        ]
        return row

    def release_for_plan(self, plan_id: str) -> dict[str, Any] | None:
        row = self.run_one(
            "MATCH (r:Release)-[:FROM_PLAN]->(:ReviewPlan {id:$plan_id}) RETURN r.id AS release_id",
            {"plan_id": plan_id},
        )
        return self.release(row["release_id"]) if row else None

    def release_by_operation(self, operation_id: str) -> dict[str, Any] | None:
        row = self.run_one(
            "MATCH (r:Release {operation_id:$operation_id}) RETURN r.id AS release_id",
            {"operation_id": operation_id},
        )
        return self.release(row["release_id"]) if row else None

    def release_history(self) -> list[dict[str, Any]]:
        return self.run(
            """
            MATCH (r:Release)
            OPTIONAL MATCH (w:Workspace)-[current:CURRENT_RELEASE]->(r)
            RETURN r.id AS release_id, r.sequence AS sequence, r.issued_at AS issued_at,
                   r.artifacts AS artifacts, count(current) > 0 AS is_current
            ORDER BY sequence
            """
        )

    def commit_release(
        self,
        *,
        workspace_id: str,
        plan_id: str,
        plan_version: int,
        fingerprint: str,
        expected_revision: int,
        expected_prior_release_id: str,
        decision_id: str,
        decision_status: str,
        release: dict[str, Any],
        document_ids: list[str],
        occurrence_assertions: list[list[str]],
    ) -> dict[str, Any]:
        """One guarded write publishes the whole package and moves one pointer.

        The authoritative guards -- expected context revision, plan approval at
        this exact version and fingerprint, and the expected prior release --
        all precede the first write clause. The document set comes from the same
        locked authoritative read that produced the plan scope; the trailing
        count check is a consistency assertion, not a rollback.

        It never updates a single document pointer: the current release is one
        node covering both editions, or nothing is committed at all.
        """
        row = self.run_one(
            """
            MATCH (w:Workspace {id:$workspace_id}),
                  (p:ReviewPlan {id:$plan_id}),
                  (decision:Decision {id:$decision_id})
            WHERE w.context_revision = $expected_revision
              AND p.status = 'APPROVED' AND p.version = $plan_version
              AND p.execution_fingerprint = $fingerprint
            OPTIONAL MATCH (w)-[pointer:CURRENT_RELEASE]->(prior:Release)
            WITH w, p, decision, pointer, coalesce(prior.id, '') AS prior_id
            WHERE prior_id = $expected_prior_release_id
            DELETE pointer
            CREATE (r:Release {
                id:$release_id, sequence:$sequence, issued_at:$issued_at,
                artifacts:$artifacts, receipt:$receipt,
                occurrence_snapshots:$occurrence_snapshots,
                operation_id:$operation_id
            })
            CREATE (r)-[:FROM_PLAN]->(p)
            CREATE (w)-[:CURRENT_RELEASE]->(r)
            SET p.status = 'ISSUED',
                decision.status = $decision_status,
                w.context_revision = w.context_revision + 1
            WITH w, r, p
            UNWIND $document_ids AS document_id
            MATCH (doc:Document {id:document_id})
            CREATE (r)-[:INCLUDES_DOCUMENT]->(doc)
            WITH DISTINCT w, r, p, count(doc) AS included
            WHERE included = $expected_document_count
            MATCH (p)-[:FOR_CASE]->(c:CorrectionCase)
            SET c.status = 'ISSUED'
            WITH w, r, p
            UNWIND $occurrence_assertions AS entry
            MATCH (occ:Occurrence {id: entry[0]})
            SET occ.original_assertion = entry[1]
            WITH DISTINCT w, r
            RETURN r.id AS release_id, w.context_revision AS context_revision
            """,
            {
                "workspace_id": workspace_id,
                "plan_id": plan_id,
                "plan_version": plan_version,
                "fingerprint": fingerprint,
                "expected_revision": expected_revision,
                "expected_prior_release_id": expected_prior_release_id,
                "decision_id": decision_id,
                "decision_status": decision_status,
                "document_ids": sorted(document_ids),
                "expected_document_count": len(set(document_ids)),
                "occurrence_assertions": occurrence_assertions,
                **release,
            },
        )
        if row is None:
            raise GuardFailed(
                "RELEASE_GUARD_FAILED",
                "context revision, plan approval, or prior release pointer did not hold",
            )
        return row

    # -- guarded demo operator control ---------------------------------------

    def reassign_reviewer(
        self,
        *,
        workspace_id: str,
        team_id: str,
        from_person_id: str,
        to_person_id: str,
        expected_revision: int,
        operator_id: str,
        source: str,
        at: str,
    ) -> dict[str, Any]:
        """Replace exactly one REVIEWED_BY edge. Operator capability only."""
        row = self.run_one(
            """
            MATCH (w:Workspace {id:$workspace_id}),
                  (next:Person {id:$to_person_id}),
                  (team:Team {id:$team_id})-[old:REVIEWED_BY]->(previous:Person {id:$from_person_id})
            WHERE w.context_revision = $expected_revision AND next.review_capable = true
            WITH w, team, previous, next, collect(old) AS authority
            WHERE size(authority) = 1
            UNWIND authority AS stale
            DELETE stale
            WITH DISTINCT w, team, previous, next
            CREATE (team)-[:REVIEWED_BY {assigned_by:$operator_id, source:$source, assigned_at:$at}]->(next)
            SET w.context_revision = w.context_revision + 1
            RETURN w.context_revision AS context_revision,
                   previous.id AS previous_reviewer_id, next.id AS current_reviewer_id
            """,
            {
                "workspace_id": workspace_id,
                "team_id": team_id,
                "from_person_id": from_person_id,
                "to_person_id": to_person_id,
                "expected_revision": expected_revision,
                "operator_id": operator_id,
                "source": source,
                "at": at,
            },
        )
        if row is None:
            raise GuardFailed(
                "REASSIGN_GUARD_FAILED",
                "expected revision, current authority edge, or target reviewer did not hold",
            )
        return row


# One API process, one in-memory mutation lock. Scaling to several workers would
# need real coordination; do not enable it silently.
WORKSPACE_LOCK = threading.Lock()
