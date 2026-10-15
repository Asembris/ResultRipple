/**
 * Recorded GET /workspace responses from the real backend against a fresh,
 * authoring-start FalkorDB graph (`seed_demo --fresh`): before anything is
 * registered, after the analyst registers the finding, and after it is placed
 * in both reports but before the decision basis is recorded.
 *
 * Captured output, not invented answers. Regenerate by recording against an
 * isolated test graph rather than editing values by hand.
 */

import type { Workspace } from "../src/types";

export const WORKSPACE_FRESH: Workspace = {
  "workspace_id": "ws-parcelline",
  "context_revision": 1,
  "demo": true,
  "hold": null,
  "evidence": {
    "dataset_id": "ds-parcel-cost-2026Q3",
    "dataset_sha": "9f32c90244987bb5bc6c4fb4dbed63dd8f5ef9a0552f09bba62b3edd7ad2b6aa",
    "batches": [
      {
        "batch_id": "B01",
        "cost_cents": 380,
        "lane_id": "lane-north"
      },
      {
        "batch_id": "B02",
        "cost_cents": 400,
        "lane_id": "lane-north"
      },
      {
        "batch_id": "B03",
        "cost_cents": 420,
        "lane_id": "lane-north"
      },
      {
        "batch_id": "B04",
        "cost_cents": 400,
        "lane_id": "lane-north"
      },
      {
        "batch_id": "B05",
        "cost_cents": 420,
        "lane_id": "lane-south"
      },
      {
        "batch_id": "B06",
        "cost_cents": 440,
        "lane_id": "lane-south"
      },
      {
        "batch_id": "B07",
        "cost_cents": 460,
        "lane_id": "lane-south"
      },
      {
        "batch_id": "B08",
        "cost_cents": 440,
        "lane_id": "lane-south"
      },
      {
        "batch_id": "B09",
        "cost_cents": 240,
        "lane_id": "lane-south"
      },
      {
        "batch_id": "B10",
        "cost_cents": 250,
        "lane_id": "lane-south"
      },
      {
        "batch_id": "B11",
        "cost_cents": 270,
        "lane_id": "lane-south"
      },
      {
        "batch_id": "B12",
        "cost_cents": 250,
        "lane_id": "lane-pilot"
      },
      {
        "batch_id": "B13",
        "cost_cents": 260,
        "lane_id": "lane-pilot"
      },
      {
        "batch_id": "B14",
        "cost_cents": 240,
        "lane_id": "lane-pilot"
      },
      {
        "batch_id": "B15",
        "cost_cents": 250,
        "lane_id": "lane-pilot"
      }
    ]
  },
  "comparison": {
    "comparison_id": "cmp-north-south-mean-cost",
    "metric_key": "MEAN_COST_V1",
    "min_n": 4,
    "owner_id": "person-ari",
    "owner_name": "Ari Mensah",
    "dataset_id": "ds-parcel-cost-2026Q3",
    "dataset_title": "Parcel handling cost, 2026 Q3 synthetic batches",
    "dataset_sha": "9f32c90244987bb5bc6c4fb4dbed63dd8f5ef9a0552f09bba62b3edd7ad2b6aa",
    "left": {
      "lane_id": "lane-north",
      "lane_name": "North",
      "total_cents": 1600,
      "batch_count": 4,
      "mean_numerator": 400,
      "mean_denominator": 1,
      "mean_display_cents": 400
    },
    "right": {
      "lane_id": "lane-south",
      "lane_name": "South",
      "total_cents": 2520,
      "batch_count": 7,
      "mean_numerator": 360,
      "mean_denominator": 1,
      "mean_display_cents": 360
    },
    "relation": "LOWER_COST",
    "magnitude_cents": 40,
    "hold_reason": null,
    "unit": "USD_PER_PARCEL",
    "sentence": "South costs $0.40 less per parcel than North.",
    "finding_title": "South versus North mean cost per parcel"
  },
  "scope": [
    {
      "document_id": "doc-operations-cost-review",
      "title": "Operations Cost Review",
      "owner_id": "person-ari",
      "owner_name": "Ari Mensah",
      "blocks": [
        {
          "heading": "Scope of this review",
          "id": "ops-intro",
          "kind": "narrative",
          "paragraphs": [
            "This recurring review compares mean handling cost per parcel across the North, South and Pilot lanes for the 2026 Q3 synthetic batch set.",
            "All figures are descriptive. Batches carry equal analytical weight and no causal savings estimate is made."
          ]
        },
        {
          "heading": "Method and limitations",
          "id": "ops-method",
          "kind": "narrative",
          "paragraphs": [
            "Each batch contributes one integer cost in cents per parcel. A lane enters the comparison only with at least four batches, which is a declared demo policy rather than a significance test.",
            "Lane membership reflects the current effective assignment recorded in the operations graph, which can differ from the lane originally written on the dispatch record."
          ]
        }
      ],
      "occurrences": [],
      "approved_card_style": "DOLLARS",
      "has_decision_block": false
    },
    {
      "document_id": "doc-south-expansion-memo",
      "title": "South Expansion Memo",
      "owner_id": "person-sam",
      "owner_name": "Sam Oyelaran",
      "blocks": [
        {
          "heading": "Purpose",
          "id": "memo-intro",
          "kind": "narrative",
          "paragraphs": [
            "This memo summarises the recorded cost case for the proposed South lane expansion, for the Operations Review team."
          ]
        },
        {
          "heading": "Proposal status",
          "id": "memo-decision",
          "kind": "decision"
        },
        {
          "heading": "Other considerations",
          "id": "memo-outlook",
          "kind": "narrative",
          "paragraphs": [
            "Capacity, hiring lead time and depot availability were raised in the planning session and are not analysed here.",
            "Nothing in this section has been assessed against the linked evidence."
          ]
        }
      ],
      "occurrences": [],
      "approved_card_style": "CENTS",
      "has_decision_block": true
    }
  ],
  "assessment": [],
  "decision": {
    "decision_id": "dec-south-expansion",
    "title": "South lane expansion proposal",
    "status": "PROPOSED",
    "basis_claim_id": null,
    "team_id": "team-operations-review",
    "team_name": "Operations Review",
    "current_reviewer_id": "person-noor",
    "current_reviewer_name": "Noor Haddad"
  },
  "findings": [],
  "cases": [
    {
      "case_id": "case-dispatch-b09-b11",
      "status": "CORRECTION_PENDING",
      "source_note": "Dispatch correction DX-2026-0914: batches B09, B10 and B11 were Pilot-lane runs logged against South during the depot handover window. Reassign them to Pilot. Recorded costs are unchanged.",
      "source_note_sha": "e1826a79c6da8b026da9bbae1f4e42b785e2dbaff06ad2eceeaa12a9aab115a8",
      "source_ref": "DX-2026-0914",
      "from_lane_id": "lane-south",
      "to_lane_id": "lane-pilot",
      "request_text": "Update the reports, but keep South as the cheaper option in the rollout memo.",
      "decision_id": "dec-south-expansion",
      "comparison_id": "cmp-north-south-mean-cost",
      "applied_by": null,
      "applied_at": null,
      "clarification_field": null,
      "clarification_question": null,
      "clarification_context_ids": null,
      "clarification_asked_at": null,
      "changed_batch_ids": [
        "B09",
        "B10",
        "B11"
      ],
      "affected_lanes": [
        {
          "lane_id": "lane-south",
          "role": "FROM"
        },
        {
          "lane_id": "lane-pilot",
          "role": "TO"
        }
      ],
      "plans": [],
      "agent_runs": []
    },
    {
      "case_id": "case-initial-publication",
      "status": "CORRECTION_APPLIED",
      "source_note": "Initial publication of the authored reports.",
      "source_note_sha": "7bea622d0428552985abbd9d9dfccc8fe7d4e01ba9c10db89bc74e9cb8d48ba6",
      "source_ref": "INITIAL-PUBLICATION",
      "from_lane_id": "",
      "to_lane_id": "",
      "request_text": "Issue the first editions of the authored reports.",
      "decision_id": "dec-south-expansion",
      "comparison_id": "cmp-north-south-mean-cost",
      "applied_by": null,
      "applied_at": null,
      "clarification_field": null,
      "clarification_question": null,
      "clarification_context_ids": null,
      "clarification_asked_at": null,
      "changed_batch_ids": [],
      "affected_lanes": [],
      "plans": [],
      "agent_runs": []
    }
  ],
  "current_release": null,
  "releases": [],
  "people": [
    {
      "person_id": "person-ari",
      "display_name": "Ari Mensah",
      "demo_role": "analyst",
      "review_capable": false
    },
    {
      "person_id": "person-noor",
      "display_name": "Noor Haddad",
      "demo_role": "reviewer",
      "review_capable": true
    },
    {
      "person_id": "person-operator",
      "display_name": "Demo Operator",
      "demo_role": "operator",
      "review_capable": false
    },
    {
      "person_id": "person-sam",
      "display_name": "Sam Oyelaran",
      "demo_role": "reviewer",
      "review_capable": true
    }
  ],
  "verification_scope": "No registered finding occurrences and one typed decision-status block checked. Editorial narrative not assessed by ResultRipple."
};

