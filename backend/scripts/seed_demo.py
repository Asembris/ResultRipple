"""Create the frozen demo workspace and issue its genuine Version 1 editions.

Seed IDs describe primitive facts only. There is no corrected-artifact answer
list, affected-file list, reviewer answer, or permission shortcut here: every
such answer is produced later by a live query plus the deterministic engine.

Version 1 is not a pre-generated file. It is issued by running the real staging,
approval, verification, and release path once, with its approvals explicitly
labelled demo setup.

Usage:
    python -m scripts.seed_demo [--reset]
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import domain, service  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.deps import get_artifact_store, get_dataset_path, get_graph_client  # noqa: E402
from app.graph import GraphClient  # noqa: E402
from app.service import Actor, IntentFrame  # noqa: E402

LANES = [
    (domain.LANE_NORTH, "North"),
    (domain.LANE_SOUTH, "South"),
    (domain.LANE_PILOT, "Pilot"),
]

PEOPLE = [
    (domain.PERSON_ARI, "Ari Mensah", "analyst", False),
    (domain.PERSON_NOOR, "Noor Haddad", "reviewer", True),
    (domain.PERSON_SAM, "Sam Oyelaran", "reviewer", True),
    (domain.PERSON_OPERATOR, "Demo Operator", "operator", False),
]

OPS_BLOCKS: list[dict[str, Any]] = [
    {
        "id": "ops-intro",
        "kind": "narrative",
        "heading": "Scope of this review",
        "paragraphs": [
            "This recurring review compares mean handling cost per parcel across the "
            "North, South and Pilot lanes for the 2026 Q3 synthetic batch set.",
            "All figures are descriptive. Batches carry equal analytical weight and no "
            "causal savings estimate is made.",
        ],
    },
    {"id": "ops-finding-cost", "kind": "finding"},
    {
        "id": "ops-method",
        "kind": "narrative",
        "heading": "Method and limitations",
        "paragraphs": [
            "Each batch contributes one integer cost in cents per parcel. A lane enters "
            "the comparison only with at least four batches, which is a declared demo "
            "policy rather than a significance test.",
            "Lane membership reflects the current effective assignment recorded in the "
            "operations graph, which can differ from the lane originally written on the "
            "dispatch record.",
        ],
    },
]

MEMO_BLOCKS: list[dict[str, Any]] = [
    {
        "id": "memo-intro",
        "kind": "narrative",
        "heading": "Purpose",
        "paragraphs": [
            "This memo summarises the recorded cost case for the proposed South lane "
            "expansion, for the Operations Review team."
        ],
    },
    {"id": "memo-finding-cost", "kind": "finding"},
    {"id": "memo-decision", "kind": "decision", "heading": "Proposal status"},
    {
        "id": "memo-outlook",
        "kind": "narrative",
        "heading": "Other considerations",
        "paragraphs": [
            "Capacity, hiring lead time and depot availability were raised in the "
            "planning session and are not analysed here.",
            "Nothing in this section has been assessed against the linked evidence.",
        ],
    },
]

DISPATCH_NOTE = (
    "Dispatch correction DX-2026-0914: batches B09, B10 and B11 were Pilot-lane runs "
    "logged against South during the depot handover window. Reassign them to Pilot. "
    "Recorded costs are unchanged."
)

CORRECTION_REQUEST = (
    "Update the reports, but keep South as the cheaper option in the rollout memo."
)

SETUP_CASE_ID = "case-initial-publication"


def reset(graph: GraphClient) -> None:
    graph.run("MATCH (n) DETACH DELETE n")


def _blocks_sha(blocks: list[dict[str, Any]]) -> str:
    return hashlib.sha256(domain.canonical_json(blocks).encode("utf-8")).hexdigest()


def seed(graph: GraphClient, csv_path: Path) -> None:
    """Write the primitive facts. Fixed, parameterized, authored queries only."""
    raw = csv_path.read_bytes()
    dataset_sha = hashlib.sha256(raw).hexdigest()
    rows = [line.split(",") for line in raw.decode("utf-8").strip().splitlines()[1:]]
    batches = [
        {"id": batch_id, "cost_cents": int(cost), "recorded_lane": lane.strip()}
        for batch_id, cost, lane in rows
    ]
    lane_by_name = {name: lane_id for lane_id, name in LANES}

    graph.run(
        """
        CREATE (w:Workspace {id:$workspace_id, context_revision:1, demo:true,
                             label:'Fictional demo workspace'})
        CREATE (ds:Dataset {id:$dataset_id, raw_sha:$raw_sha,
                            expected_batch_count:$batch_count, schema_version:1,
                            title:'Parcel handling cost, 2026 Q3 synthetic batches'})
        CREATE (w)-[:HAS_DATASET]->(ds)
        """,
        {
            "workspace_id": domain.WORKSPACE_ID,
            "dataset_id": domain.DATASET_ID,
            "raw_sha": dataset_sha,
            "batch_count": len(batches),
        },
    )

    graph.run(
        """
        UNWIND $lanes AS lane
        CREATE (:Lane {id:lane[0], name:lane[1]})
        """,
        {"lanes": [[lane_id, name] for lane_id, name in LANES]},
    )

    graph.run(
        """
        MATCH (ds:Dataset {id:$dataset_id})
        UNWIND $batches AS batch
        CREATE (b:Batch {id:batch[0], cost_cents:batch[1], recorded_lane:batch[2]})
        CREATE (ds)-[:HAS_BATCH]->(b)
        WITH b, batch
        MATCH (lane:Lane {id:batch[3]})
        CREATE (b)-[:ASSIGNED_TO]->(lane)
        """,
        {
            "dataset_id": domain.DATASET_ID,
            "batches": [
                [b["id"], b["cost_cents"], b["recorded_lane"], lane_by_name[b["recorded_lane"]]]
                for b in batches
            ],
        },
    )

    graph.run(
        """
        UNWIND $people AS person
        CREATE (:Person {id:person[0], display_name:person[1], demo_role:person[2],
                         review_capable:person[3]})
        """,
        {"people": [list(person) for person in PEOPLE]},
    )

    graph.run(
        """
        CREATE (:Team {id:$team_id, name:'Operations Review'})
        """,
        {"team_id": domain.TEAM_ID},
    )

    graph.run(
        """
        MATCH (ds:Dataset {id:$dataset_id})
        MATCH (left:Lane {id:$left_lane_id})
        MATCH (right:Lane {id:$right_lane_id})
        MATCH (owner:Person {id:$owner_id})
        CREATE (cmp:Comparison {id:$comparison_id, metric_key:'MEAN_COST_V1', min_n:4,
                                display_precision:2,
                                title:'Mean handling cost per parcel, North versus South'})
        CREATE (cmp)-[:USES_DATASET]->(ds)
        CREATE (cmp)-[:LEFT_SIDE]->(left)
        CREATE (cmp)-[:RIGHT_SIDE]->(right)
        CREATE (cmp)-[:OWNED_BY]->(owner)
        CREATE (cl:Claim {id:$claim_id, definition_version:1,
                          title:'South versus North mean cost per parcel'})
        CREATE (cl)-[:BASED_ON]->(cmp)
        """,
        {
            "dataset_id": domain.DATASET_ID,
            "left_lane_id": domain.LANE_NORTH,
            "right_lane_id": domain.LANE_SOUTH,
            "owner_id": domain.PERSON_ARI,
            "comparison_id": domain.COMPARISON_ID,
            "claim_id": domain.CLAIM_ID,
        },
    )

    for document_id, title, template, owner_id, blocks, occurrence_id, style, block_id in (
        (
            domain.DOC_OPS,
            "Operations Cost Review",
            "operations_cost_review",
            domain.PERSON_ARI,
            OPS_BLOCKS,
            domain.OCC_OPS,
            "DOLLARS",
            "ops-finding-cost",
        ),
        (
            domain.DOC_MEMO,
            "South Expansion Memo",
            "south_expansion_memo",
            domain.PERSON_SAM,
            MEMO_BLOCKS,
            domain.OCC_MEMO,
            "CENTS",
            "memo-finding-cost",
        ),
    ):
        graph.run(
            """
            MATCH (owner:Person {id:$owner_id})
            MATCH (cl:Claim {id:$claim_id})
            CREATE (doc:Document {id:$document_id, title:$title, template:$template,
                                  source_revision:1, source_sha:$source_sha,
                                  source_blocks:$source_blocks})
            CREATE (doc)-[:OWNED_BY]->(owner)
            CREATE (occ:Occurrence {id:$occurrence_id, card_style:$card_style,
                                    block_id:$block_id, original_assertion:''})
            CREATE (occ)-[:IN_DOCUMENT]->(doc)
            CREATE (occ)-[:OF_CLAIM]->(cl)
            """,
            {
                "owner_id": owner_id,
                "claim_id": domain.CLAIM_ID,
                "document_id": document_id,
                "title": title,
                "template": template,
                "source_sha": _blocks_sha(blocks),
                "source_blocks": domain.canonical_json(blocks),
                "occurrence_id": occurrence_id,
                "card_style": style,
                "block_id": block_id,
            },
        )

    graph.run(
        """
        MATCH (cl:Claim {id:$claim_id})
        MATCH (team:Team {id:$team_id})
        MATCH (reviewer:Person {id:$reviewer_id})
        CREATE (decision:Decision {id:$decision_id, status:'PROPOSED',
                                   title:'South lane expansion proposal'})
        CREATE (decision)-[:BASED_ON]->(cl)
        CREATE (decision)-[:OWNED_BY]->(team)
        CREATE (team)-[:REVIEWED_BY {source:'demo-setup', assigned_by:$operator_id}]->(reviewer)
        """,
        {
            "claim_id": domain.CLAIM_ID,
            "team_id": domain.TEAM_ID,
            "reviewer_id": domain.PERSON_NOOR,
            "decision_id": domain.DECISION_ID,
            "operator_id": domain.PERSON_OPERATOR,
        },
    )

    # The demo-setup case exists so Version 1 is issued by the real pipeline.
    graph.run(
        """
        CREATE (:CorrectionCase {id:$case_id, status:'CORRECTION_APPLIED',
                                 source_note:'Demo setup: initial publication of the seeded evidence.',
                                 source_note_sha:$note_sha, source_ref:'DEMO-SETUP',
                                 from_lane_id:'', to_lane_id:'', demo_setup:true,
                                 request_text:'Issue the initial editions from the seeded evidence.',
                                 decision_id:$decision_id, comparison_id:$comparison_id})
        """,
        {
            "case_id": SETUP_CASE_ID,
            "note_sha": hashlib.sha256(b"demo-setup").hexdigest(),
            "decision_id": domain.DECISION_ID,
            "comparison_id": domain.COMPARISON_ID,
        },
    )

    graph.run(
        """
        CREATE (c:CorrectionCase {id:$case_id, status:'CORRECTION_PENDING',
                                  source_note:$source_note, source_note_sha:$note_sha,
                                  source_ref:'DX-2026-0914', from_lane_id:$from_lane_id,
                                  to_lane_id:$to_lane_id, request_text:$request_text,
                                  decision_id:$decision_id, comparison_id:$comparison_id})
        WITH c
        MATCH (from_lane:Lane {id:$from_lane_id})
        MATCH (to_lane:Lane {id:$to_lane_id})
        CREATE (c)-[:AFFECTS_LANE {role:'FROM'}]->(from_lane)
        CREATE (c)-[:AFFECTS_LANE {role:'TO'}]->(to_lane)
        WITH c
        UNWIND $changed_batch_ids AS batch_id
        MATCH (b:Batch {id:batch_id})
        CREATE (c)-[:CHANGES_BATCH]->(b)
        """,
        {
            "case_id": domain.CASE_ID,
            "source_note": DISPATCH_NOTE,
            "note_sha": hashlib.sha256(DISPATCH_NOTE.encode("utf-8")).hexdigest(),
            "from_lane_id": domain.LANE_SOUTH,
            "to_lane_id": domain.LANE_PILOT,
            "request_text": CORRECTION_REQUEST,
            "decision_id": domain.DECISION_ID,
            "comparison_id": domain.COMPARISON_ID,
            "changed_batch_ids": ["B09", "B10", "B11"],
        },
    )


def issue_version_one(graph: GraphClient, store, csv_path: Path) -> dict[str, Any]:
    """Run the real staging, approval and release path once, labelled demo setup."""
    ari = Actor(domain.PERSON_ARI, "Ari Mensah", "analyst", False)
    noor = Actor(domain.PERSON_NOOR, "Noor Haddad", "reviewer", True)

    plan = service.stage_review(
        graph,
        store,
        csv_path,
        actor=ari,
        case_id=SETUP_CASE_ID,
        intent=IntentFrame(
            raw_request="Demo setup: issue the initial editions from the seeded evidence.",
            goal=domain.GOAL_CORRECT_FACTS,
            disposition=domain.DISPOSITION_NO_CHANGE,
            alternative_flag=False,
            note="Demo setup approval. Not customer research or stakeholder consent.",
        ),
        idempotency_key="demo-setup-v1",
    )
    service.approve_plan(
        graph,
        csv_path,
        actor=noor,
        plan_id=plan["plan_id"],
        version=int(plan["version"]),
        fingerprint=plan["execution_fingerprint"],
        acknowledged_alternative=False,
    )
    return service.issue_release(
        graph,
        store,
        csv_path,
        actor=noor,
        plan_id=plan["plan_id"],
        operation_id="demo-setup-v1-release",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reset", action="store_true", help="delete the graph first")
    args = parser.parse_args()

    settings = get_settings()
    graph = get_graph_client()
    store = get_artifact_store()
    csv_path = get_dataset_path()

    existing = graph.run(
        "MATCH (w:Workspace {id:$id}) RETURN w.id AS id", {"id": domain.WORKSPACE_ID}
    )
    if existing and not args.reset:
        print(f"workspace {domain.WORKSPACE_ID} already seeded in graph {graph.graph_name}")
        return 0
    if args.reset:
        reset(graph)

    seed(graph, csv_path)
    issued = issue_version_one(graph, store, csv_path)
    release = issued["release"]
    print(f"graph:    {graph.graph_name} at {graph.endpoint}")
    print(f"dataset:  {settings.dataset_csv_path}")
    print(f"release:  {release['release_id']} (Version 1)")
    for document_id in release["document_ids"]:
        print(f"  edition {document_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
