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