export const WORKSPACE_FINDING_REGISTERED: Workspace = {
  "workspace_id": "ws-parcelline",
  "context_revision": 2,
  "demo": true,
  "hold": null,
  "evidence": {
    "dataset_id": "ds-parcel-cost-2026Q3",
    "dataset_sha": "9f32c90244987bb5bc6c4fb4dbed63dd8f5ef9a0552f09bba62b3edd7ad2b6aa",
    "batches": [
      {
        "batch_id": "B01",
        "cost_cents": 380,
        "lane_id": "lane-north"
      },
      {
        "batch_id": "B02",
        "cost_cents": 400,
        "lane_id": "lane-north"
      },
      {
        "batch_id": "B03",
        "cost_cents": 420,
        "lane_id": "lane-north"
      },
      {
        "batch_id": "B04",
        "cost_cents": 400,
        "lane_id": "lane-north"
      },
      {
        "batch_id": "B05",
        "cost_cents": 420,
        "lane_id": "lane-south"
      },
      {
        "batch_id": "B06",
        "cost_cents": 440,
        "lane_id": "lane-south"
      },
      {
        "batch_id": "B07",
        "cost_cents": 460,
        "lane_id": "lane-south"
      },
      {
        "batch_id": "B08",
        "cost_cents": 440,
        "lane_id": "lane-south"
      },
      {
        "batch_id": "B09",
        "cost_cents": 240,
        "lane_id": "lane-south"
      },
      {
        "batch_id": "B10",
        "cost_cents": 250,
        "lane_id": "lane-south"
      },
      {
        "batch_id": "B11",
        "cost_cents": 270,
        "lane_id": "lane-south"
      },
      {
        "batch_id": "B12",
        "cost_cents": 250,
        "lane_id": "lane-pilot"
      },
      {
        "batch_id": "B13",
        "cost_cents": 260,
        "lane_id": "lane-pilot"
      },
      {
        "batch_id": "B14",
        "cost_cents": 240,
        "lane_id": "lane-pilot"
      },
      {
        "batch_id": "B15",
        "cost_cents": 250,
        "lane_id": "lane-pilot"
      }
    ]
  },
  "comparison": {
    "comparison_id": "cmp-north-south-mean-cost",
    "metric_key": "MEAN_COST_V1",
    "min_n": 4,
    "owner_id": "person-ari",
    "owner_name": "Ari Mensah",
    "dataset_id": "ds-parcel-cost-2026Q3",
    "dataset_title": "Parcel handling cost, 2026 Q3 synthetic batches",
    "dataset_sha": "9f32c90244987bb5bc6c4fb4dbed63dd8f5ef9a0552f09bba62b3edd7ad2b6aa",
    "left": {
      "lane_id": "lane-north",
      "lane_name": "North",
      "total_cents": 1600,
      "batch_count": 4,
      "mean_numerator": 400,
      "mean_denominator": 1,
      "mean_display_cents": 400
    },
    "right": {
      "lane_id": "lane-south",
      "lane_name": "South",
      "total_cents": 2520,
      "batch_count": 7,
      "mean_numerator": 360,
      "mean_denominator": 1,
      "mean_display_cents": 360
    },
    "relation": "LOWER_COST",
    "magnitude_cents": 40,
    "hold_reason": null,
    "unit": "USD_PER_PARCEL",
    "sentence": "South costs $0.40 less per parcel than North.",
    "finding_title": "South versus North mean cost per parcel"
  },
  "scope": [
    {
      "document_id": "doc-operations-cost-review",
      "title": "Operations Cost Review",
      "owner_id": "person-ari",
      "owner_name": "Ari Mensah",
      "blocks": [
        {
          "heading": "Scope of this review",
          "id": "ops-intro",
          "kind": "narrative",
          "paragraphs": [
            "This recurring review compares mean handling cost per parcel across the North, South and Pilot lanes for the 2026 Q3 synthetic batch set.",
            "All figures are descriptive. Batches carry equal analytical weight and no causal savings estimate is made."
          ]
        },
        {
          "heading": "Method and limitations",
          "id": "ops-method",
          "kind": "narrative",
          "paragraphs": [
            "Each batch contributes one integer cost in cents per parcel. A lane enters the comparison only with at least four batches, which is a declared demo policy rather than a significance test.",
            "Lane membership reflects the current effective assignment recorded in the operations graph, which can differ from the lane originally written on the dispatch record."
          ]
        }
      ],
      "occurrences": [],
      "approved_card_style": "DOLLARS",
      "has_decision_block": false
    },
    {
      "document_id": "doc-south-expansion-memo",
      "title": "South Expansion Memo",
      "owner_id": "person-sam",
      "owner_name": "Sam Oyelaran",
      "blocks": [
        {
          "heading": "Purpose",
          "id": "memo-intro",
          "kind": "narrative",
          "paragraphs": [
            "This memo summarises the recorded cost case for the proposed South lane expansion, for the Operations Review team."
          ]
        },
        {
          "heading": "Proposal status",
          "id": "memo-decision",
          "kind": "decision"
        },
        {
          "heading": "Other considerations",
          "id": "memo-outlook",
          "kind": "narrative",
          "paragraphs": [
            "Capacity, hiring lead time and depot availability were raised in the planning session and are not analysed here.",
            "Nothing in this section has been assessed against the linked evidence."
          ]
        }
      ],
      "occurrences": [],
      "approved_card_style": "CENTS",
      "has_decision_block": true
    }
  ],
  "assessment": [],
  "decision": {
    "decision_id": "dec-south-expansion",
    "title": "South lane expansion proposal",
    "status": "PROPOSED",
    "basis_claim_id": null,
    "team_id": "team-operations-review",
    "team_name": "Operations Review",
    "current_reviewer_id": "person-noor",
    "current_reviewer_name": "Noor Haddad"
  },
  "findings": [
    {
      "claim_id": "claim-cmp-north-south-mean-cost",
      "title": "South versus North mean cost per parcel",
      "approved_by": "person-ari",
      "approved_at": "2026-10-15T19:30:05+00:00",
      "comparison_ids": [
        "cmp-north-south-mean-cost"
      ],
      "occurrences": []
    }
  ],
  "cases": [
    {
      "case_id": "case-dispatch-b09-b11",
      "status": "CORRECTION_PENDING",
      "source_note": "Dispatch correction DX-2026-0914: batches B09, B10 and B11 were Pilot-lane runs logged against South during the depot handover window. Reassign them to Pilot. Recorded costs are unchanged.",
      "source_note_sha": "e1826a79c6da8b026da9bbae1f4e42b785e2dbaff06ad2eceeaa12a9aab115a8",
      "source_ref": "DX-2026-0914",
      "from_lane_id": "lane-south",
      "to_lane_id": "lane-pilot",
      "request_text": "Update the reports, but keep South as the cheaper option in the rollout memo.",
      "decision_id": "dec-south-expansion",
      "comparison_id": "cmp-north-south-mean-cost",
      "applied_by": null,
      "applied_at": null,
      "clarification_field": null,
      "clarification_question": null,
      "clarification_context_ids": null,
      "clarification_asked_at": null,
      "changed_batch_ids": [
        "B09",
        "B10",
        "B11"
      ],
      "affected_lanes": [
        {
          "lane_id": "lane-south",
          "role": "FROM"
        },
        {
          "lane_id": "lane-pilot",
          "role": "TO"
        }
      ],
      "plans": [],
      "agent_runs": []
    },
    {
      "case_id": "case-initial-publication",
      "status": "CORRECTION_APPLIED",
      "source_note": "Initial publication of the authored reports.",
      "source_note_sha": "7bea622d0428552985abbd9d9dfccc8fe7d4e01ba9c10db89bc74e9cb8d48ba6",
      "source_ref": "INITIAL-PUBLICATION",
      "from_lane_id": "",
      "to_lane_id": "",
      "request_text": "Issue the first editions of the authored reports.",
      "decision_id": "dec-south-expansion",
      "comparison_id": "cmp-north-south-mean-cost",
      "applied_by": null,
      "applied_at": null,
      "clarification_field": null,
      "clarification_question": null,
      "clarification_context_ids": null,
      "clarification_asked_at": null,
      "changed_batch_ids": [],
      "affected_lanes": [],
      "plans": [],
      "agent_runs": []
    }
  ],
  "current_release": null,
  "releases": [],
  "people": [
    {
      "person_id": "person-ari",
      "display_name": "Ari Mensah",
      "demo_role": "analyst",
      "review_capable": false
    },
    {
      "person_id": "person-noor",
      "display_name": "Noor Haddad",
      "demo_role": "reviewer",
      "review_capable": true
    },
    {
      "person_id": "person-operator",
      "display_name": "Demo Operator",
      "demo_role": "operator",
      "review_capable": false
    },
    {
      "person_id": "person-sam",
      "display_name": "Sam Oyelaran",
      "demo_role": "reviewer",
      "review_capable": true
    }
  ],
  "verification_scope": "No registered finding occurrences and one typed decision-status block checked. Editorial narrative not assessed by ResultRipple."
};

