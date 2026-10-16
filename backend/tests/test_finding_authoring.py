"""Authoring on a fresh workspace, through to a corrected release.

Nothing here is seeded beyond primitive facts: the claim, both occurrences and
the decision basis are created through the authoring endpoints, the first
edition is issued through the real staging, approval and release path, and the
correction must then find the authored work by graph traversal alone.
"""

from __future__ import annotations

from app import domain

from . import helpers

OLD_DOLLARS = "South costs $0.40 less per parcel than North."
OLD_CENTS = "South is 40 cents cheaper per parcel than North."
NEW_DOLLARS = "South costs $0.40 more per parcel than North."
NEW_CENTS = "South is 40 cents more expensive per parcel than North."


def _edition(http, release_id: str, document_id: str) -> dict:
    response = http.get(f"/editions/{release_id}/{document_id}")
    assert response.status_code == 200, response.text
    return helpers.parse_edition(response.text)


def _issue(reviewer, plan: dict, *, acknowledged: bool, operation_id: str) -> dict:
    approved = helpers.approve(reviewer, plan, acknowledged=acknowledged)
    assert approved.status_code == 200, approved.text
    issued = helpers.release(reviewer, plan["plan_id"], operation_id)
    assert issued.status_code == 200, issued.text
    return issued.json()["release"]


def test_fresh_workspace_starts_with_nothing_registered(fresh, fresh_ari):
    state = helpers.workspace(fresh_ari)

    assert helpers.authored_counts(fresh["graph"]) == {
        "claims": 0,
        "occurrences": 0,
        "documents": 0,
        "locations": 0,
        "instances": 0,
        "bindings": 0,
        "bases": 0,
    }
    assert state["hold"] is None
    assert state["findings"] == []
    assert state["current_release"] is None
    assert state["decision"]["basis_claim_id"] is None
    assert state["decision"]["status"] == "PROPOSED"
    assert all(not doc["occurrences"] for doc in state["scope"])
    assert all(
        block["kind"] != "finding" for doc in state["scope"] for block in doc["blocks"]
    )
    # The comparison the analyst will confirm is computed, not stored.
    comparison = state["comparison"]
    assert comparison["sentence"] == OLD_DOLLARS
    assert comparison["left"]["batch_count"] == 4
    assert comparison["right"]["batch_count"] == 7
    assert comparison["unit"] == "USD_PER_PARCEL"
    assert comparison["dataset_title"] == "Parcel handling cost, 2026 Q3 synthetic batches"
    assert {doc["approved_card_style"] for doc in state["scope"]} == {"DOLLARS", "CENTS"}
    refs = {case["source_ref"] for case in state["cases"]}
    assert refs == {"DX-2026-0914", "INITIAL-PUBLICATION"}


