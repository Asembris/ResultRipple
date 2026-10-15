"""Stable identifiers, enums, and canonical encoding shared across the backend.

These name primitive facts about the one frozen demo workspace. They are not an
answer list: no affected-document set, reviewer name, or corrected assertion is
recorded here. Every such answer comes from a live FalkorDB query.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

# -- workspace primitives -----------------------------------------------------

WORKSPACE_ID = "ws-parcelline"
DATASET_ID = "ds-parcel-cost-2026Q3"
COMPARISON_ID = "cmp-north-south-mean-cost"
CLAIM_ID = "claim-south-vs-north-cost"
DECISION_ID = "dec-south-expansion"
TEAM_ID = "team-operations-review"
CASE_ID = "case-dispatch-b09-b11"

LANE_NORTH = "lane-north"
LANE_SOUTH = "lane-south"
LANE_PILOT = "lane-pilot"

DOC_OPS = "doc-operations-cost-review"
DOC_MEMO = "doc-south-expansion-memo"

OCC_OPS = "occ-ops-cost-finding"
OCC_MEMO = "occ-memo-cost-finding"

PERSON_ARI = "person-ari"
PERSON_NOOR = "person-noor"
PERSON_SAM = "person-sam"
PERSON_OPERATOR = "person-operator"

# The identities that can hold a session at all. Everyone else observes.
PROVISIONED_DEMO_IDENTITIES = (PERSON_ARI, PERSON_NOOR, PERSON_SAM, PERSON_OPERATOR)

# Bump when a template changes in a way that changes rendered bytes. It is part
# of candidate-content identity, so an approval cannot survive a silent change.
TEMPLATE_VERSION = "tpl-1"

# -- bounded vocabularies -----------------------------------------------------

ALLOWED_METRIC_KEYS = frozenset({"MEAN_COST_V1"})
ALLOWED_CARD_STYLES = frozenset({"DOLLARS", "CENTS"})

# The one approved linked-finding style for each document layout: dollars in the
# operations report, cents in the executive memo.
TEMPLATE_CARD_STYLES = {
    "operations_cost_review": "DOLLARS",
    "south_expansion_memo": "CENTS",
}

# What the analyst confirms. Recorded on the graph beside the approval itself.
FINDING_APPROVAL_STATEMENT = "This is the intended comparison."
DECISION_BASIS_STATEMENT = "This finding is a basis for the {decision_title}."

# The permitted factual grammar is deliberately finite.
RELATION_LOWER = "LOWER_COST"
RELATION_HIGHER = "HIGHER_COST"
RELATION_EQUAL = "EQUAL_COST"
RELATION_WITHHELD = "WITHHELD"
ALLOWED_RELATIONS = frozenset(
    {RELATION_LOWER, RELATION_HIGHER, RELATION_EQUAL, RELATION_WITHHELD}
)

GOAL_CORRECT_FACTS = "CORRECT_FACTS"
GOAL_PRESERVE_PROPOSAL = "PRESERVE_PROPOSAL"
GOAL_RETAIN_CHEAPER_CLAIM = "RETAIN_CHEAPER_CLAIM"
GOAL_UNKNOWN = "UNKNOWN"
ALLOWED_GOALS = frozenset(
    {GOAL_CORRECT_FACTS, GOAL_PRESERVE_PROPOSAL, GOAL_RETAIN_CHEAPER_CLAIM, GOAL_UNKNOWN}
)

DISPOSITION_RETURN_FOR_REVIEW = "RETURN_FOR_REVIEW"
DISPOSITION_HOLD_FOR_CLARIFICATION = "HOLD_FOR_CLARIFICATION"
DISPOSITION_NO_CHANGE = "NO_CHANGE"
ALLOWED_DISPOSITIONS = frozenset(
    {
        DISPOSITION_RETURN_FOR_REVIEW,
        DISPOSITION_HOLD_FOR_CLARIFICATION,
        DISPOSITION_NO_CHANGE,
    }
)

# Decision workflow status committed by a release, per disposition.
DISPOSITION_DECISION_STATUS = {
    DISPOSITION_NO_CHANGE: "PROPOSED",
    DISPOSITION_RETURN_FOR_REVIEW: "RETURNED_FOR_REVIEW",
}

_COUNT_WORDS = ("No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine")


def _counted(count: int, singular: str, plural: str) -> str:
    word = _COUNT_WORDS[count] if 0 <= count < len(_COUNT_WORDS) else str(count)
    return f"{word} {singular if count == 1 else plural}"


def verification_scope_statement(occurrence_count: int, decision_block_count: int) -> str:
    """What a positive check covers, counted from the package actually checked.

    It is derived, never fixed, so a package with one registered card never
    claims two.
    """
    occurrences = _counted(
        occurrence_count, "registered finding occurrence", "registered finding occurrences"
    )
    decisions = _counted(
        decision_block_count, "typed decision-status block", "typed decision-status blocks"
    )
    return (
        f"{occurrences} and {decisions[0].lower()}{decisions[1:]} checked. "
        "Editorial narrative not assessed by ResultRipple."
    )


# Shown only where no package could be read at all, such as an evidence hold.
VERIFICATION_SCOPE_UNAVAILABLE = (
    "No package checked while current context is held. "
    "Editorial narrative not assessed by ResultRipple."
)


# -- canonical encoding -------------------------------------------------------


def canonical_json(value: Any) -> str:
    """Stable JSON used for graph properties, fingerprints, and receipts."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def canonical_sha(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()
