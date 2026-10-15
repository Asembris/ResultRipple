/**
 * Recorded `/workspace` responses from the real backend against a seeded
 * FalkorDB: one before the correction, one after it. They are captured output,
 * not invented product answers.
 */

import type { Workspace } from "../src/types";

export const WORKSPACE_V1: Workspace = {
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
    "hold_reason": null
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
          "id": "ops-finding-cost",
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
          "occurrence_id": "occ-ops-cost-finding",
          "block_id": "ops-finding-cost",
          "card_style": "DOLLARS",
          "claim_id": "claim-south-vs-north-cost"
        }
      ]
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
          "id": "memo-finding-cost",
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
          "occurrence_id": "occ-memo-cost-finding",
          "block_id": "memo-finding-cost",
          "card_style": "CENTS",
          "claim_id": "claim-south-vs-north-cost"
        }
      ]
    }
  ],
  "assessment": [
    {
      "occurrence_id": "occ-ops-cost-finding",
      "document_id": "doc-operations-cost-review",
      "block_id": "ops-finding-cost",
      "card_style": "DOLLARS",
      "previous": {
        "card_style": "DOLLARS",
        "hold_reason": null,
        "magnitude_cents": 40,
        "reference": "North",
        "relation": "LOWER_COST",
        "subject": "South",
        "text": "South costs $0.40 less per parcel than North.",
        "unit": "USD_PER_PARCEL"
      },
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
      "relation_changed": false,
      "magnitude_changed": false
    },
    {
      "occurrence_id": "occ-memo-cost-finding",
      "document_id": "doc-south-expansion-memo",
      "block_id": "memo-finding-cost",
      "card_style": "CENTS",
      "previous": {
        "card_style": "CENTS",
        "hold_reason": null,
        "magnitude_cents": 40,
        "reference": "North",
        "relation": "LOWER_COST",
        "subject": "South",
        "text": "South is 40 cents cheaper per parcel than North.",
        "unit": "CENTS_PER_PARCEL"
      },
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
      "relation_changed": false,
      "magnitude_changed": false
    }
  ],
  "decision": {
    "decision_id": "dec-south-expansion",
    "title": "South lane expansion proposal",
    "status": "PROPOSED",
    "basis_claim_id": "claim-south-vs-north-cost",
    "team_id": "team-operations-review",
    "team_name": "Operations Review",
    "current_reviewer_id": "person-noor",
    "current_reviewer_name": "Noor Haddad"
  },
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
      "plans": []
    },
    {
      "case_id": "case-initial-publication",
      "status": "ISSUED",
      "source_note": "Demo setup: initial publication of the seeded evidence.",
      "source_note_sha": "270280ad9a02a3e7ae51e6a99f5ffb78c6ad784a694fa5952924376e813578c8",
      "source_ref": "DEMO-SETUP",
      "from_lane_id": "",
      "to_lane_id": "",
      "request_text": "Issue the initial editions from the seeded evidence.",
      "decision_id": "dec-south-expansion",
      "comparison_id": "cmp-north-south-mean-cost",
      "applied_by": null,
      "applied_at": null,
      "changed_batch_ids": [],
      "affected_lanes": [],
      "plans": [
        {
          "plan_id": "plan-case-initial-publication-v1",
          "version": 1,
          "status": "ISSUED",
          "content_hash": "c004be615274f87ba5f2cc24aa95d065f5d48af6fae70d578b639ebc6c5a0545",
          "execution_fingerprint": "14b1294c01e9616c9490523e54f7970d3f60c1af9ff411ccff93c34201266bf4",
          "invalidation_reason": null,
          "approved_by": "person-noor",
          "assigned_reviewer_id": "person-noor"
        }
      ]
    }
  ],
  "current_release": {
    "release_id": "rel-001-c004be61",
    "sequence": 1,
    "issued_at": "2026-10-14T23:33:52+00:00",
    "artifacts": "{\"doc-operations-cost-review\":{\"path\":\"releases/rel-001-c004be61/doc-operations-cost-review.html\",\"sha256\":\"5a670a69c226980325af01e1e0a5e407b473865950472a2412dcafa7f387cc26\",\"title\":\"Operations Cost Review\"},\"doc-south-expansion-memo\":{\"path\":\"releases/rel-001-c004be61/doc-south-expansion-memo.html\",\"sha256\":\"93c8b9dbaafd39b3523005b0d5bb0c71140eda57f869b0bf5d76668d26955a9c\",\"title\":\"South Expansion Memo\"}}",
    "receipt": "{\"acknowledged_alternative\":false,\"alternative_proposed\":false,\"approved_at\":\"2026-10-14T23:33:52+00:00\",\"approved_by\":\"person-noor\",\"approved_context_revision\":1,\"artifacts\":{\"doc-operations-cost-review\":{\"path\":\"releases/rel-001-c004be61/doc-operations-cost-review.html\",\"sha256\":\"5a670a69c226980325af01e1e0a5e407b473865950472a2412dcafa7f387cc26\",\"title\":\"Operations Cost Review\"},\"doc-south-expansion-memo\":{\"path\":\"releases/rel-001-c004be61/doc-south-expansion-memo.html\",\"sha256\":\"93c8b9dbaafd39b3523005b0d5bb0c71140eda57f869b0bf5d76668d26955a9c\",\"title\":\"South Expansion Memo\"}},\"authority_at_issue\":{\"reviewer_id\":\"person-noor\",\"reviewer_name\":\"Noor Haddad\",\"team_id\":\"team-operations-review\"},\"content_hash\":\"c004be615274f87ba5f2cc24aa95d065f5d48af6fae70d578b639ebc6c5a0545\",\"dataset_sha\":\"9f32c90244987bb5bc6c4fb4dbed63dd8f5ef9a0552f09bba62b3edd7ad2b6aa\",\"disposition\":\"NO_CHANGE\",\"execution_fingerprint\":\"14b1294c01e9616c9490523e54f7970d3f60c1af9ff411ccff93c34201266bf4\",\"interpreted_goal\":\"CORRECT_FACTS\",\"issued_at\":\"2026-10-14T23:33:52+00:00\",\"issued_by\":\"person-noor\",\"membership_sha\":\"929767228468c45303e6e3f906e54e0a9bbcac8d64f4d5b5897f5523dac85192\",\"operation_id\":\"demo-setup-v1-release\",\"plan_id\":\"plan-case-initial-publication-v1\",\"plan_version\":1,\"raw_request\":\"Demo setup: issue the initial editions from the seeded evidence.\",\"release_id\":\"rel-001-c004be61\",\"verification\":{\"checks\":[{\"detail\":\"recorded 9f32c90244987bb5bc6c4fb4dbed63dd8f5ef9a0552f09bba62b3edd7ad2b6aa\",\"name\":\"dataset_bytes_unchanged\",\"passed\":true},{\"detail\":\"15 rows\",\"name\":\"dataset_row_count\",\"passed\":true},{\"detail\":\"\",\"name\":\"membership_costs_match_csv\",\"passed\":true},{\"detail\":\"4 vs 7, min 4\",\"name\":\"minimum_sample_satisfied\",\"passed\":true},{\"detail\":\"issued ['doc-operations-cost-review', 'doc-south-expansion-memo']\",\"name\":\"all_registered_documents_issued\",\"passed\":true},{\"detail\":\"actual 5a670a69c226980325af01e1e0a5e407b473865950472a2412dcafa7f387cc26\",\"name\":\"doc-operations-cost-review:hash_matches_approved\",\"passed\":true},{\"detail\":\"1 rendered, 1 registered\",\"name\":\"doc-operations-cost-review:registered_card_count\",\"passed\":true},{\"detail\":\"found 'South costs $0.40 less per parcel than North.', expected 'South costs $0.40 less per parcel than North.'\",\"name\":\"doc-operations-cost-review:ops-finding-cost:assertion\",\"passed\":true},{\"detail\":\"found LOWER_COST\",\"name\":\"doc-operations-cost-review:ops-finding-cost:typed_relation\",\"passed\":true},{\"detail\":\"found 40\",\"name\":\"doc-operations-cost-review:ops-finding-cost:typed_magnitude\",\"passed\":true},{\"detail\":\"found USD_PER_PARCEL\",\"name\":\"doc-operations-cost-review:ops-finding-cost:unit\",\"passed\":true},{\"detail\":\"\",\"name\":\"doc-operations-cost-review:ops-finding-cost:occurrence_identity\",\"passed\":true},{\"detail\":\"a contradicted assertion is still present\",\"name\":\"doc-operations-cost-review:ops-finding-cost:no_higher_cost\",\"passed\":true},{\"detail\":\"a contradicted assertion is still present\",\"name\":\"doc-operations-cost-review:ops-finding-cost:no_equal_cost\",\"passed\":true},{\"detail\":\"found ['This recurring review compares mean handling cost per parcel across the North, South and Pilot lanes for the 2026 Q3 synthetic batch set.', 'All figures are descriptive. Batches carry equal analytical weight and no causal savings estimate is made.']\",\"name\":\"doc-operations-cost-review:ops-intro:narrative_unchanged\",\"passed\":true},{\"detail\":\"narrative must be labelled unassessed\",\"name\":\"doc-operations-cost-review:ops-intro:scope_label\",\"passed\":true},{\"detail\":\"found ['Each batch contributes one integer cost in cents per parcel. A lane enters the comparison only with at least four batches, which is a declared demo policy rather than a significance test.', 'Lane membership reflects the current effective assignment recorded in the operations graph, which can differ from the lane originally written on the dispatch record.']\",\"name\":\"doc-operations-cost-review:ops-method:narrative_unchanged\",\"passed\":true},{\"detail\":\"narrative must be labelled unassessed\",\"name\":\"doc-operations-cost-review:ops-method:scope_label\",\"passed\":true},{\"detail\":\"\",\"name\":\"doc-operations-cost-review:no_unexpected_decision_block\",\"passed\":true},{\"detail\":\"found 9f32c90244987bb5bc6c4fb4dbed63dd8f5ef9a0552f09bba62b3edd7ad2b6aa\",\"name\":\"doc-operations-cost-review:dataset_metadata\",\"passed\":true},{\"detail\":\"\",\"name\":\"doc-operations-cost-review:document_metadata\",\"passed\":true},{\"detail\":\"actual 93c8b9dbaafd39b3523005b0d5bb0c71140eda57f869b0bf5d76668d26955a9c\",\"name\":\"doc-south-expansion-memo:hash_matches_approved\",\"passed\":true},{\"detail\":\"1 rendered, 1 registered\",\"name\":\"doc-south-expansion-memo:registered_card_count\",\"passed\":true},{\"detail\":\"found 'South is 40 cents cheaper per parcel than North.', expected 'South is 40 cents cheaper per parcel than North.'\",\"name\":\"doc-south-expansion-memo:memo-finding-cost:assertion\",\"passed\":true},{\"detail\":\"found LOWER_COST\",\"name\":\"doc-south-expansion-memo:memo-finding-cost:typed_relation\",\"passed\":true},{\"detail\":\"found 40\",\"name\":\"doc-south-expansion-memo:memo-finding-cost:typed_magnitude\",\"passed\":true},{\"detail\":\"found CENTS_PER_PARCEL\",\"name\":\"doc-south-expansion-memo:memo-finding-cost:unit\",\"passed\":true},{\"detail\":\"\",\"name\":\"doc-south-expansion-memo:memo-finding-cost:occurrence_identity\",\"passed\":true},{\"detail\":\"a contradicted assertion is still present\",\"name\":\"doc-south-expansion-memo:memo-finding-cost:no_higher_cost\",\"passed\":true},{\"detail\":\"a contradicted assertion is still present\",\"name\":\"doc-south-expansion-memo:memo-finding-cost:no_equal_cost\",\"passed\":true},{\"detail\":\"found ['This memo summarises the recorded cost case for the proposed South lane expansion, for the Operations Review team.']\",\"name\":\"doc-south-expansion-memo:memo-intro:narrative_unchanged\",\"passed\":true},{\"detail\":\"narrative must be labelled unassessed\",\"name\":\"doc-south-expansion-memo:memo-intro:scope_label\",\"passed\":true},{\"detail\":\"found ['Capacity, hiring lead time and depot availability were raised in the planning session and are not analysed here.', 'Nothing in this section has been assessed against the linked evidence.']\",\"name\":\"doc-south-expansion-memo:memo-outlook:narrative_unchanged\",\"passed\":true},{\"detail\":\"narrative must be labelled unassessed\",\"name\":\"doc-south-expansion-memo:memo-outlook:scope_label\",\"passed\":true},{\"detail\":\"\",\"name\":\"doc-south-expansion-memo:decision_block_present\",\"passed\":true},{\"detail\":\"found PROPOSED\",\"name\":\"doc-south-expansion-memo:decision_status\",\"passed\":true},{\"detail\":\"\",\"name\":\"doc-south-expansion-memo:decision_identity\",\"passed\":true},{\"detail\":\"found 9f32c90244987bb5bc6c4fb4dbed63dd8f5ef9a0552f09bba62b3edd7ad2b6aa\",\"name\":\"doc-south-expansion-memo:dataset_metadata\",\"passed\":true},{\"detail\":\"\",\"name\":\"doc-south-expansion-memo:document_metadata\",\"passed\":true}],\"derived\":{\"left\":{\"count\":4,\"lane_id\":\"lane-north\",\"mean_cents\":\"400\",\"total_cents\":1600},\"magnitude_cents\":40,\"relation\":\"LOWER_COST\",\"right\":{\"count\":7,\"lane_id\":\"lane-south\",\"mean_cents\":\"360\",\"total_cents\":2520}},\"hashes\":{\"doc-operations-cost-review\":\"5a670a69c226980325af01e1e0a5e407b473865950472a2412dcafa7f387cc26\",\"doc-south-expansion-memo\":\"93c8b9dbaafd39b3523005b0d5bb0c71140eda57f869b0bf5d76668d26955a9c\"},\"ok\":true},\"verification_scope\":\"Two registered finding occurrences and one typed decision-status block checked. Editorial narrative not assessed by ResultRipple.\"}",
    "occurrence_snapshots": "[{\"block_id\":\"ops-finding-cost\",\"card_style\":\"DOLLARS\",\"current\":{\"card_style\":\"DOLLARS\",\"hold_reason\":null,\"magnitude_cents\":40,\"reference\":\"North\",\"relation\":\"LOWER_COST\",\"subject\":\"South\",\"text\":\"South costs $0.40 less per parcel than North.\",\"unit\":\"USD_PER_PARCEL\"},\"document_id\":\"doc-operations-cost-review\",\"magnitude_changed\":true,\"occurrence_id\":\"occ-ops-cost-finding\",\"previous\":{},\"relation_changed\":true},{\"block_id\":\"memo-finding-cost\",\"card_style\":\"CENTS\",\"current\":{\"card_style\":\"CENTS\",\"hold_reason\":null,\"magnitude_cents\":40,\"reference\":\"North\",\"relation\":\"LOWER_COST\",\"subject\":\"South\",\"text\":\"South is 40 cents cheaper per parcel than North.\",\"unit\":\"CENTS_PER_PARCEL\"},\"document_id\":\"doc-south-expansion-memo\",\"magnitude_changed\":true,\"occurrence_id\":\"occ-memo-cost-finding\",\"previous\":{},\"relation_changed\":true}]",
    "operation_id": "demo-setup-v1-release",
    "plan_id": "plan-case-initial-publication-v1",
    "plan_version": 1,
    "is_current": true,
    "document_ids": [
      "doc-operations-cost-review",
      "doc-south-expansion-memo"
    ]
  },
  "releases": [
    {
      "release_id": "rel-001-c004be61",
      "sequence": 1,
      "issued_at": "2026-10-14T23:33:52+00:00",
      "artifacts": "{\"doc-operations-cost-review\":{\"path\":\"releases/rel-001-c004be61/doc-operations-cost-review.html\",\"sha256\":\"5a670a69c226980325af01e1e0a5e407b473865950472a2412dcafa7f387cc26\",\"title\":\"Operations Cost Review\"},\"doc-south-expansion-memo\":{\"path\":\"releases/rel-001-c004be61/doc-south-expansion-memo.html\",\"sha256\":\"93c8b9dbaafd39b3523005b0d5bb0c71140eda57f869b0bf5d76668d26955a9c\",\"title\":\"South Expansion Memo\"}}",
      "is_current": true
    }
  ],
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

