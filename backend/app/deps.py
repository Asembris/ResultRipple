"""Shared dependency providers.

One place builds the graph client, the artifact store, and the dataset path, so
tests can point the whole application at an isolated graph and volume.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from .artifacts import ArtifactStore
from .config import get_settings
from .graph import GraphClient


def get_graph_client() -> GraphClient:
    return GraphClient(settings=get_settings())


@lru_cache(maxsize=4)
def _store(root: str) -> ArtifactStore:
    return ArtifactStore(Path(root))


def get_artifact_store() -> ArtifactStore:
    return _store(str(get_settings().artifact_root))


def get_dataset_path() -> Path:
    return get_settings().dataset_csv_path