def test_authoring_through_correction_and_release(fresh, fresh_ari, fresh_noor):
    graph = fresh["graph"]

    # 1. Author: one finding, two placements, one explicit basis.
    authored = helpers.author_everything(fresh_ari)
    claim_id = authored["claim_id"]
    occurrence_ids = sorted(p["occurrence_id"] for p in authored["placements"])
    styles = {p["document_id"]: p["card_style"] for p in authored["placements"]}
    assert styles == {domain.DOC_OPS: "DOLLARS", domain.DOC_MEMO: "CENTS"}
    expected_counts = {
        "claims": 1,
        "occurrences": 2,
        "documents": 2,
        "locations": 2,
        "instances": 2,
        "bindings": 1,
        "bases": 1,
    }
    assert helpers.authored_counts(graph) == expected_counts

    # 2. The first edition goes through the real stage, approve and issue path.
    staged = helpers.stage_initial_publication(fresh_ari)
    assert staged.status_code == 200, staged.text
    first_plan = staged.json()
    assert first_plan["covered_occurrence_ids"] == occurrence_ids
    first = _issue(fresh_noor, first_plan, acknowledged=False, operation_id="first-edition")
    assert first["sequence"] == 1
    assert sorted(first["document_ids"]) == [domain.DOC_OPS, domain.DOC_MEMO]

    ops_v1 = _edition(fresh_ari, first["release_id"], domain.DOC_OPS)
    memo_v1 = _edition(fresh_ari, first["release_id"], domain.DOC_MEMO)
    assert [(c["data-card-style"], c["data-relation"], c["text"]) for c in ops_v1["cards"]] == [
        ("DOLLARS", "LOWER_COST", OLD_DOLLARS)
    ]
    assert [(c["data-card-style"], c["data-relation"], c["text"]) for c in memo_v1["cards"]] == [
        ("CENTS", "LOWER_COST", OLD_CENTS)
    ]
    assert all(c["data-claim-id"] == claim_id for c in ops_v1["cards"] + memo_v1["cards"])
    assert [d["data-decision-status"] for d in memo_v1["decisions"]] == ["PROPOSED"]

    # A first edition publishes the proposal as it stands; it decides nothing.
    after_first = helpers.workspace(fresh_ari)
    assert after_first["decision"]["status"] == "PROPOSED"
    assert after_first["current_release"]["release_id"] == first["release_id"]

    # 3. Correct the evidence. Impact is found by traversal from the case.
    corrected = helpers.apply_correction(fresh_ari)
    assert corrected["applied_edge_count"] == 3
    impacted = graph.impacted_occurrences(domain.CASE_ID)
    assert sorted(row["occurrence_id"] for row in impacted) == occurrence_ids
    assert {row["claim_id"] for row in impacted} == {claim_id}
    assert {row["document_id"] for row in impacted} == {domain.DOC_OPS, domain.DOC_MEMO}
    authority = graph.decision_authority(domain.DECISION_ID)
    assert {row["basis_claim_id"] for row in authority} == {claim_id}

    # 4. Stage, approve and issue the corrected package.
    plan = helpers.staged_plan(fresh_ari, key="authored-correction")
    assert plan["covered_occurrence_ids"] == occurrence_ids
    second = _issue(fresh_noor, plan, acknowledged=True, operation_id="authored-correction")
    assert second["sequence"] == 2

    ops_v2 = _edition(fresh_ari, second["release_id"], domain.DOC_OPS)
    memo_v2 = _edition(fresh_ari, second["release_id"], domain.DOC_MEMO)
    ops_card, memo_card = ops_v2["cards"], memo_v2["cards"]
    assert [
        (c["data-card-style"], c["data-relation"], c["data-magnitude-cents"], c["data-unit"])
        for c in ops_card
    ] == [("DOLLARS", "HIGHER_COST", "40", "USD_PER_PARCEL")]
    assert [
        (c["data-card-style"], c["data-relation"], c["data-magnitude-cents"], c["data-unit"])
        for c in memo_card
    ] == [("CENTS", "HIGHER_COST", "40", "CENTS_PER_PARCEL")]
    assert [c["text"] for c in ops_card] == [NEW_DOLLARS]
    assert [c["text"] for c in memo_card] == [NEW_CENTS]
    for document_id in (domain.DOC_OPS, domain.DOC_MEMO):
        body = fresh_ari.get(f"/editions/{second['release_id']}/{document_id}").text
        assert OLD_DOLLARS not in body and OLD_CENTS not in body
    assert [d["data-decision-status"] for d in memo_v2["decisions"]] == ["RETURNED_FOR_REVIEW"]

    receipt = fresh_ari.get(f"/releases/{second['release_id']}/receipt").json()
    assert receipt["verification"]["ok"] is True
    assert receipt["verification_scope"].startswith(
        "Two registered finding occurrences and one typed decision-status block checked."
    )

    final = helpers.workspace(fresh_ari)
    assert final["decision"]["status"] == "RETURNED_FOR_REVIEW"
    assert final["current_release"]["release_id"] == second["release_id"]
    # Releasing changed no authored link: still exactly 1 / 2 / 2 / 1.
    assert helpers.authored_counts(graph) == expected_counts


def test_one_occurrence_package_states_one(fresh, fresh_ari, fresh_noor):
    """The scope statement counts the package that was checked, never a constant.

    The single card sits beside the decision block and is its recorded basis:
    a legitimate one-card package, not a decision block with nothing behind it.
    """
    state = helpers.workspace(fresh_ari)
    finding = helpers.create_finding(fresh_ari, state["context_revision"]).json()
    placed = helpers.insert_linked_finding(
        fresh_ari, domain.DOC_MEMO, finding["claim_id"], "CENTS", finding["context_revision"]
    )
    assert placed.status_code == 200, placed.text
    basis = helpers.record_basis(
        fresh_ari, finding["claim_id"], placed.json()["context_revision"]
    )
    assert basis.status_code == 200, basis.text

    expected = (
        "One registered finding occurrence and one typed decision-status block checked. "
        "Editorial narrative not assessed by ResultRipple."
    )
    assert helpers.workspace(fresh_ari)["verification_scope"] == expected

    plan = helpers.stage_initial_publication(fresh_ari).json()
    assert plan["scope"] and expected in plan["scope"]
    issued = _issue(fresh_noor, plan, acknowledged=False, operation_id="one-occurrence")

    receipt = fresh_ari.get(f"/releases/{issued['release_id']}/receipt").json()
    assert receipt["verification"]["ok"] is True
    assert receipt["verification_scope"] == expected
    for document_id in (domain.DOC_OPS, domain.DOC_MEMO):
        body = fresh_ari.get(f"/editions/{issued['release_id']}/{document_id}").text
        assert expected in body
        assert "Two registered finding occurrences" not in body
