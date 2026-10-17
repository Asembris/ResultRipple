"""Re-run the independent verifier on the committed Release 2 bytes.

    python blog/tools/reverify.py            # the issued editions, as committed
    python blog/tools/reverify.py --tamper   # the same, with "more" changed to "less" in the memo

It loads backend/app/verify_artifacts.py by path (that module imports only the
standard library, never the engine), and feeds it the recorded plan v2 scope,
the raw CSV and the two edition files from docs/evidence. No FalkorDB, no
network. The verdict should match the receipt: 45 of 45.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "docs" / "evidence"


def load_verifier():
    spec = importlib.util.spec_from_file_location("verify_artifacts", ROOT / "backend" / "app" / "verify_artifacts.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module  # dataclasses resolve annotations through sys.modules
    spec.loader.exec_module(module)
    return module


def main() -> int:
    parser = argparse.ArgumentParser(description="Re-run the independent verifier on docs/evidence.")
    parser.add_argument("--tamper", action="store_true", help="flip one word in the memo before verifying")
    opts = parser.parse_args()

    verifier = load_verifier()
    plan = json.loads((EVIDENCE / "api" / "plan-v2.json").read_text(encoding="utf-8"))
    receipt = json.loads((EVIDENCE / "api" / "receipt-rel-002.json").read_text(encoding="utf-8"))
    scope = plan["scope"]
    artifacts = {
        doc: (EVIDENCE / "editions" / receipt["release_id"] / f"{doc}.html").read_bytes()
        for doc in plan["candidates"]
    }
    if opts.tamper:
        memo = "doc-south-expansion-memo"
        artifacts[memo] = artifacts[memo].replace(b"40 cents more expensive", b"40 cents less expensive", 1)

    report = verifier.verify_package(
        csv_path=ROOT / "backend" / "data" / "batches.csv",
        dataset_sha=scope["dataset_sha"],
        memberships=scope["memberships"],
        comparison=scope["comparison"],
        documents=scope["documents"],
        occurrences=scope["occurrences"],
        decision=scope["decision"],
        artifacts=artifacts,
        expected_hashes=plan["candidates"],
    )
    passed = sum(1 for c in report.checks if c.passed)
    print(f"release {receipt['release_id']}: {passed} of {len(report.checks)} checks passed"
          f"{' (tampered memo)' if opts.tamper else ''}")
    for check in report.failures:
        print(f"  FAILED {check.name}")
    recorded = receipt["verification"]
    print(f"receipt recorded: {sum(1 for c in recorded['checks'] if c['passed'])} of {len(recorded['checks'])}, ok={recorded['ok']}")
    return 0 if report.ok else 1


if __name__ == "__main__":
    sys.exit(main())
