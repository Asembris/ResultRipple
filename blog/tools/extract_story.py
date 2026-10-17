"""Build blog/data/story.json from docs/evidence, and nothing else.

Every node, edge, label and figure the write-up draws comes from this file. The
script reads only the recorded run in docs/evidence (API captures, run.jsonl,
SHA256SUMS), re-derives the arithmetic from the recorded memberships, and stops
if its own figures disagree with what the release receipts say. It never reads
backend/ or frontend/, and it never invents a value: a missing field is an error.

    python blog/tools/extract_story.py            # write blog/data/story.json
    python blog/tools/extract_story.py --check    # fail if the committed copy differs
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "docs" / "evidence"
OUT = ROOT / "blog" / "data" / "story.json"

# The graph schema's relationship names (docs/graph-model.md). They label the
# edges; which edges exist, and between what, is read from the evidence below.
REL = {
    "membership": "ASSIGNED_TO",
    "left": "LEFT_SIDE",
    "right": "RIGHT_SIDE",
    "claim_basis": "BASED_ON",
    "occurrence": "OF_CLAIM · IN_DOCUMENT",
    "decision_basis": "BASED_ON",
    "decision_owner": "OWNED_BY",
    "authority": "REVIEWED_BY",
    "plan_reviewer": "ASSIGNED_TO_REVIEWER",
}

USED_FILES = (
    "api/workspace.json",
    "api/plan-v1.json",
    "api/plan-v2.json",
    "api/agent-job.json",
    "api/receipt-rel-001.json",
    "api/receipt-rel-002.json",
    "run.jsonl",
    "SHA256SUMS",
)


class EvidenceError(RuntimeError):
    pass


def need(cond: bool, message: str) -> None:
    if not cond:
        raise EvidenceError(message)


def load_json(rel: str):
    return json.loads((EVIDENCE / rel).read_text(encoding="utf-8"))


def run_steps() -> dict[str, list[dict]]:
    steps: dict[str, list[dict]] = {}
    for line in (EVIDENCE / "run.jsonl").read_text(encoding="utf-8").splitlines():
        if line.strip():
            row = json.loads(line)
            steps.setdefault(row["step"], []).append(row)
    return steps


def one(steps: dict[str, list[dict]], name: str) -> dict:
    rows = steps.get(name, [])
    need(len(rows) == 1, f"run.jsonl: expected exactly one {name!r} step, found {len(rows)}")
    return rows[0]


def sha256sums() -> dict[str, str]:
    out = {}
    for line in (EVIDENCE / "SHA256SUMS").read_text(encoding="utf-8").splitlines():
        if line.strip():
            digest, path = line.split(None, 1)
            out[path.strip()] = digest
    return out


def money(cents: int) -> str:
    sign = "−" if cents < 0 else ""
    cents = abs(cents)
    return f"{sign}${cents // 100}.{cents % 100:02d}"


def whole_cents(value: Fraction, what: str) -> int:
    need(value.denominator == 1, f"{what} is not a whole number of cents ({value}); refusing to round for display")
    return value.numerator


def short(digest: str) -> str:
    return f"{digest[:8]}…{digest[-4:]}"


def listing(items: list[str]) -> str:
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " and " + items[-1]


def lane_stats(batches: list[dict], lane_id: str, key: str) -> dict:
    costs = [b["cost_cents"] for b in batches if b[key] == lane_id]
    need(costs, f"no batches in {lane_id} ({key})")
    mean = Fraction(sum(costs), len(costs))
    return {"total_cents": sum(costs), "count": len(costs), "mean_cents": whole_cents(mean, f"mean of {lane_id}")}


def relation(left_mean: int, right_mean: int) -> str:
    # The subject is the right side (South), compared with the left (North).
    return "LOWER_COST" if right_mean < left_mean else "HIGHER_COST" if right_mean > left_mean else "EQUAL_COST"


def build() -> dict:
    ws = load_json("api/workspace.json")
    plan1 = load_json("api/plan-v1.json")
    plan2 = load_json("api/plan-v2.json")
    job = load_json("api/agent-job.json")
    rec1 = load_json("api/receipt-rel-001.json")
    rec2 = load_json("api/receipt-rel-002.json")
    steps = run_steps()
    sums = sha256sums()

    # ---- the correction case ------------------------------------------------
    cases = [c for c in ws["cases"] if c["changed_batch_ids"]]
    need(len(cases) == 1, "workspace: expected one correction case with changed batches")
    case = cases[0]
    moved = list(case["changed_batch_ids"])
    from_lane, to_lane = case["from_lane_id"], case["to_lane_id"]

    lanes = {}
    for side in ("left", "right"):
        lanes[ws["comparison"][side]["lane_id"]] = ws["comparison"][side]["lane_name"]
    # The third lane is named only by its id in the evidence; its display name is the id's tail.
    for b in ws["evidence"]["batches"]:
        lanes.setdefault(b["lane_id"], b["lane_id"].removeprefix("lane-").capitalize())

    # Effective memberships after the run come from the workspace; before the
    # correction they differ exactly by the recorded changed batches.
    batches = []
    for b in ws["evidence"]["batches"]:
        after = b["lane_id"]
        is_moved = b["batch_id"] in moved
        if is_moved:
            need(after == to_lane, f"{b['batch_id']} is recorded as moved but is not in {to_lane}")
        batches.append({
            "id": b["batch_id"],
            "cost_cents": b["cost_cents"],
            "lane_before": from_lane if is_moved else after,
            "lane_after": after,
            "moved": is_moved,
        })
    need(len(batches) == 15, "expected 15 batches")
    correction_step = one(steps, "correction")
    need(correction_step["applied_edge_count"] == len(moved), "run.jsonl applied edge count differs from changed batches")

    # The plan's membership snapshot must agree with the workspace's.
    snap = {bid: (lane, cost) for bid, lane, cost in plan1["scope"]["memberships"]}
    for b in batches:
        need(snap.get(b["id"]) == (b["lane_after"], b["cost_cents"]), f"plan v1 membership snapshot disagrees on {b['id']}")

    # ---- arithmetic, re-derived, then compared with both receipts -----------
    left_id = ws["comparison"]["left"]["lane_id"]
    right_id = ws["comparison"]["right"]["lane_id"]
    comparison = {"id": ws["comparison"]["comparison_id"], "title": ws["comparison"]["finding_title"],
                  "dataset_id": ws["comparison"]["dataset_id"], "min_n": ws["comparison"]["min_n"],
                  "left_lane": left_id, "right_lane": right_id}
    for phase, key, receipt in (("before", "lane_before", rec1), ("after", "lane_after", rec2)):
        left = lane_stats(batches, left_id, key)
        right = lane_stats(batches, right_id, key)
        rel = relation(left["mean_cents"], right["mean_cents"])
        mag = abs(left["mean_cents"] - right["mean_cents"])
        derived = receipt["verification"]["derived"]
        for mine, theirs, side in ((left, derived["left"], "left"), (right, derived["right"], "right")):
            need(mine["total_cents"] == theirs["total_cents"] and mine["count"] == theirs["count"]
                 and str(mine["mean_cents"]) == theirs["mean_cents"],
                 f"{phase} {side}: re-derived {mine} disagrees with the receipt {theirs}")
        need(rel == derived["relation"] and mag == derived["magnitude_cents"], f"{phase}: relation/magnitude disagree with the receipt")
        comparison[phase] = {"left": left, "right": right, "relation": rel, "magnitude_cents": mag,
                             "left_minus_right_cents": left["mean_cents"] - right["mean_cents"]}

    # ---- finding, documents, decision ---------------------------------------
    need(len(ws["findings"]) == 1, "expected one registered finding")
    finding = ws["findings"][0]
    claim_id = finding["claim_id"]
    need(comparison["id"] in finding["comparison_ids"], "finding is not bound to the comparison")

    assessment = {a["occurrence_id"]: a for a in plan1["scope"]["assessment"]}
    documents = []
    for doc in ws["scope"]:
        occs = [o for o in doc["occurrences"] if o["claim_id"] == claim_id]
        need(len(occs) == 1, f"{doc['document_id']}: expected one occurrence of the finding")
        a = assessment[occs[0]["occurrence_id"]]
        documents.append({
            "id": doc["document_id"],
            "title": doc["title"],
            "owner": doc["owner_name"],
            "occurrence_id": occs[0]["occurrence_id"],
            "card_style": occs[0]["card_style"],
            "has_decision_block": doc["has_decision_block"],
            "sentence_before": a["previous"]["text"],
            "sentence_after": a["current"]["text"],
            "relation_before": a["previous"]["relation"],
            "relation_after": a["current"]["relation"],
        })
    need(len(documents) == 2, "expected two documents")
    for d in documents:
        need(d["relation_before"] == comparison["before"]["relation"] and d["relation_after"] == comparison["after"]["relation"],
             f"{d['id']}: card relation disagrees with the comparison")

    dec = ws["decision"]
    need(dec["basis_claim_id"] == claim_id, "decision basis is not the finding")
    decision = {
        "id": dec["decision_id"], "title": dec["title"], "team": dec["team_name"],
        "status_before": plan1["scope"]["decision"]["current_status"],
        "status_after": dec["status"],
    }
    need(plan1["scope"]["decision"]["expected_status"] == dec["status"], "decision status after release disagrees with the plan")

    # ---- authority ----------------------------------------------------------
    people = {p["person_id"]: p["display_name"] for p in ws["people"]}
    reassign = one(steps, "reassign")
    authority = {
        "team": dec["team_name"],
        "before": people[reassign["previous"]], "before_id": reassign["previous"],
        "after": people[reassign["current"]], "after_id": reassign["current"],
    }
    need(dec["current_reviewer_id"] == reassign["current"], "workspace reviewer disagrees with run.jsonl")

    refusal_step = one(steps, "noor_release")
    ctx = refusal_step["context"]
    need(refusal_step["http"] == 409 and ctx["approved_reviewer_id"] == reassign["previous"], "refusal does not match the reassignment")
    refusal = {
        "http": refusal_step["http"], "code": refusal_step["code"], "detail": refusal_step["detail"],
        "plan_id": plan1["plan_id"], "refused_at": plan1["refused_at"],
        "approved_reviewer_id": ctx["approved_reviewer_id"], "current_reviewer_id": ctx["current_reviewer_id"],
        "context_revision": ctx["context_revision"], "plan_context_revision": ctx["plan_context_revision"],
    }
    need(plan1["invalidation_reason"] == refusal["code"] and plan1["refused_action"] == "RELEASE", "plan v1 does not record the refusal")

    refresh = one(steps, "refresh")
    need(refresh["candidates_identical"] and plan1["candidates"] == plan2["candidates"], "plan candidates differ")
    need(plan1["content_hash"] == plan2["content_hash"], "plan content hashes differ")
    need(plan1["execution_fingerprint"] != plan2["execution_fingerprint"], "plan fingerprints are equal")

    def plan_view(p: dict) -> dict:
        return {
            "id": p["plan_id"], "version": p["version"], "status": p["status"],
            "assigned_reviewer": people[p["assigned_reviewer_id"]], "assigned_reviewer_id": p["assigned_reviewer_id"],
            "approved_by": people[p["approved_by"]], "content_hash": p["content_hash"],
            "execution_fingerprint": p["execution_fingerprint"], "invalidation_reason": p["invalidation_reason"],
            "context_revision": p["context_revision"], "candidates": p["candidates"],
        }

    plans = [plan_view(plan1), plan_view(plan2)]

    # ---- agent ---------------------------------------------------------------
    turns = []
    for ev in job["events"]:
        if ev["kind"] == "model":
            turns.append({"turn": ev["turn"], "elapsed_ms": ev["elapsed_ms"], "tools": ev["requested_tools"]})
    tool_events = [ev for ev in job["events"] if ev["kind"] == "tool"]
    staged = [ev for ev in tool_events if ev["tool"] == "stage_review"]
    need(len(staged) == 1, "expected one stage_review call")
    args = staged[0]["arguments"]
    agent = {
        "job_id": job["job_id"], "model": job["model"], "endpoint": job["endpoint"], "reasoning": job["reasoning"],
        "request": job["request_text"], "turns": turns,
        "tools": [{"tool": ev["tool"], "elapsed_ms": ev["elapsed_ms"], "summary": ev["summary"]} for ev in tool_events],
        "model_turns": job["model_turn_count"], "tool_calls": job["tool_call_count"], "elapsed_ms": job["elapsed_ms"],
        "usage": job["usage"], "goal": args["goal"], "disposition": args["disposition"],
        "alternative_flag": args["alternative_flag"], "requested_keep_target": args["requested_keep_target"],
        "note": args["note"],
    }
    need(len(turns) == agent["model_turns"] and len(tool_events) == agent["tool_calls"], "agent counts disagree with its events")

    # ---- releases -------------------------------------------------------------
    releases = []
    for rec in (rec1, rec2):
        rid = rec["release_id"]
        editions = {}
        for doc_id, art in rec["artifacts"].items():
            pinned = sums.get(f"editions/{rid}/{doc_id}.html")
            need(pinned == art["sha256"], f"SHA256SUMS disagrees with the receipt for {rid}/{doc_id}")
            on_disk = hashlib.sha256((EVIDENCE / "editions" / rid / f"{doc_id}.html").read_bytes()).hexdigest()
            need(on_disk == pinned, f"the committed edition {rid}/{doc_id} does not match its pinned hash")
            editions[doc_id] = pinned
        checks = rec["verification"]["checks"]
        releases.append({
            "id": rid, "issued_by": people[rec["issued_by"]], "issued_at": rec["issued_at"],
            "plan_id": rec["plan_id"], "editions": editions, "membership_sha": rec["membership_sha"],
            "checks_passed": sum(1 for c in checks if c["passed"]), "checks_total": len(checks),
            "ok": rec["verification"]["ok"],
        })
    need(rec2["plan_id"] == plan2["plan_id"] and rec2["authority_at_issue"]["reviewer_id"] == reassign["current"], "release 2 authority mismatch")
    need(rec1["dataset_sha"] == rec2["dataset_sha"] == sums["../../backend/data/batches.csv"], "dataset hash mismatch")

    revisions = {
        "before_correction": one(steps, "before_correction")["context_revision"],
        "after_correction": correction_step["context_revision"],
        "plan_v1": plan1["context_revision"],
        "after_authority": refusal["context_revision"],
    }

    # ---- graph (what the scenes draw) ------------------------------------------
    doc_ops, doc_memo = documents
    nodes = [{"id": b["id"], "type": "batch", "label": b["id"]} for b in batches]
    nodes += [{"id": lid, "type": "lane", "label": name} for lid, name in lanes.items()]
    nodes += [
        {"id": comparison["id"], "type": "comparison", "label": "Cost comparison"},
        {"id": claim_id, "type": "finding", "label": "Shared finding"},
        {"id": doc_ops["id"], "type": "document", "label": doc_ops["title"]},
        {"id": doc_memo["id"], "type": "document", "label": doc_memo["title"]},
        {"id": decision["id"], "type": "decision", "label": decision["title"]},
        {"id": dec["team_id"], "type": "team", "label": decision["team"]},
        {"id": authority["before_id"], "type": "person", "label": authority["before"]},
        {"id": authority["after_id"], "type": "person", "label": authority["after"]},
        {"id": plan1["plan_id"], "type": "plan", "label": "Review plan v1"},
        {"id": plan2["plan_id"], "type": "plan", "label": "Review plan v2"},
    ]
    edges = []
    for b in batches:
        if b["moved"]:
            edges.append({"from": b["id"], "to": b["lane_before"], "rel": REL["membership"], "phase": "before"})
            edges.append({"from": b["id"], "to": b["lane_after"], "rel": REL["membership"], "phase": "after"})
        else:
            edges.append({"from": b["id"], "to": b["lane_after"], "rel": REL["membership"], "phase": "both"})
    edges += [
        {"from": comparison["id"], "to": left_id, "rel": REL["left"], "phase": "both"},
        {"from": comparison["id"], "to": right_id, "rel": REL["right"], "phase": "both"},
        {"from": claim_id, "to": comparison["id"], "rel": REL["claim_basis"], "phase": "both"},
        {"from": claim_id, "to": doc_ops["id"], "rel": REL["occurrence"], "phase": "both", "via": doc_ops["occurrence_id"]},
        {"from": claim_id, "to": doc_memo["id"], "rel": REL["occurrence"], "phase": "both", "via": doc_memo["occurrence_id"]},
        {"from": decision["id"], "to": claim_id, "rel": REL["decision_basis"], "phase": "both"},
        {"from": decision["id"], "to": dec["team_id"], "rel": REL["decision_owner"], "phase": "both"},
        {"from": dec["team_id"], "to": authority["before_id"], "rel": REL["authority"], "phase": "before"},
        {"from": dec["team_id"], "to": authority["after_id"], "rel": REL["authority"], "phase": "after"},
        {"from": plan1["plan_id"], "to": plan1["assigned_reviewer_id"], "rel": REL["plan_reviewer"], "phase": "before"},
        {"from": plan2["plan_id"], "to": plan2["assigned_reviewer_id"], "rel": REL["plan_reviewer"], "phase": "after"},
    ]

    # ---- display strings the page binds to (data-fact) -------------------------
    before, after = comparison["before"], comparison["after"]
    words = {"LOWER_COST": "cheaper", "HIGHER_COST": "more expensive", "EQUAL_COST": "equal"}
    status = {"PROPOSED": "proposed", "RETURNED_FOR_REVIEW": "returned for review"}
    rel1, rel2 = releases
    refused = plan1["refused_at"].replace("T", " ").replace("+00:00", " UTC")
    display = {
        "correction.source_ref": case["source_ref"],
        "correction.moved_list": listing(moved),
        "correction.moved_count": str(len(moved)),
        "lane.from": lanes[from_lane], "lane.to": lanes[to_lane],
        "north.total": str(before["left"]["total_cents"]), "north.n": str(before["left"]["count"]),
        "north.mean_cents": str(before["left"]["mean_cents"]), "north.mean": money(before["left"]["mean_cents"]),
        "south.before.total": str(before["right"]["total_cents"]), "south.before.n": str(before["right"]["count"]),
        "south.before.mean_cents": str(before["right"]["mean_cents"]), "south.before.mean": money(before["right"]["mean_cents"]),
        "south.after.total": str(after["right"]["total_cents"]), "south.after.n": str(after["right"]["count"]),
        "south.after.mean_cents": str(after["right"]["mean_cents"]), "south.after.mean": money(after["right"]["mean_cents"]),
        "magnitude.cents": str(after["magnitude_cents"]), "magnitude.dollars": money(after["magnitude_cents"]),
        "diff.before": f"{before['left_minus_right_cents']:+d}",
        "diff.after": f"{after['left_minus_right_cents']:+d}".replace("-", "−"),
        "finding.before": f"{lanes[right_id]} {before['magnitude_cents']}¢ {words[before['relation']]}",
        "finding.after": f"{lanes[right_id]} {after['magnitude_cents']}¢ {words[after['relation']]}",
        "doc.ops.title": doc_ops["title"], "doc.memo.title": doc_memo["title"],
        "sentence.ops.before": doc_ops["sentence_before"], "sentence.ops.after": doc_ops["sentence_after"],
        "sentence.memo.before": doc_memo["sentence_before"], "sentence.memo.after": doc_memo["sentence_after"],
        "decision.title": decision["title"],
        "decision.before": status[decision["status_before"]], "decision.after": status[decision["status_after"]],
        "agent.request": agent["request"], "agent.model": agent["model"],
        "agent.turns": str(agent["model_turns"]), "agent.tool_calls": str(agent["tool_calls"]),
        "agent.elapsed": f"{agent['elapsed_ms'] / 1000:.1f} s", "agent.tokens": f"{agent['usage']['total_tokens']:,}",
        "agent.goal": agent["goal"], "agent.disposition": agent["disposition"],
        "authority.team": authority["team"], "authority.before": authority["before"], "authority.after": authority["after"],
        "refusal.http": str(refusal["http"]), "refusal.code": refusal["code"], "refusal.detail": refusal["detail"],
        "refusal.detail_sentence": refusal["detail"][0].upper() + refusal["detail"][1:] + ".",
        "refusal.at": refused,
        "refusal.approved_reviewer_id": refusal["approved_reviewer_id"], "refusal.current_reviewer_id": refusal["current_reviewer_id"],
        "refusal.context_revision": str(refusal["context_revision"]), "refusal.plan_context_revision": str(refusal["plan_context_revision"]),
        "refresh.model_calls": str(refresh["refresh"]["model_calls"]),
        "plan.v1.id": plan1["plan_id"], "plan.v2.id": plan2["plan_id"],
        "plan.content_hash": plan1["content_hash"], "plan.content_hash_short": short(plan1["content_hash"]),
        "plan.v1.fingerprint_short": short(plan1["execution_fingerprint"]),
        "plan.v2.fingerprint_short": short(plan2["execution_fingerprint"]),
        "rev.correction": f"{revisions['before_correction']} → {revisions['after_correction']}",
        "rev.authority": f"{revisions['plan_v1']} → {revisions['after_authority']}",
        "release.1.id": rel1["id"], "release.2.id": rel2["id"], "release.2.issued_by": rel2["issued_by"],
        "release.2.checks": f"{rel2['checks_passed']} of {rel2['checks_total']}",
        "release.1.membership_short": short(rel1["membership_sha"]), "release.2.membership_short": short(rel2["membership_sha"]),
        "edition.1.ops": rel1["editions"][doc_ops["id"]], "edition.1.memo": rel1["editions"][doc_memo["id"]],
        "edition.2.ops": rel2["editions"][doc_ops["id"]], "edition.2.memo": rel2["editions"][doc_memo["id"]],
        "dataset.sha": rec2["dataset_sha"],
    }

    return {
        "about": "Generated by blog/tools/extract_story.py from docs/evidence. Do not edit by hand.",
        "sources": {rel: hashlib.sha256((EVIDENCE / rel).read_bytes()).hexdigest() for rel in USED_FILES},
        "workspace": ws["workspace_id"],
        "lanes": [{"id": k, "name": v} for k, v in lanes.items()],
        "batches": batches,
        "correction": {"source_ref": case["source_ref"], "note": case["source_note"], "moved": moved,
                       "from_lane": from_lane, "to_lane": to_lane, "applied_by": people[case["applied_by"]]},
        "comparison": comparison,
        "finding": {"id": claim_id, "title": finding["title"]},
        "documents": documents,
        "decision": decision,
        "authority": authority,
        "refusal": refusal,
        "plans": plans,
        "agent": agent,
        "releases": releases,
        "dataset": {"id": comparison["dataset_id"], "sha256": rec2["dataset_sha"], "rows": len(batches)},
        "revisions": revisions,
        "graph": {"nodes": nodes, "edges": edges},
        "display": display,
    }


def render(story: dict) -> str:
    return json.dumps(story, indent=1, ensure_ascii=False) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="fail if blog/data/story.json is not what the evidence produces")
    opts = parser.parse_args()
    try:
        text = render(build())
    except (EvidenceError, KeyError) as exc:
        print(f"extract_story: evidence error: {exc}", file=sys.stderr)
        return 2
    if opts.check:
        current = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        if current != text:
            print("extract_story: blog/data/story.json differs from what docs/evidence produces; "
                  "run python blog/tools/extract_story.py", file=sys.stderr)
            return 1
        print(f"extract_story: blog/data/story.json matches docs/evidence ({len(text.encode())} bytes, "
              f"{len(json.loads(text)['sources'])} source files)")
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8", newline="\n")
    print(f"extract_story: wrote {OUT.relative_to(ROOT).as_posix()} ({len(text.encode())} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
