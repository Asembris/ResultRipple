"""Publication integrity: no edition may state provenance the graph does not hold.

Each test here reproduces one audited path by which a package became current
while its registered provenance contradicted what it states, or by which a
client was told a plan was issued when nobody approved it.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app import domain

from . import helpers

OTHER_COMPARISON = "cmp-x-north-pilot"
OTHER_CLAIM = "claim-x"


def _second_comparison(graph) -> None:
    """A second, well-formed comparison and claim. Simulates an upstream writer."""
    graph.run(
        """
        MATCH (ds:Dataset {id:$dataset}), (n:Lane {id:$north}), (p:Lane {id:$pilot})
        CREATE (c:Comparison {id:$cmp, metric_key:'MEAN_COST_V1', min_n:4,
                              display_precision:2})
        CREATE (c)-[:USES_DATASET]->(ds)
        CREATE (c)-[:LEFT_SIDE]->(n)
        CREATE (c)-[:RIGHT_SIDE]->(p)
        """,
        {
            "dataset": domain.DATASET_ID,
            "north": domain.LANE_NORTH,
            "pilot": domain.LANE_PILOT,
            "cmp": OTHER_COMPARISON,
        },
    )
    graph.run(
        """
        MATCH (c:Comparison {id:$cmp})
        CREATE (cl:Claim {id:$claim, definition_version:1})
        CREATE (cl)-[:BASED_ON]->(c)
        """,
        {"cmp": OTHER_COMPARISON, "claim": OTHER_CLAIM},
    )


def _nothing_new_is_current(http: TestClient, seeded) -> None:
    state = helpers.workspace(http)
    assert state["current_release"]["release_id"] == seeded["version_one"]["release_id"]
    assert len(state["releases"]) == 1


def _author_finding(ari: TestClient, document_ids: list[str]) -> str:
    """Register the finding and place it, through the API, without a basis."""
    state = helpers.workspace(ari)
    finding = helpers.create_finding(ari, state["context_revision"])
    assert finding.status_code == 200, finding.text
    claim_id = finding.json()["claim_id"]
    revision = finding.json()["context_revision"]
    styles = {doc["document_id"]: doc["approved_card_style"] for doc in state["scope"]}
    for document_id in document_ids:
        placed = helpers.insert_linked_finding(
            ari, document_id, claim_id, styles[document_id], revision
        )
        assert placed.status_code == 200, placed.text
        revision = placed.json()["context_revision"]
    return claim_id


# -- P0-1: a decision block whose basis the graph does not record ---------------


def test_a_decision_block_without_a_recorded_basis_is_never_staged(fresh, fresh_ari):
    """Audit B P0-1, variant P1: the card in one report, no basis, no card in the memo."""
    _author_finding(fresh_ari, [domain.DOC_OPS])

    refused = helpers.stage_initial_publication(fresh_ari)

    assert refused.status_code == 409, refused.text
    assert refused.json()["code"] == "MISSING_DECISION_BASIS"
    assert helpers.workspace(fresh_ari)["current_release"] is None


def test_a_basis_never_recorded_cannot_change_the_decision(fresh, fresh_ari):
    """Audit B P0-1, variant P2: the card in both reports, still no basis."""
    _author_finding(fresh_ari, [domain.DOC_OPS, domain.DOC_MEMO])

    refused = helpers.stage_initial_publication(fresh_ari)

    assert refused.status_code == 409, refused.text
    assert refused.json()["code"] == "MISSING_DECISION_BASIS"
    assert helpers.workspace(fresh_ari)["current_release"] is None


def test_a_decision_basis_on_a_claim_not_placed_beside_it_is_held(seeded, ari):
    """Audit B P0-1, injection variant: the basis names a claim the memo does not carry."""
    helpers.apply_correction(ari)
    graph = seeded["graph"]
    _second_comparison(graph)
    graph.run(
        "MATCH (:Decision {id:$decision})-[b:BASED_ON]->(:Claim) DELETE b",
        {"decision": domain.DECISION_ID},
    )
    graph.run(
        "MATCH (d:Decision {id:$decision}), (cl:Claim {id:$claim}) CREATE (d)-[:BASED_ON]->(cl)",
        {"decision": domain.DECISION_ID, "claim": OTHER_CLAIM},
    )

    refused = helpers.stage(ari, key="basis-elsewhere")

    assert refused.status_code == 409, refused.text
    assert refused.json()["code"] == "MISBOUND_PROVENANCE"
    _nothing_new_is_current(ari, seeded)


# -- P0-2: a card whose registered claim names another comparison --------------


def test_a_card_whose_claim_binds_another_comparison_is_held(seeded, ari):
    """Audit B P0-2: the memo occurrence is rebound to a claim on North versus Pilot."""
    helpers.apply_correction(ari)
    graph = seeded["graph"]
    _second_comparison(graph)
    graph.run(
        "MATCH (:Occurrence {id:$occ})-[e:OF_CLAIM]->() DELETE e", {"occ": domain.OCC_MEMO}
    )
    graph.run(
        "MATCH (o:Occurrence {id:$occ}), (cl:Claim {id:$claim}) CREATE (o)-[:OF_CLAIM]->(cl)",
        {"occ": domain.OCC_MEMO, "claim": OTHER_CLAIM},
    )

    refused = helpers.stage(ari, key="occurrence-elsewhere")

    assert refused.status_code == 409, refused.text
    assert refused.json()["code"] == "MISBOUND_PROVENANCE"
    _nothing_new_is_current(ari, seeded)


def test_a_finding_rebound_to_another_comparison_is_held(seeded, ari):
    """Audit B P0-2: the canonical claim's own binding now names North versus Pilot."""
    helpers.apply_correction(ari)
    graph = seeded["graph"]
    _second_comparison(graph)
    graph.run(
        "MATCH (:Claim {id:$claim})-[b:BASED_ON]->(:Comparison) DELETE b",
        {"claim": domain.CLAIM_ID},
    )
    graph.run(
        "MATCH (cl:Claim {id:$claim}), (c:Comparison {id:$cmp}) CREATE (cl)-[:BASED_ON]->(c)",
        {"claim": domain.CLAIM_ID, "cmp": OTHER_COMPARISON},
    )

    refused = helpers.stage(ari, key="claim-elsewhere")

    assert refused.status_code == 409, refused.text
    assert refused.json()["code"] == "MISBOUND_PROVENANCE"
    _nothing_new_is_current(ari, seeded)


