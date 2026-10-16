"""The independent audit must reject bytes that the engine would have accepted.

These tests feed `verify_artifacts` the real issued files, then tamper with
them. A verifier that cannot fail is not evidence of anything.
"""

from __future__ import annotations

import json

import pytest

from fastapi.testclient import TestClient

from app import domain
from app.verify_artifacts import verify_package
from tests import helpers


def _issue(ari: TestClient, noor: TestClient) -> tuple[dict, dict]:
    helpers.apply_correction(ari)
    plan = helpers.staged_plan(ari)
    assert helpers.approve(noor, plan).status_code == 200
    issued = helpers.release(noor, plan["plan_id"])
    assert issued.status_code == 200, issued.text
    return plan, issued.json()["release"]


def _audit(seeded, plan, released, artifacts=None, expected_hashes=None):
    scope = json.loads(plan["scope"])
    return verify_package(
        csv_path=seeded["csv_path"],
        dataset_sha=scope["dataset_sha"],
        memberships=scope["memberships"],
        comparison={**scope["comparison"], "dataset_id": domain.DATASET_ID},
        documents=scope["documents"],
        occurrences=scope["occurrences"],
        decision={
            "decision_id": domain.DECISION_ID,
            "expected_status": "RETURNED_FOR_REVIEW",
            "title": scope["decision"]["title"],
            "basis_claim_id": scope["decision"]["basis_claim_id"],
        },
        artifacts=artifacts
        if artifacts is not None
        else {
            document_id: seeded["store"]
            .release_path(released["release_id"], document_id)
            .read_bytes()
            for document_id in released["document_ids"]
        },
        expected_hashes=expected_hashes,
    )


def test_the_audit_independently_confirms_both_issued_editions(seeded, ari, noor) -> None:
    plan, released = _issue(ari, noor)
    report = _audit(seeded, plan, released, expected_hashes=json.loads(plan["candidates"]))

    assert report.ok, [c.name for c in report.failures]
    # Derived from the CSV and the membership snapshot, not from the engine.
    assert report.derived["left"]["total_cents"] == 1600
    assert report.derived["left"]["count"] == 4
    assert report.derived["left"]["mean_cents"] == "400"
    assert report.derived["right"]["total_cents"] == 1760
    assert report.derived["right"]["count"] == 4
    assert report.derived["right"]["mean_cents"] == "440"
    assert report.derived["relation"] == "HIGHER_COST"
    assert report.derived["magnitude_cents"] == 40
    assert len(report.hashes) == 2


def test_the_audit_rejects_a_reversed_direction(seeded, ari, noor) -> None:
    plan, released = _issue(ari, noor)
    artifacts = _artifacts(seeded, released)
    artifacts[domain.DOC_OPS] = artifacts[domain.DOC_OPS].replace(
        b"South costs $0.40 more per parcel than North.",
        b"South costs $0.40 less per parcel than North.",
    )

    report = _audit(seeded, plan, released, artifacts=artifacts)
    assert not report.ok
    names = {check.name for check in report.failures}
    assert f"{domain.DOC_OPS}:ops-finding-cost:assertion" in names


def test_the_audit_rejects_a_changed_magnitude(seeded, ari, noor) -> None:
    plan, released = _issue(ari, noor)
    artifacts = _artifacts(seeded, released)
    artifacts[domain.DOC_MEMO] = artifacts[domain.DOC_MEMO].replace(
        b"40 cents more expensive", b"80 cents more expensive"
    )

    report = _audit(seeded, plan, released, artifacts=artifacts)
    assert not report.ok


def test_the_audit_rejects_a_contradicted_assertion_left_behind(
    seeded, ari, noor
) -> None:
    """A metadata flag must never leave the old supported statement in place."""
    plan, released = _issue(ari, noor)
    artifacts = _artifacts(seeded, released)
    artifacts[domain.DOC_MEMO] = artifacts[domain.DOC_MEMO].replace(
        b"</article>",
        b"<p>South is 40 cents cheaper per parcel than North.</p></article>",
    )

    report = _audit(seeded, plan, released, artifacts=artifacts)
    assert not report.ok
    assert any("no_lower_cost" in check.name for check in report.failures)


def test_the_audit_rejects_edited_unregistered_narrative(seeded, ari, noor) -> None:
    plan, released = _issue(ari, noor)
    artifacts = _artifacts(seeded, released)
    artifacts[domain.DOC_OPS] = artifacts[domain.DOC_OPS].replace(
        b"All figures are descriptive.", b"All figures prove the expansion case."
    )

    report = _audit(seeded, plan, released, artifacts=artifacts)
    assert not report.ok
    assert any("narrative_unchanged" in check.name for check in report.failures)


