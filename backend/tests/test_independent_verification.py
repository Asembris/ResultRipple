"""The independent audit must reject bytes that the engine would have accepted.

These tests feed `verify_artifacts` the real issued files, then tamper with
them. A verifier that cannot fail is not evidence of anything.
"""

from __future__ import annotations

import json

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
        comparison=scope["comparison"],
        documents=scope["documents"],
        occurrences=scope["occurrences"],
        decision={
            "decision_id": domain.DECISION_ID,
            "expected_status": "RETURNED_FOR_REVIEW",
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


def _artifacts(seeded, released) -> dict[str, bytes]:
    return {
        document_id: seeded["store"]
        .release_path(released["release_id"], document_id)
        .read_bytes()
        for document_id in released["document_ids"]
    }