# -- only the analyst or the agent principal prepares a review ----------------


def test_a_reviewer_cannot_stage_their_own_plan(seeded, ari, noor):
    """Audit B weakness 3a: preparer, approver and issuer must not be one person."""
    helpers.apply_correction(ari)

    refused = helpers.stage(
        noor,
        goal=domain.GOAL_CORRECT_FACTS,
        disposition=domain.DISPOSITION_NO_CHANGE,
        alternative_flag=False,
        key="reviewer-self-stage",
    )

    assert refused.status_code == 403, refused.text
    assert refused.json()["code"] == "NOT_AUTHORIZED"
    case = next(c for c in helpers.workspace(ari)["cases"] if c["case_id"] == domain.CASE_ID)
    assert case["plans"] == []


def test_neither_the_memo_owner_nor_the_operator_can_stage(seeded, ari, sam, operator):
    helpers.apply_correction(ari)

    for http, key in ((sam, "owner-stage"), (operator, "operator-stage")):
        refused = helpers.stage(http, key=key)
        assert refused.status_code == 403, refused.text
        assert refused.json()["code"] == "NOT_AUTHORIZED"

    case = next(c for c in helpers.workspace(ari)["cases"] if c["case_id"] == domain.CASE_ID)
    assert case["plans"] == []


# -- an operation id never reconciles across plans -----------------------------


def test_another_plans_operation_id_never_issues_an_unapproved_plan(seeded, ari, noor):
    """Audit B weakness 3c: V1's operation id on an AWAITING_REVIEW plan returned 200."""
    helpers.apply_correction(ari)
    plan = helpers.staged_plan(ari)
    version_one_operation = seeded["version_one"]["operation_id"]

    for http in (noor, ari):
        refused = helpers.release(http, plan["plan_id"], version_one_operation)
        assert refused.status_code == 409, refused.text
        assert refused.json()["code"] == "OPERATION_ID_CONFLICT"

    assert helpers.workspace(ari)["current_release"]["release_id"] == (
        seeded["version_one"]["release_id"]
    )
    assert seeded["graph"].plan(plan["plan_id"])["status"] == "AWAITING_REVIEW"


# -- the impact traversal is a gate, not a display ------------------------------


def _initial_publication_lanes(graph) -> list[dict]:
    return graph.run(
        """
        MATCH (:CorrectionCase {id:$case})-[a:AFFECTS_LANE]->(lane:Lane)
        RETURN lane.id AS lane_id, a.role AS role, a.source AS source ORDER BY role
        """,
        {"case": helpers.INITIAL_PUBLICATION_CASE_ID},
    )


EXPECTED_INITIAL_LANES = [
    {"lane_id": domain.LANE_NORTH, "role": "LEFT", "source": "initial-publication"},
    {"lane_id": domain.LANE_SOUTH, "role": "RIGHT", "source": "initial-publication"},
]


def test_the_seeded_initial_publication_affects_both_comparison_lanes(seeded):
    assert _initial_publication_lanes(seeded["graph"]) == EXPECTED_INITIAL_LANES


def test_the_fresh_initial_publication_affects_both_comparison_lanes(fresh):
    assert _initial_publication_lanes(fresh["graph"]) == EXPECTED_INITIAL_LANES


def test_a_case_whose_traversal_misses_a_registered_card_is_held(seeded, ari):
    """An empty traversal never means "no dependencies"."""
    helpers.apply_correction(ari)
    seeded["graph"].run(
        "MATCH (:CorrectionCase {id:$case})-[a:AFFECTS_LANE {role:'FROM'}]->() DELETE a",
        {"case": domain.CASE_ID},
    )

    refused = helpers.stage(ari, key="traversal-gap")

    assert refused.status_code == 409, refused.text
    assert refused.json()["code"] == "IMPACT_SCOPE_MISMATCH"
    _nothing_new_is_current(ari, seeded)


def test_a_traversal_gap_after_approval_blocks_the_release(seeded, ari, noor):
    helpers.apply_correction(ari)
    plan = helpers.staged_plan(ari)
    assert helpers.approve(noor, plan).status_code == 200
    seeded["graph"].run(
        "MATCH (:CorrectionCase {id:$case})-[a:AFFECTS_LANE {role:'FROM'}]->() DELETE a",
        {"case": domain.CASE_ID},
    )

    refused = helpers.release(noor, plan["plan_id"], "op-traversal-gap")

    assert refused.status_code == 409, refused.text
    assert refused.json()["code"] == "IMPACT_SCOPE_MISMATCH"
    _nothing_new_is_current(ari, seeded)