def test_the_audit_rejects_a_wrong_decision_disposition(seeded, ari, noor) -> None:
    plan, released = _issue(ari, noor)
    artifacts = _artifacts(seeded, released)
    artifacts[domain.DOC_MEMO] = artifacts[domain.DOC_MEMO].replace(
        b'data-decision-status="RETURNED_FOR_REVIEW"', b'data-decision-status="APPROVED"'
    )

    report = _audit(seeded, plan, released, artifacts=artifacts)
    assert not report.ok
    assert any("decision_status" in check.name for check in report.failures)


def test_the_audit_rejects_a_missing_second_report(seeded, ari, noor) -> None:
    plan, released = _issue(ari, noor)
    artifacts = _artifacts(seeded, released)
    del artifacts[domain.DOC_MEMO]

    report = _audit(seeded, plan, released, artifacts=artifacts)
    assert not report.ok
    assert any("all_registered_documents_issued" in c.name for c in report.failures)


def test_the_audit_rejects_bytes_that_differ_from_the_approved_hashes(
    seeded, ari, noor
) -> None:
    plan, released = _issue(ari, noor)
    artifacts = _artifacts(seeded, released)
    artifacts[domain.DOC_OPS] = artifacts[domain.DOC_OPS] + b"<!-- added later -->"

    report = _audit(
        seeded, plan, released, artifacts=artifacts, expected_hashes=json.loads(plan["candidates"])
    )
    assert not report.ok
    assert any("hash_matches_approved" in c.name for c in report.failures)


# Thirteen tampered byte sets, each caught by content alone: no approved hash is
# supplied, so only what the verifier independently derives and parses can fail.
OPS, MEMO = domain.DOC_OPS, domain.DOC_MEMO
TAMPERS = {
    "direction_in_dollars": (OPS, b"$0.40 more per parcel", b"$0.40 less per parcel"),
    "direction_attribute": (
        OPS, b'data-relation="HIGHER_COST"', b'data-relation="LOWER_COST"'
    ),
    "fake_number_in_sentence": (MEMO, b"40 cents more expensive", b"80 cents more expensive"),
    "unit_attribute": (OPS, b'data-unit="USD_PER_PARCEL"', b'data-unit="CENTS_PER_PARCEL"'),
    "unit_in_sentence": (OPS, b"South costs $0.40 more", b"South costs 40 cents more"),
    "edited_narrative": (OPS, b"All figures are descriptive.", b"All figures prove the case."),
    "stale_paraphrase_in_narrative": (
        MEMO,
        b"Operations Review team.</p>",
        b"Operations Review team. South is 40 cents cheaper per parcel than North.</p>",
    ),
    "fake_evidence_row_old_mean": (
        MEMO, b"mean 440 cents per parcel over 4 batches", b"mean 360 cents per parcel over 7 batches"
    ),
    "fake_evidence_row_count": (
        OPS, b"mean $4.40 per parcel over 4 batches", b"mean $4.40 per parcel over 11 batches"
    ),
    "appended_narrative_paragraph": (
        MEMO,
        b"Operations Review team.</p>",
        b"Operations Review team.</p><p>South remains the cheaper lane.</p>",
    ),
    "flipped_visible_decision_label": (MEMO, b"&mdash; Returned for review", b"&mdash; Proposed"),
    "edited_basis_line": (
        MEMO, b"Recorded basis: the linked finding above (", b"Recorded basis: the board vote ("
    ),
    "swapped_claim_id": (
        MEMO, b'data-claim-id="claim-south-vs-north-cost"', b'data-claim-id="claim-x"'
    ),
}


@pytest.mark.parametrize("name", sorted(TAMPERS))
def test_the_audit_catches_every_tamper_by_content_alone(seeded, ari, noor, name) -> None:
    plan, released = _issue(ari, noor)
    document_id, before, after = TAMPERS[name]
    artifacts = _artifacts(seeded, released)
    assert artifacts[document_id].count(before) == 1, f"{name}: target bytes not found once"
    artifacts[document_id] = artifacts[document_id].replace(before, after)

    report = _audit(seeded, plan, released, artifacts=artifacts)

    assert not report.ok, f"{name} passed as clean"
    assert not any("hash_matches_approved" in c.name for c in report.checks)


def _artifacts(seeded, released) -> dict[str, bytes]:
    return {
        document_id: seeded["store"]
        .release_path(released["release_id"], document_id)
        .read_bytes()
        for document_id in released["document_ids"]
    }
