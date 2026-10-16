# Evidence: the deployed Noor → Sam run, 2026-10-16

This folder records one complete run of the deployed product at commit `54316be`, on
<https://52-58-115-104.sslip.io>, at about 18:32 UTC on 2026-10-16. Everything here is a
byte copy of what the live API served, apart from the screenshots.

**How the run was driven.** A script drove the human steps through the API: the
operator's reset, Ari's correction, Noor's approval, the operator's reviewer change, the
refused release, the refresh, and Sam's approval and release. The agent call in the
middle was real: one job against the NVIDIA-hosted model, with its recorded usage and
timing. That is why the human steps all land within one second of each other. A person
clicking through the site takes minutes, and the demo video shows it at normal speed.

All organizational data is fictional demo setup.

## What happened

| Step | Who | Result | Record |
| --- | --- | --- | --- |
| Reset to demo setup, issuing Version 1 | operator | `rel-001-c004be61`, issued by Noor, labelled demo setup | [run.jsonl](run.jsonl), [receipt](api/receipt-rel-001.json) |
| Confirm dispatch note DX-2026-0914 | Ari | 3 memberships move South → Pilot, context revision 2 → 3 | [run.jsonl](run.jsonl) |
| Ask the agent | Ari's request, the model's tool calls | `AWAITING_REVIEW`, plan v1 for Noor | [agent-job.json](api/agent-job.json) |
| Approve plan v1 | Noor | `APPROVED` | [plan-v1.json](api/plan-v1.json) |
| Move review authority | operator | `REVIEWED_BY` Noor → Sam, context revision 3 → 4 | [run.jsonl](run.jsonl) |
| Issue plan v1 | Noor | **409 `AUTHORITY_CHANGED`**, nothing written | [run.jsonl](run.jsonl), [plan-v1.json](api/plan-v1.json) |
| Refresh the review | a case participant | plan v2 for Sam, 0 model calls, identical candidate bytes | [plan-v2.json](api/plan-v2.json) |
| Approve and issue plan v2 | Sam | `rel-002-44c0bbfc`, 45 of 45 verifier checks passed | [receipt](api/receipt-rel-002.json) |

## The figures

| | Before (Release 1) | After (Release 2) |
| --- | --- | --- |
| North | 1600 / 4 = 400 cents | 1600 / 4 = 400 cents |
| South | 2520 / 7 = 360 cents | 1760 / 4 = 440 cents |
| Relation | `LOWER_COST`, 40 cents | `HIGHER_COST`, 40 cents |
| Operations Cost Review | "South costs $0.40 less per parcel than North." | "South costs $0.40 more per parcel than North." |
| South Expansion Memo | "South is 40 cents cheaper per parcel than North." | "South is 40 cents more expensive per parcel than North." |
| South lane expansion proposal | proposed | returned for review |
| Membership snapshot | `92976722…5192` | `83666619…cdc5` |
| Raw CSV (`backend/data/batches.csv`) | `9f32c902…b6aa` | `9f32c902…b6aa` (unchanged) |

## The agent run

Job `job-a8b9ac904903`, model `nvidia/nemotron-3-super-120b-a12b` at
`https://integrate.api.nvidia.com/v1`, reasoning off.

- Request: *"Update the reports, but keep South as the cheaper option in the rollout memo."*
- Turn 1 (1,527 ms) called `inspect_impact`: 2 registered occurrences across 2 documents,
  current relation `HIGHER_COST`.
- Turn 2 (4,766 ms) called `stage_review` with `requested_keep_target: COST_CLAIM`,
  goal `RETAIN_CHEAPER_CLAIM`, `alternative_flag: true` and disposition
  `RETURN_FOR_REVIEW`.
- 2 model turns, 2 tool calls, 6,365 ms from start to the persisted plan.
- Tokens: 5,784 prompt, 233 completion, 6,017 total, 0 reasoning. The `usage` on each
  model event is a running total for the job, not that turn's count alone.
- The model's note, shown to the reviewer as unassessed commentary: *"Request to keep
  South cheaper claim conflicts with evidence in occ-ops-cost-finding and
  occ-memo-cost-finding"*.

## Same bytes, new authority

Plans v1 and v2 have the same content hash, `44c0bbfc…2020`, and the same candidate
hashes. Their execution fingerprints differ (`c746cf89…559f` and `1849d177…9520`)
because the fingerprint includes the current reviewer. Noor's approval was bound to the
first fingerprint, so after the reviewer change it could not issue anything. Plan v1 now
records `status: SUPERSEDED`, `invalidation_reason: AUTHORITY_CHANGED`,
`refused_action: RELEASE` and `refused_at: 2026-10-16T18:32:24+00:00`.

| Edition | Release 1 SHA-256 | Release 2 SHA-256 |
| --- | --- | --- |
| Operations Cost Review | `5a670a69c226980325af01e1e0a5e407b473865950472a2412dcafa7f387cc26` | `626caeddad2366b8ce869ff67feec4a6ba6ae0ac18826baa9c7a8e19b9670468` |
| South Expansion Memo | `93c8b9dbaafd39b3523005b0d5bb0c71140eda57f869b0bf5d76668d26955a9c` | `ea0a575c718eb11bfe9aca4fd97e52bf83dc741368f129169cfd190e8b9c33e0` |

An earlier reset and rerun the same day, at 13:31 UTC, produced the same release ID and
the same two Release 2 hashes.

## Files

| Path | What it is |
| --- | --- |
| `run.jsonl` | The script's own log, one line per step. It holds HTTP statuses, IDs and cookie *attribute names*, never a cookie value or passcode. |
| `api/*.json` | Responses to unauthenticated `GET /api/...` requests, saved byte for byte: `health`, `ready`, `workspace`, `jobs/job-a8b9ac904903`, `cases/case-dispatch-b09-b11/agent-runs`, both plans and both release receipts. |
| `editions/<release>/<document>.html` | The four issued editions, as served by `GET /api/editions/<release>/<document>`. |
| `SHA256SUMS` | Hashes of the four editions and the raw CSV. |
| `screens/*.jpg` | Signed-out screenshots of the live site at 1920×1080: the seven story steps, then both Version 2 editions open in the reader. |

## Check it yourself

From this folder:

```bash
sha256sum -c SHA256SUMS
```

Compare a saved copy against the live API. The output is empty if they are identical,
unless the workspace has been reset since:

```bash
curl -s https://52-58-115-104.sslip.io/api/releases/rel-002-44c0bbfc/receipt | cmp - api/receipt-rel-002.json
```

```bash
curl -s https://52-58-115-104.sslip.io/api/editions/rel-002-44c0bbfc/doc-south-expansion-memo | sha256sum
```

Release IDs are derived from the candidate content, so a fresh run of the same story
issues the same release ID with the same hashes. Plans, jobs and timestamps are new on
every run, and this folder is the lasting record of this one.

## Left out on purpose

Demo passcodes, session cookie values, the session secret, the NVIDIA API key, the
server's environment file, and any host access details beyond the public URL. No
private model reasoning exists to leave out: reasoning was off, the run recorded
0 reasoning tokens, and both model turns returned tool calls with no prose
(`content_chars: 0`).