export const WORKSPACE_PLACED_NO_BASIS: Workspace = {
  "workspace_id": "ws-parcelline",
  "context_revision": 4,
  "demo": true,
  "hold": null,
  "evidence": {
    "dataset_id": "ds-parcel-cost-2026Q3",
    "dataset_sha": "9f32c90244987bb5bc6c4fb4dbed63dd8f5ef9a0552f09bba62b3edd7ad2b6aa",
    "batches": [
      {
        "batch_id": "B01",
        "cost_cents": 380,
        "lane_id": "lane-north"
      },
      {
        "batch_id": "B02",
        "cost_cents": 400,
        "lane_id": "lane-north"
      },
      {
        "batch_id": "B03",
        "cost_cents": 420,
        "lane_id": "lane-north"
      },
      {
        "batch_id": "B04",
        "cost_cents": 400,
        "lane_id": "lane-north"
      },
      {
        "batch_id": "B05",
        "cost_cents": 420,
        "lane_id": "lane-south"
      },
      {
        "batch_id": "B06",
        "cost_cents": 440,
        "lane_id": "lane-south"
      },
      {
        "batch_id": "B07",
        "cost_cents": 460,
        "lane_id": "lane-south"
      },
      {
        "batch_id": "B08",
        "cost_cents": 440,
        "lane_id": "lane-south"
      },
      {
        "batch_id": "B09",
        "cost_cents": 240,
        "lane_id": "lane-south"
      },
      {
        "batch_id": "B10",
        "cost_cents": 250,
        "lane_id": "lane-south"
      },
      {
        "batch_id": "B11",
        "cost_cents": 270,
        "lane_id": "lane-south"
      },
      {
        "batch_id": "B12",
        "cost_cents": 250,
        "lane_id": "lane-pilot"
      },
      {
        "batch_id": "B13",
        "cost_cents": 260,
        "lane_id": "lane-pilot"
      },
      {
        "batch_id": "B14",
        "cost_cents": 240,
        "lane_id": "lane-pilot"
      },
      {
        "batch_id": "B15",
        "cost_cents": 250,
        "lane_id": "lane-pilot"
      }
    ]
  },
  "comparison": {
    "comparison_id": "cmp-north-south-mean-cost",
    "metric_key": "MEAN_COST_V1",
    "min_n": 4,
    "owner_id": "person-ari",
    "owner_name": "Ari Mensah",
    "dataset_id": "ds-parcel-cost-2026Q3",
    "dataset_title": "Parcel handling cost, 2026 Q3 synthetic batches",
    "dataset_sha": "9f32c90244987bb5bc6c4fb4dbed63dd8f5ef9a0552f09bba62b3edd7ad2b6aa",
    "left": {
      "lane_id": "lane-north",
      "lane_name": "North",
      "total_cents": 1600,
      "batch_count": 4,
      "mean_numerator": 400,
      "mean_denominator": 1,
      "mean_display_cents": 400
    },
    "right": {
      "lane_id": "lane-south",
      "lane_name": "South",
      "total_cents": 2520,
      "batch_count": 7,
      "mean_numerator": 360,
      "mean_denominator": 1,
      "mean_display_cents": 360
    },
    "relation": "LOWER_COST",
    "magnitude_cents": 40,
    "hold_reason": null,
    "unit": "USD_PER_PARCEL",
    "sentence": "South costs $0.40 less per parcel than North.",
    "finding_title": "South versus North mean cost per parcel"
  },
  "scope": [
    {
      "document_id": "doc-operations-cost-review",
      "title": "Operations Cost Review",
      "owner_id": "person-ari",
      "owner_name": "Ari Mensah",
      "blocks": [
        {
          "heading": "Scope of this review",
          "id": "ops-intro",
          "kind": "narrative",
          "paragraphs": [
            "This recurring review compares mean handling cost per parcel across the North, South and Pilot lanes for the 2026 Q3 synthetic batch set.",
            "All figures are descriptive. Batches carry equal analytical weight and no causal savings estimate is made."
          ]
        },
        {
          "id": "finding-claim-cmp-north-south-mean-cost",
          "kind": "finding"
        },
        {
          "heading": "Method and limitations",
          "id": "ops-method",
          "kind": "narrative",
          "paragraphs": [
            "Each batch contributes one integer cost in cents per parcel. A lane enters the comparison only with at least four batches, which is a declared demo policy rather than a significance test.",
            "Lane membership reflects the current effective assignment recorded in the operations graph, which can differ from the lane originally written on the dispatch record."
          ]
        }
      ],
      "occurrences": [
        {
          "occurrence_id": "occ-operations-cost-review-cmp-north-south-mean-cost",
          "block_id": "finding-claim-cmp-north-south-mean-cost",
          "card_style": "DOLLARS",
          "claim_id": "claim-cmp-north-south-mean-cost"
        }
      ],
      "approved_card_style": "DOLLARS",
      "has_decision_block": false
    },
    {
      "document_id": "doc-south-expansion-memo",
      "title": "South Expansion Memo",
      "owner_id": "person-sam",
      "owner_name": "Sam Oyelaran",
      "blocks": [
        {
          "heading": "Purpose",
          "id": "memo-intro",
          "kind": "narrative",
          "paragraphs": [
            "This memo summarises the recorded cost case for the proposed South lane expansion, for the Operations Review team."
          ]
        },
        {
          "id": "finding-claim-cmp-north-south-mean-cost",
          "kind": "finding"
        },
        {
          "heading": "Proposal status",
          "id": "memo-decision",
          "kind": "decision"
        },
        {
          "heading": "Other considerations",
          "id": "memo-outlook",
          "kind": "narrative",
          "paragraphs": [
            "Capacity, hiring lead time and depot availability were raised in the planning session and are not analysed here.",
            "Nothing in this section has been assessed against the linked evidence."
          ]
        }
      ],
      "occurrences": [
        {
          "occurrence_id": "occ-south-expansion-memo-cmp-north-south-mean-cost",
          "block_id": "finding-claim-cmp-north-south-mean-cost",
          "card_style": "CENTS",
          "claim_id": "claim-cmp-north-south-mean-cost"
        }
      ],
      "approved_card_style": "CENTS",
      "has_decision_block": true
    }
  ],
  "assessment": [
    {
      "occurrence_id": "occ-operations-cost-review-cmp-north-south-mean-cost",
      "document_id": "doc-operations-cost-review",
      "block_id": "finding-claim-cmp-north-south-mean-cost",
      "card_style": "DOLLARS",
      "previous": {},
      "current": {
        "subject": "South",
        "reference": "North",
        "relation": "LOWER_COST",
        "magnitude_cents": 40,
        "unit": "USD_PER_PARCEL",
        "card_style": "DOLLARS",
        "hold_reason": null,
        "text": "South costs $0.40 less per parcel than North."
      },
      "relation_changed": true,
      "magnitude_changed": true
    },
    {
      "occurrence_id": "occ-south-expansion-memo-cmp-north-south-mean-cost",
      "document_id": "doc-south-expansion-memo",
      "block_id": "finding-claim-cmp-north-south-mean-cost",
      "card_style": "CENTS",
      "previous": {},
      "current": {
        "subject": "South",
        "reference": "North",
        "relation": "LOWER_COST",
        "magnitude_cents": 40,
        "unit": "CENTS_PER_PARCEL",
        "card_style": "CENTS",
        "hold_reason": null,
        "text": "South is 40 cents cheaper per parcel than North."
      },
      "relation_changed": true,
      "magnitude_changed": true
    }
  ],
  "decision": {
    "decision_id": "dec-south-expansion",
    "title": "South lane expansion proposal",
    "status": "PROPOSED",
    "basis_claim_id": null,
    "team_id": "team-operations-review",
    "team_name": "Operations Review",
    "current_reviewer_id": "person-noor",
    "current_reviewer_name": "Noor Haddad"
  },
  "findings": [
    {
      "claim_id": "claim-cmp-north-south-mean-cost",
      "title": "South versus North mean cost per parcel",
      "approved_by": "person-ari",
      "approved_at": "2026-10-15T19:30:05+00:00",
      "comparison_ids": [
        "cmp-north-south-mean-cost"
      ],
      "occurrences": [
        {
          "occurrence_id": "occ-operations-cost-review-cmp-north-south-mean-cost",
          "document_id": "doc-operations-cost-review",
          "card_style": "DOLLARS",
          "block_id": "finding-claim-cmp-north-south-mean-cost"
        },
        {
          "occurrence_id": "occ-south-expansion-memo-cmp-north-south-mean-cost",
          "document_id": "doc-south-expansion-memo",
          "card_style": "CENTS",
          "block_id": "finding-claim-cmp-north-south-mean-cost"
        }
      ]
    }
  ],
  "cases": [
    {
      "case_id": "case-dispatch-b09-b11",
      "status": "CORRECTION_PENDING",
      "source_note": "Dispatch correction DX-2026-0914: batches B09, B10 and B11 were Pilot-lane runs logged against South during the depot handover window. Reassign them to Pilot. Recorded costs are unchanged.",
      "source_note_sha": "e1826a79c6da8b026da9bbae1f4e42b785e2dbaff06ad2eceeaa12a9aab115a8",
      "source_ref": "DX-2026-0914",
      "from_lane_id": "lane-south",
      "to_lane_id": "lane-pilot",
      "request_text": "Update the reports, but keep South as the cheaper option in the rollout memo.",
      "decision_id": "dec-south-expansion",
      "comparison_id": "cmp-north-south-mean-cost",
      "applied_by": null,
      "applied_at": null,
      "clarification_field": null,
      "clarification_question": null,
      "clarification_context_ids": null,
      "clarification_asked_at": null,
      "changed_batch_ids": [
        "B09",
        "B10",
        "B11"
      ],
      "affected_lanes": [
        {
          "lane_id": "lane-south",
          "role": "FROM"
        },
        {
          "lane_id": "lane-pilot",
          "role": "TO"
        }
      ],
      "plans": [],
      "agent_runs": []
    },
    {
      "case_id": "case-initial-publication",
      "status": "CORRECTION_APPLIED",
      "source_note": "Initial publication of the authored reports.",
      "source_note_sha": "7bea622d0428552985abbd9d9dfccc8fe7d4e01ba9c10db89bc74e9cb8d48ba6",
      "source_ref": "INITIAL-PUBLICATION",
      "from_lane_id": "",
      "to_lane_id": "",
      "request_text": "Issue the first editions of the authored reports.",
      "decision_id": "dec-south-expansion",
      "comparison_id": "cmp-north-south-mean-cost",
      "applied_by": null,
      "applied_at": null,
      "clarification_field": null,
      "clarification_question": null,
      "clarification_context_ids": null,
      "clarification_asked_at": null,
      "changed_batch_ids": [],
      "affected_lanes": [],
      "plans": [],
      "agent_runs": []
    }
  ],
  "current_release": null,
  "releases": [],
  "people": [
    {
      "person_id": "person-ari",
      "display_name": "Ari Mensah",
      "demo_role": "analyst",
      "review_capable": false
    },
    {
      "person_id": "person-noor",
      "display_name": "Noor Haddad",
      "demo_role": "reviewer",
      "review_capable": true
    },
    {
      "person_id": "person-operator",
      "display_name": "Demo Operator",
      "demo_role": "operator",
      "review_capable": false
    },
    {
      "person_id": "person-sam",
      "display_name": "Sam Oyelaran",
      "demo_role": "reviewer",
      "review_capable": true
    }
  ],
  "verification_scope": "Two registered finding occurrences and one typed decision-status block checked. Editorial narrative not assessed by ResultRipple."
};
