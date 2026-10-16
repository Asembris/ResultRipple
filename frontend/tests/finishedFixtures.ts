/**
 * Recorded responses from the real backend for the finished demo case: the
 * observer workspace after Release 2, both plan versions, the agent job, and
 * both release receipts. Captured output, not invented answers; regenerate
 * by recording a seeded graph driven through the workflow e2e suite.
 */

import type { AgentJob, Plan, Workspace } from "../src/types";

export const WORKSPACE_FINISHED: Workspace = {
  "workspace_id": "ws-parcelline",
  "context_revision": 5,
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
      "total_cents": 1760,
      "batch_count": 4,
      "mean_numerator": 440,
      "mean_denominator": 1,
      "mean_display_cents": 440
    },
    "relation": "HIGHER_COST",
    "magnitude_cents": 40,
    "hold_reason": null,
    "unit": "USD_PER_PARCEL",
    "sentence": "South costs $0.40 more per parcel than North.",
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
      ],
      "approved_card_style": "CENTS",
      "has_decision_block": true
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
        "relation": "HIGHER_COST",
        "subject": "South",
        "text": "South costs $0.40 more per parcel than North.",
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
        "relation": "HIGHER_COST",
        "subject": "South",
        "text": "South is 40 cents more expensive per parcel than North.",
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
      "relation_changed": false,
      "magnitude_changed": false
    }
  ],
  "decision": {
    "decision_id": "dec-south-expansion",
    "title": "South lane expansion proposal",
    "status": "RETURNED_FOR_REVIEW",
    "basis_claim_id": "claim-south-vs-north-cost",
    "team_id": "team-operations-review",
    "team_name": "Operations Review",
    "current_reviewer_id": "person-sam",
    "current_reviewer_name": "Sam Oyelaran"
  },
  "findings": [
    {
      "claim_id": "claim-south-vs-north-cost",
      "title": "South versus North mean cost per parcel",
      "approved_by": null,
      "approved_at": null,
      "comparison_ids": [
        "cmp-north-south-mean-cost"
      ],
      "occurrences": [
        {
          "occurrence_id": "occ-memo-cost-finding",
          "document_id": "doc-south-expansion-memo",
          "card_style": "CENTS",
          "block_id": "memo-finding-cost"
        },
        {
          "occurrence_id": "occ-ops-cost-finding",
          "document_id": "doc-operations-cost-review",
          "card_style": "DOLLARS",
          "block_id": "ops-finding-cost"
        }
      ]
    }
  ],
  "cases": [
    {
      "case_id": "case-dispatch-b09-b11",
      "status": "ISSUED",
      "source_note": "Dispatch correction DX-2026-0914: batches B09, B10 and B11 were Pilot-lane runs logged against South during the depot handover window. Reassign them to Pilot. Recorded costs are unchanged.",
      "source_note_sha": "e1826a79c6da8b026da9bbae1f4e42b785e2dbaff06ad2eceeaa12a9aab115a8",
      "source_ref": "DX-2026-0914",
      "from_lane_id": "lane-south",
      "to_lane_id": "lane-pilot",
      "request_text": "Update the reports, but keep South as the cheaper option in the rollout memo.",
      "decision_id": "dec-south-expansion",
      "comparison_id": "cmp-north-south-mean-cost",
      "applied_by": "person-ari",
      "applied_at": "2026-10-16T17:39:14+00:00",
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
      "plans": [
        {
          "plan_id": "plan-case-dispatch-b09-b11-v1",
          "version": 1,
          "status": "SUPERSEDED",
          "content_hash": "44c0bbfca0cd633cb833f35ecbfab8f4c3ee2a9a272812cf7a0c16dfbb442020",
          "execution_fingerprint": "c746cf8987f6e0c075db0ee6154056385eb52772a6fd196d40bf019e279c559f",
          "invalidation_reason": "AUTHORITY_CHANGED",
          "approved_by": "person-noor",
          "goal": "RETAIN_CHEAPER_CLAIM",
          "alternative_flag": true,
          "disposition": "RETURN_FOR_REVIEW",
          "note": "South is higher cost per inspection insp-9c490fc0c6452e29",
          "staged_by": "agent-of:person-ari",
          "assigned_reviewer_id": "person-noor"
        },
        {
          "plan_id": "plan-case-dispatch-b09-b11-v2",
          "version": 2,
          "status": "ISSUED",
          "content_hash": "44c0bbfca0cd633cb833f35ecbfab8f4c3ee2a9a272812cf7a0c16dfbb442020",
          "execution_fingerprint": "1849d1776c1d9f81960e346f6bc5a5995e6b45fd4e2b4eb3f4f570fb380e9520",
          "invalidation_reason": null,
          "approved_by": "person-sam",
          "goal": "RETAIN_CHEAPER_CLAIM",
          "alternative_flag": true,
          "disposition": "RETURN_FOR_REVIEW",
          "note": "South is higher cost per inspection insp-9c490fc0c6452e29",
          "staged_by": "person-noor",
          "assigned_reviewer_id": "person-sam"
        }
      ],
      "agent_runs": [
        {
          "job_id": "job-f435351169a7",
          "status": "AWAITING_REVIEW",
          "started_at": "2026-10-16T17:39:15+00:00",
          "finished_at": "2026-10-16T17:39:24+00:00",
          "plan_id": "plan-case-dispatch-b09-b11-v1",
          "error_code": null,
          "elapsed_ms": 8552,
          "request_text": "Update the reports, but keep South as the cheaper option in the rollout memo."
        }
      ]
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
      "clarification_field": null,
      "clarification_question": null,
      "clarification_context_ids": null,
      "clarification_asked_at": null,
      "changed_batch_ids": [],
      "affected_lanes": [
        {
          "lane_id": "lane-north",
          "role": "LEFT"
        },
        {
          "lane_id": "lane-south",
          "role": "RIGHT"
        }
      ],
      "plans": [
        {
          "plan_id": "plan-case-initial-publication-v1",
          "version": 1,
          "status": "ISSUED",
          "content_hash": "c004be615274f87ba5f2cc24aa95d065f5d48af6fae70d578b639ebc6c5a0545",
          "execution_fingerprint": "14b1294c01e9616c9490523e54f7970d3f60c1af9ff411ccff93c34201266bf4",
          "invalidation_reason": null,
          "approved_by": "person-noor",
          "goal": "CORRECT_FACTS",
          "alternative_flag": false,
          "disposition": "NO_CHANGE",
          "note": "Demo setup approval. Not customer research or stakeholder consent.",
          "staged_by": "person-ari",
          "assigned_reviewer_id": "person-noor"
        }
      ],
      "agent_runs": []
    }
  ],
  "current_release": {
    "release_id": "rel-002-44c0bbfc",
    "sequence": 2,
    "issued_at": "2026-10-16T17:39:50+00:00",
    "artifacts": "{\"doc-operations-cost-review\":{\"path\":\"releases/rel-002-44c0bbfc/doc-operations-cost-review.html\",\"sha256\":\"626caeddad2366b8ce869ff67feec4a6ba6ae0ac18826baa9c7a8e19b9670468\",\"title\":\"Operations Cost Review\"},\"doc-south-expansion-memo\":{\"path\":\"releases/rel-002-44c0bbfc/doc-south-expansion-memo.html\",\"sha256\":\"ea0a575c718eb11bfe9aca4fd97e52bf83dc741368f129169cfd190e8b9c33e0\",\"title\":\"South Expansion Memo\"}}",
    "receipt": "{\"acknowledged_alternative\":true,\"alternative_proposed\":true,\"approved_at\":\"2026-10-16T17:39:49+00:00\",\"approved_by\":\"person-sam\",\"approved_context_revision\":4,\"artifacts\":{\"doc-operations-cost-review\":{\"path\":\"releases/rel-002-44c0bbfc/doc-operations-cost-review.html\",\"sha256\":\"626caeddad2366b8ce869ff67feec4a6ba6ae0ac18826baa9c7a8e19b9670468\",\"title\":\"Operations Cost Review\"},\"doc-south-expansion-memo\":{\"path\":\"releases/rel-002-44c0bbfc/doc-south-expansion-memo.html\",\"sha256\":\"ea0a575c718eb11bfe9aca4fd97e52bf83dc741368f129169cfd190e8b9c33e0\",\"title\":\"South Expansion Memo\"}},\"authority_at_issue\":{\"reviewer_id\":\"person-sam\",\"reviewer_name\":\"Sam Oyelaran\",\"team_id\":\"team-operations-review\"},\"content_hash\":\"44c0bbfca0cd633cb833f35ecbfab8f4c3ee2a9a272812cf7a0c16dfbb442020\",\"dataset_sha\":\"9f32c90244987bb5bc6c4fb4dbed63dd8f5ef9a0552f09bba62b3edd7ad2b6aa\",\"disposition\":\"RETURN_FOR_REVIEW\",\"execution_fingerprint\":\"1849d1776c1d9f81960e346f6bc5a5995e6b45fd4e2b4eb3f4f570fb380e9520\",\"interpreted_goal\":\"RETAIN_CHEAPER_CLAIM\",\"issued_at\":\"2026-10-16T17:39:50+00:00\",\"issued_by\":\"person-sam\",\"membership_sha\":\"83666619c13d69e7e370428a2b44be11fe98624cb9d7e6fd540e37891b0ccdc5\",\"operation_id\":\"plan-case-dispatch-b09-b11-v2-issue\",\"plan_id\":\"plan-case-dispatch-b09-b11-v2\",\"plan_version\":2,\"raw_request\":\"Update the reports, but keep South as the cheaper option in the rollout memo.\",\"release_id\":\"rel-002-44c0bbfc\",\"verification\":{\"checks\":[{\"detail\":\"recorded 9f32c90244987bb5bc6c4fb4dbed63dd8f5ef9a0552f09bba62b3edd7ad2b6aa\",\"name\":\"dataset_bytes_unchanged\",\"passed\":true},{\"detail\":\"15 rows\",\"name\":\"dataset_row_count\",\"passed\":true},{\"detail\":\"\",\"name\":\"membership_costs_match_csv\",\"passed\":true},{\"detail\":\"4 vs 4, min 4\",\"name\":\"minimum_sample_satisfied\",\"passed\":true},{\"detail\":\"issued ['doc-operations-cost-review', 'doc-south-expansion-memo']\",\"name\":\"all_registered_documents_issued\",\"passed\":true},{\"detail\":\"actual 626caeddad2366b8ce869ff67feec4a6ba6ae0ac18826baa9c7a8e19b9670468\",\"name\":\"doc-operations-cost-review:hash_matches_approved\",\"passed\":true},{\"detail\":\"1 rendered, 1 registered\",\"name\":\"doc-operations-cost-review:registered_card_count\",\"passed\":true},{\"detail\":\"found 'South costs $0.40 more per parcel than North.', expected 'South costs $0.40 more per parcel than North.'\",\"name\":\"doc-operations-cost-review:ops-finding-cost:assertion\",\"passed\":true},{\"detail\":\"found HIGHER_COST\",\"name\":\"doc-operations-cost-review:ops-finding-cost:typed_relation\",\"passed\":true},{\"detail\":\"found 40\",\"name\":\"doc-operations-cost-review:ops-finding-cost:typed_magnitude\",\"passed\":true},{\"detail\":\"found USD_PER_PARCEL\",\"name\":\"doc-operations-cost-review:ops-finding-cost:unit\",\"passed\":true},{\"detail\":\"\",\"name\":\"doc-operations-cost-review:ops-finding-cost:occurrence_identity\",\"passed\":true},{\"detail\":\"found claim-south-vs-north-cost\",\"name\":\"doc-operations-cost-review:ops-finding-cost:claim_identity\",\"passed\":true},{\"detail\":\"found [('North', 'mean $4.00 per parcel over 4 batches'), ('South', 'mean $4.40 per parcel over 4 batches'), ('Evidence', 'cmp-north-south-mean-cost · dataset ds-parcel-cost-2026Q3 · minimum 4 batches per side')]\",\"name\":\"doc-operations-cost-review:ops-finding-cost:evidence_rows\",\"passed\":true},{\"detail\":\"searched the file for the contradicted sentence 'South costs $0.40 less per parcel than North.'\",\"name\":\"doc-operations-cost-review:ops-finding-cost:no_lower_cost\",\"passed\":true},{\"detail\":\"searched the file for the contradicted sentence 'South and North have equal mean cost per parcel.'\",\"name\":\"doc-operations-cost-review:ops-finding-cost:no_equal_cost\",\"passed\":true},{\"detail\":\"found 3 paragraphs, expected 3: ['This recurring review compares mean handling cost per parcel across the North, South and Pilot lanes for the 2026 Q3 synthetic batch set.', 'All figures are descriptive. Batches carry equal analytical weight and no causal savings estimate is made.', 'Editorial context — not assessed by ResultRipple.']\",\"name\":\"doc-operations-cost-review:ops-intro:narrative_unchanged\",\"passed\":true},{\"detail\":\"narrative labelled unassessed: found data-assessed=false\",\"name\":\"doc-operations-cost-review:ops-intro:scope_label\",\"passed\":true},{\"detail\":\"found 3 paragraphs, expected 3: ['Each batch contributes one integer cost in cents per parcel. A lane enters the comparison only with at least four batches, which is a declared demo policy rather than a significance test.', 'Lane membership reflects the current effective assignment recorded in the operations graph, which can differ from the lane originally written on the dispatch record.', 'Editorial context — not assessed by ResultRipple.']\",\"name\":\"doc-operations-cost-review:ops-method:narrative_unchanged\",\"passed\":true},{\"detail\":\"narrative labelled unassessed: found data-assessed=false\",\"name\":\"doc-operations-cost-review:ops-method:scope_label\",\"passed\":true},{\"detail\":\"\",\"name\":\"doc-operations-cost-review:no_unexpected_decision_block\",\"passed\":true},{\"detail\":\"found 9f32c90244987bb5bc6c4fb4dbed63dd8f5ef9a0552f09bba62b3edd7ad2b6aa\",\"name\":\"doc-operations-cost-review:dataset_metadata\",\"passed\":true},{\"detail\":\"\",\"name\":\"doc-operations-cost-review:document_metadata\",\"passed\":true},{\"detail\":\"actual ea0a575c718eb11bfe9aca4fd97e52bf83dc741368f129169cfd190e8b9c33e0\",\"name\":\"doc-south-expansion-memo:hash_matches_approved\",\"passed\":true},{\"detail\":\"1 rendered, 1 registered\",\"name\":\"doc-south-expansion-memo:registered_card_count\",\"passed\":true},{\"detail\":\"found 'South is 40 cents more expensive per parcel than North.', expected 'South is 40 cents more expensive per parcel than North.'\",\"name\":\"doc-south-expansion-memo:memo-finding-cost:assertion\",\"passed\":true},{\"detail\":\"found HIGHER_COST\",\"name\":\"doc-south-expansion-memo:memo-finding-cost:typed_relation\",\"passed\":true},{\"detail\":\"found 40\",\"name\":\"doc-south-expansion-memo:memo-finding-cost:typed_magnitude\",\"passed\":true},{\"detail\":\"found CENTS_PER_PARCEL\",\"name\":\"doc-south-expansion-memo:memo-finding-cost:unit\",\"passed\":true},{\"detail\":\"\",\"name\":\"doc-south-expansion-memo:memo-finding-cost:occurrence_identity\",\"passed\":true},{\"detail\":\"found claim-south-vs-north-cost\",\"name\":\"doc-south-expansion-memo:memo-finding-cost:claim_identity\",\"passed\":true},{\"detail\":\"found [('North', 'mean 400 cents per parcel over 4 batches'), ('South', 'mean 440 cents per parcel over 4 batches'), ('Evidence', 'cmp-north-south-mean-cost · dataset ds-parcel-cost-2026Q3 · minimum 4 batches per side')]\",\"name\":\"doc-south-expansion-memo:memo-finding-cost:evidence_rows\",\"passed\":true},{\"detail\":\"searched the file for the contradicted sentence 'South is 40 cents cheaper per parcel than North.'\",\"name\":\"doc-south-expansion-memo:memo-finding-cost:no_lower_cost\",\"passed\":true},{\"detail\":\"searched the file for the contradicted sentence 'South and North have equal mean cost per parcel.'\",\"name\":\"doc-south-expansion-memo:memo-finding-cost:no_equal_cost\",\"passed\":true},{\"detail\":\"found 2 paragraphs, expected 2: ['This memo summarises the recorded cost case for the proposed South lane expansion, for the Operations Review team.', 'Editorial context — not assessed by ResultRipple.']\",\"name\":\"doc-south-expansion-memo:memo-intro:narrative_unchanged\",\"passed\":true},{\"detail\":\"narrative labelled unassessed: found data-assessed=false\",\"name\":\"doc-south-expansion-memo:memo-intro:scope_label\",\"passed\":true},{\"detail\":\"found 3 paragraphs, expected 3: ['Capacity, hiring lead time and depot availability were raised in the planning session and are not analysed here.', 'Nothing in this section has been assessed against the linked evidence.', 'Editorial context — not assessed by ResultRipple.']\",\"name\":\"doc-south-expansion-memo:memo-outlook:narrative_unchanged\",\"passed\":true},{\"detail\":\"narrative labelled unassessed: found data-assessed=false\",\"name\":\"doc-south-expansion-memo:memo-outlook:scope_label\",\"passed\":true},{\"detail\":\"\",\"name\":\"doc-south-expansion-memo:decision_block_present\",\"passed\":true},{\"detail\":\"found RETURNED_FOR_REVIEW\",\"name\":\"doc-south-expansion-memo:decision_status\",\"passed\":true},{\"detail\":\"\",\"name\":\"doc-south-expansion-memo:decision_identity\",\"passed\":true},{\"detail\":\"basis claim-south-vs-north-cost, placed ['claim-south-vs-north-cost']\",\"name\":\"doc-south-expansion-memo:decision_basis_placed\",\"passed\":true},{\"detail\":\"found ['South lane expansion proposal — Returned for review', 'Recorded basis: the linked finding above (claim-south-vs-north-cost). ResultRipple records the disposition of this proposal; it does not decide it.']\",\"name\":\"doc-south-expansion-memo:decision_lines\",\"passed\":true},{\"detail\":\"found 9f32c90244987bb5bc6c4fb4dbed63dd8f5ef9a0552f09bba62b3edd7ad2b6aa\",\"name\":\"doc-south-expansion-memo:dataset_metadata\",\"passed\":true},{\"detail\":\"\",\"name\":\"doc-south-expansion-memo:document_metadata\",\"passed\":true}],\"derived\":{\"left\":{\"count\":4,\"lane_id\":\"lane-north\",\"mean_cents\":\"400\",\"total_cents\":1600},\"magnitude_cents\":40,\"relation\":\"HIGHER_COST\",\"right\":{\"count\":4,\"lane_id\":\"lane-south\",\"mean_cents\":\"440\",\"total_cents\":1760}},\"hashes\":{\"doc-operations-cost-review\":\"626caeddad2366b8ce869ff67feec4a6ba6ae0ac18826baa9c7a8e19b9670468\",\"doc-south-expansion-memo\":\"ea0a575c718eb11bfe9aca4fd97e52bf83dc741368f129169cfd190e8b9c33e0\"},\"ok\":true},\"verification_scope\":\"Two registered finding occurrences and one typed decision-status block checked. Editorial narrative not assessed by ResultRipple.\"}",
    "occurrence_snapshots": "[{\"block_id\":\"ops-finding-cost\",\"card_style\":\"DOLLARS\",\"current\":{\"card_style\":\"DOLLARS\",\"hold_reason\":null,\"magnitude_cents\":40,\"reference\":\"North\",\"relation\":\"HIGHER_COST\",\"subject\":\"South\",\"text\":\"South costs $0.40 more per parcel than North.\",\"unit\":\"USD_PER_PARCEL\"},\"document_id\":\"doc-operations-cost-review\",\"magnitude_changed\":false,\"occurrence_id\":\"occ-ops-cost-finding\",\"previous\":{\"card_style\":\"DOLLARS\",\"hold_reason\":null,\"magnitude_cents\":40,\"reference\":\"North\",\"relation\":\"LOWER_COST\",\"subject\":\"South\",\"text\":\"South costs $0.40 less per parcel than North.\",\"unit\":\"USD_PER_PARCEL\"},\"relation_changed\":true},{\"block_id\":\"memo-finding-cost\",\"card_style\":\"CENTS\",\"current\":{\"card_style\":\"CENTS\",\"hold_reason\":null,\"magnitude_cents\":40,\"reference\":\"North\",\"relation\":\"HIGHER_COST\",\"subject\":\"South\",\"text\":\"South is 40 cents more expensive per parcel than North.\",\"unit\":\"CENTS_PER_PARCEL\"},\"document_id\":\"doc-south-expansion-memo\",\"magnitude_changed\":false,\"occurrence_id\":\"occ-memo-cost-finding\",\"previous\":{\"card_style\":\"CENTS\",\"hold_reason\":null,\"magnitude_cents\":40,\"reference\":\"North\",\"relation\":\"LOWER_COST\",\"subject\":\"South\",\"text\":\"South is 40 cents cheaper per parcel than North.\",\"unit\":\"CENTS_PER_PARCEL\"},\"relation_changed\":true}]",
    "operation_id": "plan-case-dispatch-b09-b11-v2-issue",
    "plan_id": "plan-case-dispatch-b09-b11-v2",
    "plan_version": 2,
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
      "issued_at": "2026-10-16T17:38:51+00:00",
      "artifacts": "{\"doc-operations-cost-review\":{\"path\":\"releases/rel-001-c004be61/doc-operations-cost-review.html\",\"sha256\":\"5a670a69c226980325af01e1e0a5e407b473865950472a2412dcafa7f387cc26\",\"title\":\"Operations Cost Review\"},\"doc-south-expansion-memo\":{\"path\":\"releases/rel-001-c004be61/doc-south-expansion-memo.html\",\"sha256\":\"93c8b9dbaafd39b3523005b0d5bb0c71140eda57f869b0bf5d76668d26955a9c\",\"title\":\"South Expansion Memo\"}}",
      "is_current": false
    },
    {
      "release_id": "rel-002-44c0bbfc",
      "sequence": 2,
      "issued_at": "2026-10-16T17:39:50+00:00",
      "artifacts": "{\"doc-operations-cost-review\":{\"path\":\"releases/rel-002-44c0bbfc/doc-operations-cost-review.html\",\"sha256\":\"626caeddad2366b8ce869ff67feec4a6ba6ae0ac18826baa9c7a8e19b9670468\",\"title\":\"Operations Cost Review\"},\"doc-south-expansion-memo\":{\"path\":\"releases/rel-002-44c0bbfc/doc-south-expansion-memo.html\",\"sha256\":\"ea0a575c718eb11bfe9aca4fd97e52bf83dc741368f129169cfd190e8b9c33e0\",\"title\":\"South Expansion Memo\"}}",
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

// The real records carry more fields, and wider literals, than the client types.
const planV1 = {
  "plan_id": "plan-case-dispatch-b09-b11-v1",
  "version": 1,
  "status": "SUPERSEDED",
  "raw_request": "Update the reports, but keep South as the cheaper option in the rollout memo.",
  "goal": "RETAIN_CHEAPER_CLAIM",
  "alternative_flag": true,
  "disposition": "RETURN_FOR_REVIEW",
  "note": "South is higher cost per inspection insp-9c490fc0c6452e29",
  "content_hash": "44c0bbfca0cd633cb833f35ecbfab8f4c3ee2a9a272812cf7a0c16dfbb442020",
  "execution_fingerprint": "c746cf8987f6e0c075db0ee6154056385eb52772a6fd196d40bf019e279c559f",
  "candidates": {
    "doc-operations-cost-review": "626caeddad2366b8ce869ff67feec4a6ba6ae0ac18826baa9c7a8e19b9670468",
    "doc-south-expansion-memo": "ea0a575c718eb11bfe9aca4fd97e52bf83dc741368f129169cfd190e8b9c33e0"
  },
  "scope": {
    "assessment": [
      {
        "block_id": "ops-finding-cost",
        "card_style": "DOLLARS",
        "current": {
          "card_style": "DOLLARS",
          "hold_reason": null,
          "magnitude_cents": 40,
          "reference": "North",
          "relation": "HIGHER_COST",
          "subject": "South",
          "text": "South costs $0.40 more per parcel than North.",
          "unit": "USD_PER_PARCEL"
        },
        "document_id": "doc-operations-cost-review",
        "magnitude_changed": false,
        "occurrence_id": "occ-ops-cost-finding",
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
        "relation_changed": true
      },
      {
        "block_id": "memo-finding-cost",
        "card_style": "CENTS",
        "current": {
          "card_style": "CENTS",
          "hold_reason": null,
          "magnitude_cents": 40,
          "reference": "North",
          "relation": "HIGHER_COST",
          "subject": "South",
          "text": "South is 40 cents more expensive per parcel than North.",
          "unit": "CENTS_PER_PARCEL"
        },
        "document_id": "doc-south-expansion-memo",
        "magnitude_changed": false,
        "occurrence_id": "occ-memo-cost-finding",
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
        "relation_changed": true
      }
    ],
    "authority": {
      "reviewer_id": "person-noor",
      "reviewer_name": "Noor Haddad",
      "team_id": "team-operations-review",
      "team_name": "Operations Review"
    },
    "comparison": {
      "comparison_id": "cmp-north-south-mean-cost",
      "dataset_id": "ds-parcel-cost-2026Q3",
      "left_lane_id": "lane-north",
      "left_lane_name": "North",
      "min_n": 4,
      "owner_id": "person-ari",
      "owner_name": "Ari Mensah",
      "right_lane_id": "lane-south",
      "right_lane_name": "South"
    },
    "dataset_sha": "9f32c90244987bb5bc6c4fb4dbed63dd8f5ef9a0552f09bba62b3edd7ad2b6aa",
    "decision": {
      "basis_claim_id": "claim-south-vs-north-cost",
      "current_status": "PROPOSED",
      "decision_id": "dec-south-expansion",
      "expected_status": "RETURNED_FOR_REVIEW",
      "title": "South lane expansion proposal"
    },
    "documents": [
      {
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
        "document_id": "doc-operations-cost-review",
        "owner_id": "person-ari",
        "owner_name": "Ari Mensah",
        "source_revision": 1,
        "source_sha": "72f36c5d0b3b1d383901d28095c3364c84f28af956ea726120cde56f6c0d327a",
        "title": "Operations Cost Review"
      },
      {
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
        "document_id": "doc-south-expansion-memo",
        "owner_id": "person-sam",
        "owner_name": "Sam Oyelaran",
        "source_revision": 1,
        "source_sha": "49058b0d21036cc067090941df01c5365a008aed72ed2f6b0d88a3385a8512d8",
        "title": "South Expansion Memo"
      }
    ],
    "memberships": [
      [
        "B01",
        "lane-north",
        380
      ],
      [
        "B02",
        "lane-north",
        400
      ],
      [
        "B03",
        "lane-north",
        420
      ],
      [
        "B04",
        "lane-north",
        400
      ],
      [
        "B05",
        "lane-south",
        420
      ],
      [
        "B06",
        "lane-south",
        440
      ],
      [
        "B07",
        "lane-south",
        460
      ],
      [
        "B08",
        "lane-south",
        440
      ],
      [
        "B09",
        "lane-pilot",
        240
      ],
      [
        "B10",
        "lane-pilot",
        250
      ],
      [
        "B11",
        "lane-pilot",
        270
      ],
      [
        "B12",
        "lane-pilot",
        250
      ],
      [
        "B13",
        "lane-pilot",
        260
      ],
      [
        "B14",
        "lane-pilot",
        240
      ],
      [
        "B15",
        "lane-pilot",
        250
      ]
    ],
    "occurrences": [
      {
        "block_id": "ops-finding-cost",
        "card_style": "DOLLARS",
        "claim_id": "claim-south-vs-north-cost",
        "document_id": "doc-operations-cost-review",
        "occurrence_id": "occ-ops-cost-finding"
      },
      {
        "block_id": "memo-finding-cost",
        "card_style": "CENTS",
        "claim_id": "claim-south-vs-north-cost",
        "document_id": "doc-south-expansion-memo",
        "occurrence_id": "occ-memo-cost-finding"
      }
    ],
    "requested_focus": [],
    "result": {
      "comparison_id": "cmp-north-south-mean-cost",
      "hold_reason": null,
      "left": {
        "batch_count": 4,
        "lane_id": "lane-north",
        "lane_name": "North",
        "mean_denominator": 1,
        "mean_display_cents": 400,
        "mean_numerator": 400,
        "total_cents": 1600
      },
      "magnitude_cents": 40,
      "metric_key": "MEAN_COST_V1",
      "relation": "HIGHER_COST",
      "right": {
        "batch_count": 4,
        "lane_id": "lane-south",
        "lane_name": "South",
        "mean_denominator": 1,
        "mean_display_cents": 440,
        "mean_numerator": 440,
        "total_cents": 1760
      }
    },
    "verification_scope": "Two registered finding occurrences and one typed decision-status block checked. Editorial narrative not assessed by ResultRipple."
  },
  "context_revision": 3,
  "prior_release_id": "rel-001-c004be61",
  "staged_at": "2026-10-16T17:39:24+00:00",
  "staged_by": "agent-of:person-ari",
  "approved_at": "2026-10-16T17:39:31+00:00",
  "acknowledged_alternative": true,
  "invalidation_reason": "AUTHORITY_CHANGED",
  "superseded_by": "plan-case-dispatch-b09-b11-v2",
  "refused_action": "RELEASE",
  "refused_at": "2026-10-16T17:39:42+00:00",
  "idempotency_key": "job-f435351169a7:insp-9c490fc0c6452e29-return",
  "case_id": "case-dispatch-b09-b11",
  "approved_by": "person-noor",
  "assigned_reviewer_id": "person-noor",
  "assigned_reviewer_name": "Noor Haddad",
  "covered_occurrence_ids": [
    "occ-memo-cost-finding",
    "occ-ops-cost-finding"
  ]
};
export const PLAN_V1_FINISHED = planV1 as unknown as Plan;

const planV2 = {
  "plan_id": "plan-case-dispatch-b09-b11-v2",
  "version": 2,
  "status": "ISSUED",
  "raw_request": "Update the reports, but keep South as the cheaper option in the rollout memo.",
  "goal": "RETAIN_CHEAPER_CLAIM",
  "alternative_flag": true,
  "disposition": "RETURN_FOR_REVIEW",
  "note": "South is higher cost per inspection insp-9c490fc0c6452e29",
  "content_hash": "44c0bbfca0cd633cb833f35ecbfab8f4c3ee2a9a272812cf7a0c16dfbb442020",
  "execution_fingerprint": "1849d1776c1d9f81960e346f6bc5a5995e6b45fd4e2b4eb3f4f570fb380e9520",
  "candidates": {
    "doc-operations-cost-review": "626caeddad2366b8ce869ff67feec4a6ba6ae0ac18826baa9c7a8e19b9670468",
    "doc-south-expansion-memo": "ea0a575c718eb11bfe9aca4fd97e52bf83dc741368f129169cfd190e8b9c33e0"
  },
  "scope": {
    "assessment": [
      {
        "block_id": "ops-finding-cost",
        "card_style": "DOLLARS",
        "current": {
          "card_style": "DOLLARS",
          "hold_reason": null,
          "magnitude_cents": 40,
          "reference": "North",
          "relation": "HIGHER_COST",
          "subject": "South",
          "text": "South costs $0.40 more per parcel than North.",
          "unit": "USD_PER_PARCEL"
        },
        "document_id": "doc-operations-cost-review",
        "magnitude_changed": false,
        "occurrence_id": "occ-ops-cost-finding",
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
        "relation_changed": true
      },
      {
        "block_id": "memo-finding-cost",
        "card_style": "CENTS",
        "current": {
          "card_style": "CENTS",
          "hold_reason": null,
          "magnitude_cents": 40,
          "reference": "North",
          "relation": "HIGHER_COST",
          "subject": "South",
          "text": "South is 40 cents more expensive per parcel than North.",
          "unit": "CENTS_PER_PARCEL"
        },
        "document_id": "doc-south-expansion-memo",
        "magnitude_changed": false,
        "occurrence_id": "occ-memo-cost-finding",
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
        "relation_changed": true
      }
    ],
    "authority": {
      "reviewer_id": "person-sam",
      "reviewer_name": "Sam Oyelaran",
      "team_id": "team-operations-review",
      "team_name": "Operations Review"
    },
    "comparison": {
      "comparison_id": "cmp-north-south-mean-cost",
      "dataset_id": "ds-parcel-cost-2026Q3",
      "left_lane_id": "lane-north",
      "left_lane_name": "North",
      "min_n": 4,
      "owner_id": "person-ari",
      "owner_name": "Ari Mensah",
      "right_lane_id": "lane-south",
      "right_lane_name": "South"
    },
    "dataset_sha": "9f32c90244987bb5bc6c4fb4dbed63dd8f5ef9a0552f09bba62b3edd7ad2b6aa",
    "decision": {
      "basis_claim_id": "claim-south-vs-north-cost",
      "current_status": "PROPOSED",
      "decision_id": "dec-south-expansion",
      "expected_status": "RETURNED_FOR_REVIEW",
      "title": "South lane expansion proposal"
    },
    "documents": [
      {
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
        "document_id": "doc-operations-cost-review",
        "owner_id": "person-ari",
        "owner_name": "Ari Mensah",
        "source_revision": 1,
        "source_sha": "72f36c5d0b3b1d383901d28095c3364c84f28af956ea726120cde56f6c0d327a",
        "title": "Operations Cost Review"
      },
      {
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
        "document_id": "doc-south-expansion-memo",
        "owner_id": "person-sam",
        "owner_name": "Sam Oyelaran",
        "source_revision": 1,
        "source_sha": "49058b0d21036cc067090941df01c5365a008aed72ed2f6b0d88a3385a8512d8",
        "title": "South Expansion Memo"
      }
    ],
    "memberships": [
      [
        "B01",
        "lane-north",
        380
      ],
      [
        "B02",
        "lane-north",
        400
      ],
      [
        "B03",
        "lane-north",
        420
      ],
      [
        "B04",
        "lane-north",
        400
      ],
      [
        "B05",
        "lane-south",
        420
      ],
      [
        "B06",
        "lane-south",
        440
      ],
      [
        "B07",
        "lane-south",
        460
      ],
      [
        "B08",
        "lane-south",
        440
      ],
      [
        "B09",
        "lane-pilot",
        240
      ],
      [
        "B10",
        "lane-pilot",
        250
      ],
      [
        "B11",
        "lane-pilot",
        270
      ],
      [
        "B12",
        "lane-pilot",
        250
      ],
      [
        "B13",
        "lane-pilot",
        260
      ],
      [
        "B14",
        "lane-pilot",
        240
      ],
      [
        "B15",
        "lane-pilot",
        250
      ]
    ],
    "occurrences": [
      {
        "block_id": "ops-finding-cost",
        "card_style": "DOLLARS",
        "claim_id": "claim-south-vs-north-cost",
        "document_id": "doc-operations-cost-review",
        "occurrence_id": "occ-ops-cost-finding"
      },
      {
        "block_id": "memo-finding-cost",
        "card_style": "CENTS",
        "claim_id": "claim-south-vs-north-cost",
        "document_id": "doc-south-expansion-memo",
        "occurrence_id": "occ-memo-cost-finding"
      }
    ],
    "requested_focus": [],
    "result": {
      "comparison_id": "cmp-north-south-mean-cost",
      "hold_reason": null,
      "left": {
        "batch_count": 4,
        "lane_id": "lane-north",
        "lane_name": "North",
        "mean_denominator": 1,
        "mean_display_cents": 400,
        "mean_numerator": 400,
        "total_cents": 1600
      },
      "magnitude_cents": 40,
      "metric_key": "MEAN_COST_V1",
      "relation": "HIGHER_COST",
      "right": {
        "batch_count": 4,
        "lane_id": "lane-south",
        "lane_name": "South",
        "mean_denominator": 1,
        "mean_display_cents": 440,
        "mean_numerator": 440,
        "total_cents": 1760
      }
    },
    "verification_scope": "Two registered finding occurrences and one typed decision-status block checked. Editorial narrative not assessed by ResultRipple."
  },
  "context_revision": 4,
  "prior_release_id": "rel-001-c004be61",
  "staged_at": "2026-10-16T17:39:42+00:00",
  "staged_by": "person-noor",
  "approved_at": "2026-10-16T17:39:49+00:00",
  "acknowledged_alternative": true,
  "invalidation_reason": null,
  "superseded_by": null,
  "refused_action": null,
  "refused_at": null,
  "idempotency_key": "refresh-plan-case-dispatch-b09-b11-v2",
  "case_id": "case-dispatch-b09-b11",
  "approved_by": "person-sam",
  "assigned_reviewer_id": "person-sam",
  "assigned_reviewer_name": "Sam Oyelaran",
  "covered_occurrence_ids": [
    "occ-memo-cost-finding",
    "occ-ops-cost-finding"
  ]
};
export const PLAN_V2_FINISHED = planV2 as unknown as Plan;

export const AGENT_JOB_FINISHED: AgentJob = {
  "job_id": "job-f435351169a7",
  "status": "AWAITING_REVIEW",
  "request_text": "Update the reports, but keep South as the cheaper option in the rollout memo.",
  "requested_by": "person-ari",
  "model": "nvidia/nemotron-3-super-120b-a12b",
  "endpoint": "https://integrate.api.nvidia.com/v1",
  "reasoning": false,
  "started_at": "2026-10-16T17:39:15+00:00",
  "finished_at": "2026-10-16T17:39:24+00:00",
  "events": [
    {
      "at": "2026-10-16T17:39:16+00:00",
      "context_revision": 3,
      "kind": "context",
      "summary": "loaded case case-dispatch-b09-b11 at context revision 3 from FalkorDB"
    },
    {
      "at": "2026-10-16T17:39:18+00:00",
      "content_chars": 0,
      "elapsed_ms": 2297,
      "finish_reason": "tool_calls",
      "kind": "model",
      "requested_tools": [
        "inspect_impact"
      ],
      "turn": 1,
      "usage": {
        "completion_tokens": 49,
        "prompt_tokens": 2552,
        "reasoning_tokens": 0,
        "total_tokens": 2601
      }
    },
    {
      "at": "2026-10-16T17:39:18+00:00",
      "kind": "tool_start",
      "tool": "inspect_impact"
    },
    {
      "arguments": {
        "case_id": "case-dispatch-b09-b11",
        "expected_context_revision": 3
      },
      "at": "2026-10-16T17:39:18+00:00",
      "code": null,
      "elapsed_ms": 15,
      "kind": "tool",
      "ok": true,
      "summary": "2 registered occurrences across 2 documents; current relation HIGHER_COST",
      "tool": "inspect_impact"
    },
    {
      "at": "2026-10-16T17:39:24+00:00",
      "content_chars": 0,
      "elapsed_ms": 5602,
      "finish_reason": "tool_calls",
      "kind": "model",
      "requested_tools": [
        "stage_review"
      ],
      "turn": 2,
      "usage": {
        "completion_tokens": 238,
        "prompt_tokens": 5784,
        "reasoning_tokens": 0,
        "total_tokens": 6022
      }
    },
    {
      "at": "2026-10-16T17:39:24+00:00",
      "kind": "tool_start",
      "tool": "stage_review"
    },
    {
      "arguments": {
        "alternative_flag": true,
        "case_id": "case-dispatch-b09-b11",
        "disposition": "RETURN_FOR_REVIEW",
        "goal": "RETAIN_CHEAPER_CLAIM",
        "idempotency_key": "insp-9c490fc0c6452e29-return",
        "inspection_id": "insp-9c490fc0c6452e29",
        "note": "South is higher cost per inspection insp-9c490fc0c6452e29",
        "requested_keep_target": "COST_CLAIM"
      },
      "at": "2026-10-16T17:39:24+00:00",
      "code": null,
      "elapsed_ms": 96,
      "kind": "tool",
      "ok": true,
      "summary": "staged plan-case-dispatch-b09-b11-v1 v1 covering 2 occurrences for person-noor",
      "tool": "stage_review"
    }
  ],
  "usage": {
    "completion_tokens": 238,
    "prompt_tokens": 5784,
    "reasoning_tokens": 0,
    "total_tokens": 6022
  },
  "tool_call_count": 2,
  "model_turn_count": 2,
  "elapsed_ms": 8552,
  "plan_id": "plan-case-dispatch-b09-b11-v1",
  "error_code": null,
  "error_detail": null,
  "clarification_question": null,
  "clarification_field": null,
  "case_id": "case-dispatch-b09-b11",
  "terminal": true
};

export const RECEIPTS_FINISHED: Record<string, Record<string, unknown>> = {
  "rel-001-c004be61": {
    "acknowledged_alternative": false,
    "alternative_proposed": false,
    "approved_at": "2026-10-16T17:38:51+00:00",
    "approved_by": "person-noor",
    "approved_context_revision": 1,
    "artifacts": {
      "doc-operations-cost-review": {
        "path": "releases/rel-001-c004be61/doc-operations-cost-review.html",
        "sha256": "5a670a69c226980325af01e1e0a5e407b473865950472a2412dcafa7f387cc26",
        "title": "Operations Cost Review"
      },
      "doc-south-expansion-memo": {
        "path": "releases/rel-001-c004be61/doc-south-expansion-memo.html",
        "sha256": "93c8b9dbaafd39b3523005b0d5bb0c71140eda57f869b0bf5d76668d26955a9c",
        "title": "South Expansion Memo"
      }
    },
    "authority_at_issue": {
      "reviewer_id": "person-noor",
      "reviewer_name": "Noor Haddad",
      "team_id": "team-operations-review"
    },
    "content_hash": "c004be615274f87ba5f2cc24aa95d065f5d48af6fae70d578b639ebc6c5a0545",
    "dataset_sha": "9f32c90244987bb5bc6c4fb4dbed63dd8f5ef9a0552f09bba62b3edd7ad2b6aa",
    "disposition": "NO_CHANGE",
    "execution_fingerprint": "14b1294c01e9616c9490523e54f7970d3f60c1af9ff411ccff93c34201266bf4",
    "interpreted_goal": "CORRECT_FACTS",
    "issued_at": "2026-10-16T17:38:51+00:00",
    "issued_by": "person-noor",
    "membership_sha": "929767228468c45303e6e3f906e54e0a9bbcac8d64f4d5b5897f5523dac85192",
    "operation_id": "demo-setup-v1-release",
    "plan_id": "plan-case-initial-publication-v1",
    "plan_version": 1,
    "raw_request": "Demo setup: issue the initial editions from the seeded evidence.",
    "release_id": "rel-001-c004be61",
    "verification": {
      "checks": [
        {
          "detail": "recorded 9f32c90244987bb5bc6c4fb4dbed63dd8f5ef9a0552f09bba62b3edd7ad2b6aa",
          "name": "dataset_bytes_unchanged",
          "passed": true
        },
        {
          "detail": "15 rows",
          "name": "dataset_row_count",
          "passed": true
        },
        {
          "detail": "",
          "name": "membership_costs_match_csv",
          "passed": true
        },
        {
          "detail": "4 vs 7, min 4",
          "name": "minimum_sample_satisfied",
          "passed": true
        },
        {
          "detail": "issued ['doc-operations-cost-review', 'doc-south-expansion-memo']",
          "name": "all_registered_documents_issued",
          "passed": true
        },
        {
          "detail": "actual 5a670a69c226980325af01e1e0a5e407b473865950472a2412dcafa7f387cc26",
          "name": "doc-operations-cost-review:hash_matches_approved",
          "passed": true
        },
        {
          "detail": "1 rendered, 1 registered",
          "name": "doc-operations-cost-review:registered_card_count",
          "passed": true
        },
        {
          "detail": "found 'South costs $0.40 less per parcel than North.', expected 'South costs $0.40 less per parcel than North.'",
          "name": "doc-operations-cost-review:ops-finding-cost:assertion",
          "passed": true
        },
        {
          "detail": "found LOWER_COST",
          "name": "doc-operations-cost-review:ops-finding-cost:typed_relation",
          "passed": true
        },
        {
          "detail": "found 40",
          "name": "doc-operations-cost-review:ops-finding-cost:typed_magnitude",
          "passed": true
        },
        {
          "detail": "found USD_PER_PARCEL",
          "name": "doc-operations-cost-review:ops-finding-cost:unit",
          "passed": true
        },
        {
          "detail": "",
          "name": "doc-operations-cost-review:ops-finding-cost:occurrence_identity",
          "passed": true
        },
        {
          "detail": "found claim-south-vs-north-cost",
          "name": "doc-operations-cost-review:ops-finding-cost:claim_identity",
          "passed": true
        },
        {
          "detail": "found [('North', 'mean $4.00 per parcel over 4 batches'), ('South', 'mean $3.60 per parcel over 7 batches'), ('Evidence', 'cmp-north-south-mean-cost · dataset ds-parcel-cost-2026Q3 · minimum 4 batches per side')]",
          "name": "doc-operations-cost-review:ops-finding-cost:evidence_rows",
          "passed": true
        },
        {
          "detail": "searched the file for the contradicted sentence 'South costs $0.40 more per parcel than North.'",
          "name": "doc-operations-cost-review:ops-finding-cost:no_higher_cost",
          "passed": true
        },
        {
          "detail": "searched the file for the contradicted sentence 'South and North have equal mean cost per parcel.'",
          "name": "doc-operations-cost-review:ops-finding-cost:no_equal_cost",
          "passed": true
        },
        {
          "detail": "found 3 paragraphs, expected 3: ['This recurring review compares mean handling cost per parcel across the North, South and Pilot lanes for the 2026 Q3 synthetic batch set.', 'All figures are descriptive. Batches carry equal analytical weight and no causal savings estimate is made.', 'Editorial context — not assessed by ResultRipple.']",
          "name": "doc-operations-cost-review:ops-intro:narrative_unchanged",
          "passed": true
        },
        {
          "detail": "narrative labelled unassessed: found data-assessed=false",
          "name": "doc-operations-cost-review:ops-intro:scope_label",
          "passed": true
        },
        {
          "detail": "found 3 paragraphs, expected 3: ['Each batch contributes one integer cost in cents per parcel. A lane enters the comparison only with at least four batches, which is a declared demo policy rather than a significance test.', 'Lane membership reflects the current effective assignment recorded in the operations graph, which can differ from the lane originally written on the dispatch record.', 'Editorial context — not assessed by ResultRipple.']",
          "name": "doc-operations-cost-review:ops-method:narrative_unchanged",
          "passed": true
        },
        {
          "detail": "narrative labelled unassessed: found data-assessed=false",
          "name": "doc-operations-cost-review:ops-method:scope_label",
          "passed": true
        },
        {
          "detail": "",
          "name": "doc-operations-cost-review:no_unexpected_decision_block",
          "passed": true
        },
        {
          "detail": "found 9f32c90244987bb5bc6c4fb4dbed63dd8f5ef9a0552f09bba62b3edd7ad2b6aa",
          "name": "doc-operations-cost-review:dataset_metadata",
          "passed": true
        },
        {
          "detail": "",
          "name": "doc-operations-cost-review:document_metadata",
          "passed": true
        },
        {
          "detail": "actual 93c8b9dbaafd39b3523005b0d5bb0c71140eda57f869b0bf5d76668d26955a9c",
          "name": "doc-south-expansion-memo:hash_matches_approved",
          "passed": true
        },
        {
          "detail": "1 rendered, 1 registered",
          "name": "doc-south-expansion-memo:registered_card_count",
          "passed": true
        },
        {
          "detail": "found 'South is 40 cents cheaper per parcel than North.', expected 'South is 40 cents cheaper per parcel than North.'",
          "name": "doc-south-expansion-memo:memo-finding-cost:assertion",
          "passed": true
        },
        {
          "detail": "found LOWER_COST",
          "name": "doc-south-expansion-memo:memo-finding-cost:typed_relation",
          "passed": true
        },
        {
          "detail": "found 40",
          "name": "doc-south-expansion-memo:memo-finding-cost:typed_magnitude",
          "passed": true
        },
        {
          "detail": "found CENTS_PER_PARCEL",
          "name": "doc-south-expansion-memo:memo-finding-cost:unit",
          "passed": true
        },
        {
          "detail": "",
          "name": "doc-south-expansion-memo:memo-finding-cost:occurrence_identity",
          "passed": true
        },
        {
          "detail": "found claim-south-vs-north-cost",
          "name": "doc-south-expansion-memo:memo-finding-cost:claim_identity",
          "passed": true
        },
        {
          "detail": "found [('North', 'mean 400 cents per parcel over 4 batches'), ('South', 'mean 360 cents per parcel over 7 batches'), ('Evidence', 'cmp-north-south-mean-cost · dataset ds-parcel-cost-2026Q3 · minimum 4 batches per side')]",
          "name": "doc-south-expansion-memo:memo-finding-cost:evidence_rows",
          "passed": true
        },
        {
          "detail": "searched the file for the contradicted sentence 'South is 40 cents more expensive per parcel than North.'",
          "name": "doc-south-expansion-memo:memo-finding-cost:no_higher_cost",
          "passed": true
        },
        {
          "detail": "searched the file for the contradicted sentence 'South and North have equal mean cost per parcel.'",
          "name": "doc-south-expansion-memo:memo-finding-cost:no_equal_cost",
          "passed": true
        },
        {
          "detail": "found 2 paragraphs, expected 2: ['This memo summarises the recorded cost case for the proposed South lane expansion, for the Operations Review team.', 'Editorial context — not assessed by ResultRipple.']",
          "name": "doc-south-expansion-memo:memo-intro:narrative_unchanged",
          "passed": true
        },
        {
          "detail": "narrative labelled unassessed: found data-assessed=false",
          "name": "doc-south-expansion-memo:memo-intro:scope_label",
          "passed": true
        },
        {
          "detail": "found 3 paragraphs, expected 3: ['Capacity, hiring lead time and depot availability were raised in the planning session and are not analysed here.', 'Nothing in this section has been assessed against the linked evidence.', 'Editorial context — not assessed by ResultRipple.']",
          "name": "doc-south-expansion-memo:memo-outlook:narrative_unchanged",
          "passed": true
        },
        {
          "detail": "narrative labelled unassessed: found data-assessed=false",
          "name": "doc-south-expansion-memo:memo-outlook:scope_label",
          "passed": true
        },
        {
          "detail": "",
          "name": "doc-south-expansion-memo:decision_block_present",
          "passed": true
        },
        {
          "detail": "found PROPOSED",
          "name": "doc-south-expansion-memo:decision_status",
          "passed": true
        },
        {
          "detail": "",
          "name": "doc-south-expansion-memo:decision_identity",
          "passed": true
        },
        {
          "detail": "basis claim-south-vs-north-cost, placed ['claim-south-vs-north-cost']",
          "name": "doc-south-expansion-memo:decision_basis_placed",
          "passed": true
        },
        {
          "detail": "found ['South lane expansion proposal — Proposed', 'Recorded basis: the linked finding above (claim-south-vs-north-cost). ResultRipple records the disposition of this proposal; it does not decide it.']",
          "name": "doc-south-expansion-memo:decision_lines",
          "passed": true
        },
        {
          "detail": "found 9f32c90244987bb5bc6c4fb4dbed63dd8f5ef9a0552f09bba62b3edd7ad2b6aa",
          "name": "doc-south-expansion-memo:dataset_metadata",
          "passed": true
        },
        {
          "detail": "",
          "name": "doc-south-expansion-memo:document_metadata",
          "passed": true
        }
      ],
      "derived": {
        "left": {
          "count": 4,
          "lane_id": "lane-north",
          "mean_cents": "400",
          "total_cents": 1600
        },
        "magnitude_cents": 40,
        "relation": "LOWER_COST",
        "right": {
          "count": 7,
          "lane_id": "lane-south",
          "mean_cents": "360",
          "total_cents": 2520
        }
      },
      "hashes": {
        "doc-operations-cost-review": "5a670a69c226980325af01e1e0a5e407b473865950472a2412dcafa7f387cc26",
        "doc-south-expansion-memo": "93c8b9dbaafd39b3523005b0d5bb0c71140eda57f869b0bf5d76668d26955a9c"
      },
      "ok": true
    },
    "verification_scope": "Two registered finding occurrences and one typed decision-status block checked. Editorial narrative not assessed by ResultRipple."
  },
  "rel-002-44c0bbfc": {
    "acknowledged_alternative": true,
    "alternative_proposed": true,
    "approved_at": "2026-10-16T17:39:49+00:00",
    "approved_by": "person-sam",
    "approved_context_revision": 4,
    "artifacts": {
      "doc-operations-cost-review": {
        "path": "releases/rel-002-44c0bbfc/doc-operations-cost-review.html",
        "sha256": "626caeddad2366b8ce869ff67feec4a6ba6ae0ac18826baa9c7a8e19b9670468",
        "title": "Operations Cost Review"
      },
      "doc-south-expansion-memo": {
        "path": "releases/rel-002-44c0bbfc/doc-south-expansion-memo.html",
        "sha256": "ea0a575c718eb11bfe9aca4fd97e52bf83dc741368f129169cfd190e8b9c33e0",
        "title": "South Expansion Memo"
      }
    },
    "authority_at_issue": {
      "reviewer_id": "person-sam",
      "reviewer_name": "Sam Oyelaran",
      "team_id": "team-operations-review"
    },
    "content_hash": "44c0bbfca0cd633cb833f35ecbfab8f4c3ee2a9a272812cf7a0c16dfbb442020",
    "dataset_sha": "9f32c90244987bb5bc6c4fb4dbed63dd8f5ef9a0552f09bba62b3edd7ad2b6aa",
    "disposition": "RETURN_FOR_REVIEW",
    "execution_fingerprint": "1849d1776c1d9f81960e346f6bc5a5995e6b45fd4e2b4eb3f4f570fb380e9520",
    "interpreted_goal": "RETAIN_CHEAPER_CLAIM",
    "issued_at": "2026-10-16T17:39:50+00:00",
    "issued_by": "person-sam",
    "membership_sha": "83666619c13d69e7e370428a2b44be11fe98624cb9d7e6fd540e37891b0ccdc5",
    "operation_id": "plan-case-dispatch-b09-b11-v2-issue",
    "plan_id": "plan-case-dispatch-b09-b11-v2",
    "plan_version": 2,
    "raw_request": "Update the reports, but keep South as the cheaper option in the rollout memo.",
    "release_id": "rel-002-44c0bbfc",
    "verification": {
      "checks": [
        {
          "detail": "recorded 9f32c90244987bb5bc6c4fb4dbed63dd8f5ef9a0552f09bba62b3edd7ad2b6aa",
          "name": "dataset_bytes_unchanged",
          "passed": true
        },
        {
          "detail": "15 rows",
          "name": "dataset_row_count",
          "passed": true
        },
        {
          "detail": "",
          "name": "membership_costs_match_csv",
          "passed": true
        },
        {
          "detail": "4 vs 4, min 4",
          "name": "minimum_sample_satisfied",
          "passed": true
        },
        {
          "detail": "issued ['doc-operations-cost-review', 'doc-south-expansion-memo']",
          "name": "all_registered_documents_issued",
          "passed": true
        },
        {
          "detail": "actual 626caeddad2366b8ce869ff67feec4a6ba6ae0ac18826baa9c7a8e19b9670468",
          "name": "doc-operations-cost-review:hash_matches_approved",
          "passed": true
        },
        {
          "detail": "1 rendered, 1 registered",
          "name": "doc-operations-cost-review:registered_card_count",
          "passed": true
        },
        {
          "detail": "found 'South costs $0.40 more per parcel than North.', expected 'South costs $0.40 more per parcel than North.'",
          "name": "doc-operations-cost-review:ops-finding-cost:assertion",
          "passed": true
        },
        {
          "detail": "found HIGHER_COST",
          "name": "doc-operations-cost-review:ops-finding-cost:typed_relation",
          "passed": true
        },
        {
          "detail": "found 40",
          "name": "doc-operations-cost-review:ops-finding-cost:typed_magnitude",
          "passed": true
        },
        {
          "detail": "found USD_PER_PARCEL",
          "name": "doc-operations-cost-review:ops-finding-cost:unit",
          "passed": true
        },
        {
          "detail": "",
          "name": "doc-operations-cost-review:ops-finding-cost:occurrence_identity",
          "passed": true
        },
        {
          "detail": "found claim-south-vs-north-cost",
          "name": "doc-operations-cost-review:ops-finding-cost:claim_identity",
          "passed": true
        },
        {
          "detail": "found [('North', 'mean $4.00 per parcel over 4 batches'), ('South', 'mean $4.40 per parcel over 4 batches'), ('Evidence', 'cmp-north-south-mean-cost · dataset ds-parcel-cost-2026Q3 · minimum 4 batches per side')]",
          "name": "doc-operations-cost-review:ops-finding-cost:evidence_rows",
          "passed": true
        },
        {
          "detail": "searched the file for the contradicted sentence 'South costs $0.40 less per parcel than North.'",
          "name": "doc-operations-cost-review:ops-finding-cost:no_lower_cost",
          "passed": true
        },
        {
          "detail": "searched the file for the contradicted sentence 'South and North have equal mean cost per parcel.'",
          "name": "doc-operations-cost-review:ops-finding-cost:no_equal_cost",
          "passed": true
        },
        {
          "detail": "found 3 paragraphs, expected 3: ['This recurring review compares mean handling cost per parcel across the North, South and Pilot lanes for the 2026 Q3 synthetic batch set.', 'All figures are descriptive. Batches carry equal analytical weight and no causal savings estimate is made.', 'Editorial context — not assessed by ResultRipple.']",
          "name": "doc-operations-cost-review:ops-intro:narrative_unchanged",
          "passed": true
        },
        {
          "detail": "narrative labelled unassessed: found data-assessed=false",
          "name": "doc-operations-cost-review:ops-intro:scope_label",
          "passed": true
        },
        {
          "detail": "found 3 paragraphs, expected 3: ['Each batch contributes one integer cost in cents per parcel. A lane enters the comparison only with at least four batches, which is a declared demo policy rather than a significance test.', 'Lane membership reflects the current effective assignment recorded in the operations graph, which can differ from the lane originally written on the dispatch record.', 'Editorial context — not assessed by ResultRipple.']",
          "name": "doc-operations-cost-review:ops-method:narrative_unchanged",
          "passed": true
        },
        {
          "detail": "narrative labelled unassessed: found data-assessed=false",
          "name": "doc-operations-cost-review:ops-method:scope_label",
          "passed": true
        },
        {
          "detail": "",
          "name": "doc-operations-cost-review:no_unexpected_decision_block",
          "passed": true
        },
        {
          "detail": "found 9f32c90244987bb5bc6c4fb4dbed63dd8f5ef9a0552f09bba62b3edd7ad2b6aa",
          "name": "doc-operations-cost-review:dataset_metadata",
          "passed": true
        },
        {
          "detail": "",
          "name": "doc-operations-cost-review:document_metadata",
          "passed": true
        },
        {
          "detail": "actual ea0a575c718eb11bfe9aca4fd97e52bf83dc741368f129169cfd190e8b9c33e0",
          "name": "doc-south-expansion-memo:hash_matches_approved",
          "passed": true
        },
        {
          "detail": "1 rendered, 1 registered",
          "name": "doc-south-expansion-memo:registered_card_count",
          "passed": true
        },
        {
          "detail": "found 'South is 40 cents more expensive per parcel than North.', expected 'South is 40 cents more expensive per parcel than North.'",
          "name": "doc-south-expansion-memo:memo-finding-cost:assertion",
          "passed": true
        },
        {
          "detail": "found HIGHER_COST",
          "name": "doc-south-expansion-memo:memo-finding-cost:typed_relation",
          "passed": true
        },
        {
          "detail": "found 40",
          "name": "doc-south-expansion-memo:memo-finding-cost:typed_magnitude",
          "passed": true
        },
        {
          "detail": "found CENTS_PER_PARCEL",
          "name": "doc-south-expansion-memo:memo-finding-cost:unit",
          "passed": true
        },
        {
          "detail": "",
          "name": "doc-south-expansion-memo:memo-finding-cost:occurrence_identity",
          "passed": true
        },
        {
          "detail": "found claim-south-vs-north-cost",
          "name": "doc-south-expansion-memo:memo-finding-cost:claim_identity",
          "passed": true
        },
        {
          "detail": "found [('North', 'mean 400 cents per parcel over 4 batches'), ('South', 'mean 440 cents per parcel over 4 batches'), ('Evidence', 'cmp-north-south-mean-cost · dataset ds-parcel-cost-2026Q3 · minimum 4 batches per side')]",
          "name": "doc-south-expansion-memo:memo-finding-cost:evidence_rows",
          "passed": true
        },
        {
          "detail": "searched the file for the contradicted sentence 'South is 40 cents cheaper per parcel than North.'",
          "name": "doc-south-expansion-memo:memo-finding-cost:no_lower_cost",
          "passed": true
        },
        {
          "detail": "searched the file for the contradicted sentence 'South and North have equal mean cost per parcel.'",
          "name": "doc-south-expansion-memo:memo-finding-cost:no_equal_cost",
          "passed": true
        },
        {
          "detail": "found 2 paragraphs, expected 2: ['This memo summarises the recorded cost case for the proposed South lane expansion, for the Operations Review team.', 'Editorial context — not assessed by ResultRipple.']",
          "name": "doc-south-expansion-memo:memo-intro:narrative_unchanged",
          "passed": true
        },
        {
          "detail": "narrative labelled unassessed: found data-assessed=false",
          "name": "doc-south-expansion-memo:memo-intro:scope_label",
          "passed": true
        },
        {
          "detail": "found 3 paragraphs, expected 3: ['Capacity, hiring lead time and depot availability were raised in the planning session and are not analysed here.', 'Nothing in this section has been assessed against the linked evidence.', 'Editorial context — not assessed by ResultRipple.']",
          "name": "doc-south-expansion-memo:memo-outlook:narrative_unchanged",
          "passed": true
        },
        {
          "detail": "narrative labelled unassessed: found data-assessed=false",
          "name": "doc-south-expansion-memo:memo-outlook:scope_label",
          "passed": true
        },
        {
          "detail": "",
          "name": "doc-south-expansion-memo:decision_block_present",
          "passed": true
        },
        {
          "detail": "found RETURNED_FOR_REVIEW",
          "name": "doc-south-expansion-memo:decision_status",
          "passed": true
        },
        {
          "detail": "",
          "name": "doc-south-expansion-memo:decision_identity",
          "passed": true
        },
        {
          "detail": "basis claim-south-vs-north-cost, placed ['claim-south-vs-north-cost']",
          "name": "doc-south-expansion-memo:decision_basis_placed",
          "passed": true
        },
        {
          "detail": "found ['South lane expansion proposal — Returned for review', 'Recorded basis: the linked finding above (claim-south-vs-north-cost). ResultRipple records the disposition of this proposal; it does not decide it.']",
          "name": "doc-south-expansion-memo:decision_lines",
          "passed": true
        },
        {
          "detail": "found 9f32c90244987bb5bc6c4fb4dbed63dd8f5ef9a0552f09bba62b3edd7ad2b6aa",
          "name": "doc-south-expansion-memo:dataset_metadata",
          "passed": true
        },
        {
          "detail": "",
          "name": "doc-south-expansion-memo:document_metadata",
          "passed": true
        }
      ],
      "derived": {
        "left": {
          "count": 4,
          "lane_id": "lane-north",
          "mean_cents": "400",
          "total_cents": 1600
        },
        "magnitude_cents": 40,
        "relation": "HIGHER_COST",
        "right": {
          "count": 4,
          "lane_id": "lane-south",
          "mean_cents": "440",
          "total_cents": 1760
        }
      },
      "hashes": {
        "doc-operations-cost-review": "626caeddad2366b8ce869ff67feec4a6ba6ae0ac18826baa9c7a8e19b9670468",
        "doc-south-expansion-memo": "ea0a575c718eb11bfe9aca4fd97e52bf83dc741368f129169cfd190e8b9c33e0"
      },
      "ok": true
    },
    "verification_scope": "Two registered finding occurrences and one typed decision-status block checked. Editorial narrative not assessed by ResultRipple."
  }
};
