"""Create the frozen demo workspace and issue its genuine Version 1 editions.

Seed IDs describe primitive facts only. There is no corrected-artifact answer
list, affected-file list, reviewer answer, or permission shortcut here: every
such answer is produced later by a live query plus the deterministic engine.

Version 1 is not a pre-generated file. It is issued by running the real staging,
approval, verification, and release path once, with its approvals explicitly
labelled demo setup.

Usage:
    python -m scripts.seed_demo [--reset]
    FALKORDB_GRAPH=<empty graph> python -m scripts.seed_demo --fresh

`--fresh` writes an authoring-start workspace instead: the same primitive facts
with no claim, occurrence or decision basis, and no edition yet. It refuses any
graph that already holds nodes, so it can never clear a workspace in use.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import domain  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.deps import get_artifact_store, get_dataset_path, get_graph_client  # noqa: E402
from app.seed import issue_version_one, node_count, reset, seed, seed_fresh  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--reset", action="store_true", help="delete the graph first")
    modes.add_argument(
        "--fresh",
        action="store_true",
        help="write an authoring-start workspace into an empty graph; never clears one",
    )
    args = parser.parse_args()

    settings = get_settings()
    graph = get_graph_client()
    store = get_artifact_store()
    csv_path = get_dataset_path()

    if args.fresh:
        # A workspace someone may be using is never cleared to make room.
        existing_nodes = node_count(graph)
        if existing_nodes:
            print(
                f"graph {graph.graph_name} already holds {existing_nodes} nodes; a fresh "
                "workspace needs an empty graph. Set FALKORDB_GRAPH to a new name."
            )
            return 1
        seed_fresh(graph, csv_path)
        print(f"graph:     {graph.graph_name} at {graph.endpoint}")
        print(f"dataset:   {settings.dataset_csv_path}")
        print("workspace: authoring start (no finding, occurrences or decision basis)")
        return 0

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