export const WORKSPACE_CORRECTED: Workspace = {
  "workspace_id": "ws-parcelline",
  "context_revision": 3,
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
        "lane_id": "lane-pilot"
      },
      {
        "batch_id": "B10",
        "cost_cents": 250,
        "lane_id": "lane-pilot"
      },
      {
        "batch_id": "B11",
        "cost_cents": 270,
        "lane_id": "lane-pilot"
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
      "total_cents": 1760,
      "batch_count": 4,
      "mean_numerator": 440,
      "mean_denominator": 1,
      "mean_display_cents": 440
    },
    "relation": "HIGHER_COST",
    "magnitude_cents": 40,
    "hold_reason": null
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
          "id": "ops-finding-cost",
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
          "occurrence_id": "occ-ops-cost-finding",
          "block_id": "ops-finding-cost",
          "card_style": "DOLLARS",
          "claim_id": "claim-south-vs-north-cost"
        }
      ]
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
          "id": "memo-finding-cost",
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
          "occurrence_id": "occ-memo-cost-finding",
          "block_id": "memo-finding-cost",
          "card_style": "CENTS",
          "claim_id": "claim-south-vs-north-cost"
        }
      ]
    }
  ],
  "assessment": [
    {
      "occurrence_id": "occ-ops-cost-finding",
      "document_id": "doc-operations-cost-review",
      "block_id": "ops-finding-cost",
      "card_style": "DOLLARS",
      "previous": {
        "card_style": "DOLLARS",
        "hold_reason": null,
        "magnitude_cents": 40,
        "reference": "North",
        "relation": "LOWER_COST",
        "subject": "South",
        "text": "South costs $0.40 less per parcel than North.",
        "unit": "USD_PER_PARCEL"
      },
      "current": {
        "subject": "South",
        "reference": "North",
        "relation": "HIGHER_COST",
        "magnitude_cents": 40,
        "unit": "USD_PER_PARCEL",
        "card_style": "DOLLARS",
        "hold_reason": null,
        "text": "South costs $0.40 more per parcel than North."
      },
      "relation_changed": true,
      "magnitude_changed": false
    },
    {
      "occurrence_id": "occ-memo-cost-finding",
      "document_id": "doc-south-expansion-memo",
      "block_id": "memo-finding-cost",
      "card_style": "CENTS",
      "previous": {
        "card_style": "CENTS",
        "hold_reason": null,
        "magnitude_cents": 40,
        "reference": "North",
        "relation": "LOWER_COST",
        "subject": "South",
        "text": "South is 40 cents cheaper per parcel than North.",
        "unit": "CENTS_PER_PARCEL"
      },
      "current": {
        "subject": "South",
        "reference": "North",
        "relation": "HIGHER_COST",
        "magnitude_cents": 40,
        "unit": "CENTS_PER_PARCEL",
        "card_style": "CENTS",
        "hold_reason": null,
        "text": "South is 40 cents more expensive per parcel than North."
      },
      "relation_changed": true,
      "magnitude_changed": false
    }
  ],
  "decision": {
    "decision_id": "dec-south-expansion",
    "title": "South lane expansion proposal",
    "status": "PROPOSED",
    "basis_claim_id": "claim-south-vs-north-cost",
    "team_id": "team-operations-review",
    "team_name": "Operations Review",
    "current_reviewer_id": "person-noor",
    "current_reviewer_name": "Noor Haddad"
  },
  "cases": [
    {
      "case_id": "case-dispatch-b09-b11",
      "status": "CORRECTION_APPLIED",
      "source_note": "Dispatch correction DX-2026-0914: batches B09, B10 and B11 were Pilot-lane runs logged against South during the depot handover window. Reassign them to Pilot. Recorded costs are unchanged.",
      "source_note_sha": "e1826a79c6da8b026da9bbae1f4e42b785e2dbaff06ad2eceeaa12a9aab115a8",
      "source_ref": "DX-2026-0914",
      "from_lane_id": "lane-south",
      "to_lane_id": "lane-pilot",
      "request_text": "Update the reports, but keep South as the cheaper option in the rollout memo.",
      "decision_id": "dec-south-expansion",
      "comparison_id": "cmp-north-south-mean-cost",
      "applied_by": "person-ari",
      "applied_at": "2026-10-14T23:33:52+00:00",
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
      "plans": []
    },
    {
      "case_id": "case-initial-publication",
      "status": "ISSUED",
      "source_note": "Demo setup: initial publication of the seeded evidence.",
      "source_note_sha": "270280ad9a02a3e7ae51e6a99f5ffb78c6ad784a694fa5952924376e813578c8",
      "source_ref": "DEMO-SETUP",
      "from_lane_id": "",
      "to_lane_id": "",
      "request_text": "Issue the initial editions from the seeded evidence.",
      "decision_id": "dec-south-expansion",
      "comparison_id": "cmp-north-south-mean-cost",
      "applied_by": null,
      "applied_at": null,
      "changed_batch_ids": [],
      "affected_lanes": [],
      "plans": [
        {
          "plan_id": "plan-case-initial-publication-v1",
          "version": 1,
          "status": "ISSUED",
          "content_hash": "c004be615274f87ba5f2cc24aa95d065f5d48af6fae70d578b639ebc6c5a0545",
          "execution_fingerprint": "14b1294c01e9616c9490523e54f7970d3f60c1af9ff411ccff93c34201266bf4",
          "invalidation_reason": null,
          "approved_by": "person-noor",
          "assigned_reviewer_id": "person-noor"
        }
      ]
    }
  ],
  "current_release": {
    "release_id": "rel-001-c004be61",
    "sequence": 1,
    "issued_at": "2026-10-14T23:33:52+00:00",
    "artifacts": "{\"doc-operations-cost-review\":{\"path\":\"releases/rel-001-c004be61/doc-operations-cost-review.html\",\"sha256\":\"5a670a69c226980325af01e1e0a5e407b473865950472a2412dcafa7f387cc26\",\"title\":\"Operations Cost Review\"},\"doc-south-expansion-memo\":{\"path\":\"releases/rel-001-c004be61/doc-south-expansion-memo.html\",\"sha256\":\"93c8b9dbaafd39b3523005b0d5bb0c71140eda57f869b0bf5d76668d26955a9c\",\"title\":\"South Expansion Memo\"}}",
    "receipt": "{\"acknowledged_alternative\":false,\"alternative_proposed\":false,\"approved_at\":\"2026-10-14T23:33:52+00:00\",\"approved_by\":\"person-noor\",\"approved_context_revision\":1,\"artifacts\":{\"doc-operations-cost-review\":{\"path\":\"releases/rel-001-c004be61/doc-operations-cost-review.html\",\"sha256\":\"5a670a69c226980325af01e1e0a5e407b473865950472a2412dcafa7f387cc26\",\"title\":\"Operations Cost Review\"},\"doc-south-expansion-memo\":{\"path\":\"releases/rel-001-c004be61/doc-south-expansion-memo.html\",\"sha256\":\"93c8b9dbaafd39b3523005b0d5bb0c71140eda57f869b0bf5d76668d26955a9c\",\"title\":\"South Expansion Memo\"}},\"authority_at_issue\":{\"reviewer_id\":\"person-noor\",\"reviewer_name\":\"Noor Haddad\",\"team_id\":\"team-operations-review\"},\"content_hash\":\"c004be615274f87ba5f2cc24aa95d065f5d48af6fae70d578b639ebc6c5a0545\",\"dataset_sha\":\"9f32c90244987bb5bc6c4fb4dbed63dd8f5ef9a0552f09bba62b3edd7ad2b6aa\",\"disposition\":\"NO_CHANGE\",\"execution_fingerprint\":\"14b1294c01e9616c9490523e54f7970d3f60c1af9ff411ccff93c34201266bf4\",\"interpreted_goal\":\"CORRECT_FACTS\",\"issued_at\":\"2026-10-14T23:33:52+00:00\",\"issued_by\":\"person-noor\",\"membership_sha\":\"929767228468c45303e6e3f906e54e0a9bbcac8d64f4d5b5897f5523dac85192\",\"operation_id\":\"demo-setup-v1-release\",\"plan_id\":\"plan-case-initial-publication-v1\",\"plan_version\":1,\"raw_request\":\"Demo setup: issue the initial editions from the seeded evidence.\",\"release_id\":\"rel-001-c004be61\",\"verification\":{\"checks\":[{\"detail\":\"recorded 9f32c90244987bb5bc6c4fb4dbed63dd8f5ef9a0552f09bba62b3edd7ad2b6aa\",\"name\":\"dataset_bytes_unchanged\",\"passed\":true},{\"detail\":\"15 rows\",\"name\":\"dataset_row_count\",\"passed\":true},{\"detail\":\"\",\"name\":\"membership_costs_match_csv\",\"passed\":true},{\"detail\":\"4 vs 7, min 4\",\"name\":\"minimum_sample_satisfied\",\"passed\":true},{\"detail\":\"issued ['doc-operations-cost-review', 'doc-south-expansion-memo']\",\"name\":\"all_registered_documents_issued\",\"passed\":true},{\"detail\":\"actual 5a670a69c226980325af01e1e0a5e407b473865950472a2412dcafa7f387cc26\",\"name\":\"doc-operations-cost-review:hash_matches_approved\",\"passed\":true},{\"detail\":\"1 rendered, 1 registered\",\"name\":\"doc-operations-cost-review:registered_card_count\",\"passed\":true},{\"detail\":\"found 'South costs $0.40 less per parcel than North.', expected 'South costs $0.40 less per parcel than North.'\",\"name\":\"doc-operations-cost-review:ops-finding-cost:assertion\",\"passed\":true},{\"detail\":\"found LOWER_COST\",\"name\":\"doc-operations-cost-review:ops-finding-cost:typed_relation\",\"passed\":true},{\"detail\":\"found 40\",\"name\":\"doc-operations-cost-review:ops-finding-cost:typed_magnitude\",\"passed\":true},{\"detail\":\"found USD_PER_PARCEL\",\"name\":\"doc-operations-cost-review:ops-finding-cost:unit\",\"passed\":true},{\"detail\":\"\",\"name\":\"doc-operations-cost-review:ops-finding-cost:occurrence_identity\",\"passed\":true},{\"detail\":\"a contradicted assertion is still present\",\"name\":\"doc-operations-cost-review:ops-finding-cost:no_higher_cost\",\"passed\":true},{\"detail\":\"a contradicted assertion is still present\",\"name\":\"doc-operations-cost-review:ops-finding-cost:no_equal_cost\",\"passed\":true},{\"detail\":\"found ['This recurring review compares mean handling cost per parcel across the North, South and Pilot lanes for the 2026 Q3 synthetic batch set.', 'All figures are descriptive. Batches carry equal analytical weight and no causal savings estimate is made.']\",\"name\":\"doc-operations-cost-review:ops-intro:narrative_unchanged\",\"passed\":true},{\"detail\":\"narrative must be labelled unassessed\",\"name\":\"doc-operations-cost-review:ops-intro:scope_label\",\"passed\":true},{\"detail\":\"found ['Each batch contributes one integer cost in cents per parcel. A lane enters the comparison only with at least four batches, which is a declared demo policy rather than a significance test.', 'Lane membership reflects the current effective assignment recorded in the operations graph, which can differ from the lane originally written on the dispatch record.']\",\"name\":\"doc-operations-cost-review:ops-method:narrative_unchanged\",\"passed\":true},{\"detail\":\"narrative must be labelled unassessed\",\"name\":\"doc-operations-cost-review:ops-method:scope_label\",\"passed\":true},{\"detail\":\"\",\"name\":\"doc-operations-cost-review:no_unexpected_decision_block\",\"passed\":true},{\"detail\":\"found 9f32c90244987bb5bc6c4fb4dbed63dd8f5ef9a0552f09bba62b3edd7ad2b6aa\",\"name\":\"doc-operations-cost-review:dataset_metadata\",\"passed\":true},{\"detail\":\"\",\"name\":\"doc-operations-cost-review:document_metadata\",\"passed\":true},{\"detail\":\"actual 93c8b9dbaafd39b3523005b0d5bb0c71140eda57f869b0bf5d76668d26955a9c\",\"name\":\"doc-south-expansion-memo:hash_matches_approved\",\"passed\":true},{\"detail\":\"1 rendered, 1 registered\",\"name\":\"doc-south-expansion-memo:registered_card_count\",\"passed\":true},{\"detail\":\"found 'South is 40 cents cheaper per parcel than North.', expected 'South is 40 cents cheaper per parcel than North.'\",\"name\":\"doc-south-expansion-memo:memo-finding-cost:assertion\",\"passed\":true},{\"detail\":\"found LOWER_COST\",\"name\":\"doc-south-expansion-memo:memo-finding-cost:typed_relation\",\"passed\":true},{\"detail\":\"found 40\",\"name\":\"doc-south-expansion-memo:memo-finding-cost:typed_magnitude\",\"passed\":true},{\"detail\":\"found CENTS_PER_PARCEL\",\"name\":\"doc-south-expansion-memo:memo-finding-cost:unit\",\"passed\":true},{\"detail\":\"\",\"name\":\"doc-south-expansion-memo:memo-finding-cost:occurrence_identity\",\"passed\":true},{\"detail\":\"a contradicted assertion is still present\",\"name\":\"doc-south-expansion-memo:memo-finding-cost:no_higher_cost\",\"passed\":true},{\"detail\":\"a contradicted assertion is still present\",\"name\":\"doc-south-expansion-memo:memo-finding-cost:no_equal_cost\",\"passed\":true},{\"detail\":\"found ['This memo summarises the recorded cost case for the proposed South lane expansion, for the Operations Review team.']\",\"name\":\"doc-south-expansion-memo:memo-intro:narrative_unchanged\",\"passed\":true},{\"detail\":\"narrative must be labelled unassessed\",\"name\":\"doc-south-expansion-memo:memo-intro:scope_label\",\"passed\":true},{\"detail\":\"found ['Capacity, hiring lead time and depot availability were raised in the planning session and are not analysed here.', 'Nothing in this section has been assessed against the linked evidence.']\",\"name\":\"doc-south-expansion-memo:memo-outlook:narrative_unchanged\",\"passed\":true},{\"detail\":\"narrative must be labelled unassessed\",\"name\":\"doc-south-expansion-memo:memo-outlook:scope_label\",\"passed\":true},{\"detail\":\"\",\"name\":\"doc-south-expansion-memo:decision_block_present\",\"passed\":true},{\"detail\":\"found PROPOSED\",\"name\":\"doc-south-expansion-memo:decision_status\",\"passed\":true},{\"detail\":\"\",\"name\":\"doc-south-expansion-memo:decision_identity\",\"passed\":true},{\"detail\":\"found 9f32c90244987bb5bc6c4fb4dbed63dd8f5ef9a0552f09bba62b3edd7ad2b6aa\",\"name\":\"doc-south-expansion-memo:dataset_metadata\",\"passed\":true},{\"detail\":\"\",\"name\":\"doc-south-expansion-memo:document_metadata\",\"passed\":true}],\"derived\":{\"left\":{\"count\":4,\"lane_id\":\"lane-north\",\"mean_cents\":\"400\",\"total_cents\":1600},\"magnitude_cents\":40,\"relation\":\"LOWER_COST\",\"right\":{\"count\":7,\"lane_id\":\"lane-south\",\"mean_cents\":\"360\",\"total_cents\":2520}},\"hashes\":{\"doc-operations-cost-review\":\"5a670a69c226980325af01e1e0a5e407b473865950472a2412dcafa7f387cc26\",\"doc-south-expansion-memo\":\"93c8b9dbaafd39b3523005b0d5bb0c71140eda57f869b0bf5d76668d26955a9c\"},\"ok\":true},\"verification_scope\":\"Two registered finding occurrences and one typed decision-status block checked. Editorial narrative not assessed by ResultRipple.\"}",
    "occurrence_snapshots": "[{\"block_id\":\"ops-finding-cost\",\"card_style\":\"DOLLARS\",\"current\":{\"card_style\":\"DOLLARS\",\"hold_reason\":null,\"magnitude_cents\":40,\"reference\":\"North\",\"relation\":\"LOWER_COST\",\"subject\":\"South\",\"text\":\"South costs $0.40 less per parcel than North.\",\"unit\":\"USD_PER_PARCEL\"},\"document_id\":\"doc-operations-cost-review\",\"magnitude_changed\":true,\"occurrence_id\":\"occ-ops-cost-finding\",\"previous\":{},\"relation_changed\":true},{\"block_id\":\"memo-finding-cost\",\"card_style\":\"CENTS\",\"current\":{\"card_style\":\"CENTS\",\"hold_reason\":null,\"magnitude_cents\":40,\"reference\":\"North\",\"relation\":\"LOWER_COST\",\"subject\":\"South\",\"text\":\"South is 40 cents cheaper per parcel than North.\",\"unit\":\"CENTS_PER_PARCEL\"},\"document_id\":\"doc-south-expansion-memo\",\"magnitude_changed\":true,\"occurrence_id\":\"occ-memo-cost-finding\",\"previous\":{},\"relation_changed\":true}]",
    "operation_id": "demo-setup-v1-release",
    "plan_id": "plan-case-initial-publication-v1",
    "plan_version": 1,
    "is_current": true,
    "document_ids": [
      "doc-operations-cost-review",
      "doc-south-expansion-memo"
    ]
  },
  "releases": [
    {
      "release_id": "rel-001-c004be61",
      "sequence": 1,
      "issued_at": "2026-10-14T23:33:52+00:00",
      "artifacts": "{\"doc-operations-cost-review\":{\"path\":\"releases/rel-001-c004be61/doc-operations-cost-review.html\",\"sha256\":\"5a670a69c226980325af01e1e0a5e407b473865950472a2412dcafa7f387cc26\",\"title\":\"Operations Cost Review\"},\"doc-south-expansion-memo\":{\"path\":\"releases/rel-001-c004be61/doc-south-expansion-memo.html\",\"sha256\":\"93c8b9dbaafd39b3523005b0d5bb0c71140eda57f869b0bf5d76668d26955a9c\",\"title\":\"South Expansion Memo\"}}",
      "is_current": true
    }
  ],
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
