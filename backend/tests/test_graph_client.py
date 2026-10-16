"""How the graph client treats a dropped connection, without a live FalkorDB.

redis-py raises its own ConnectionError and TimeoutError, which do not subclass
the built-in ones. A read is retried once on a fresh connection; a write is
never re-executed, because its reply can be lost after it committed.
"""

from __future__ import annotations

import pytest
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import ResponseError
from redis.exceptions import TimeoutError as RedisTimeoutError

from app.config import get_settings
from app.graph import GraphClient, GraphUnavailable

READ = "MATCH (w:Workspace {id:$id}) RETURN w.id AS id"
WRITE = "MATCH (w:Workspace {id:$id}) SET w.context_revision = w.context_revision + 1"


class _Result:
    header = [(1, "id")]
    result_set = [["ws"]]


class _Endpoint:
    """Raises the scripted outcomes in order, then answers."""

    def __init__(self, outcomes: list[Exception]) -> None:
        self.outcomes = outcomes
        self.calls = 0

    def select_graph(self, _name: str) -> "_Endpoint":
        return self

    def query(self, _query: str, _params: dict) -> _Result:
        self.calls += 1
        if self.outcomes:
            raise self.outcomes.pop(0)
        return _Result()


@pytest.fixture()
def endpoint(monkeypatch):
    def install(outcomes: list[Exception]) -> _Endpoint:
        fake = _Endpoint(outcomes)
        monkeypatch.setattr(GraphClient, "_connect", lambda self: fake)
        monkeypatch.setattr(GraphClient, "_forget", lambda self: None)
        return fake

    return install


@pytest.mark.parametrize("error", [RedisConnectionError("reset"), RedisTimeoutError("slow")])
def test_a_read_is_retried_once_on_a_redis_connection_error(endpoint, error) -> None:
    fake = endpoint([error])
    assert GraphClient(get_settings()).run(READ, {"id": "ws"}) == [{"id": "ws"}]
    assert fake.calls == 2


def test_a_read_that_fails_twice_is_reported_unreachable(endpoint) -> None:
    fake = endpoint([RedisConnectionError("down"), RedisConnectionError("still down")])
    with pytest.raises(GraphUnavailable) as failed:
        GraphClient(get_settings()).run(READ, {"id": "ws"})
    assert failed.value.code == "GRAPH_UNREACHABLE"
    assert fake.calls == 2


@pytest.mark.parametrize("error", [RedisConnectionError("reset"), RedisTimeoutError("lost")])
def test_a_write_is_never_re_executed(endpoint, error) -> None:
    fake = endpoint([error])
    with pytest.raises(GraphUnavailable) as failed:
        GraphClient(get_settings()).run(WRITE, {"id": "ws"})
    assert failed.value.code == "GRAPH_UNREACHABLE"
    assert fake.calls == 1


def test_a_query_error_is_not_a_connection_failure(endpoint) -> None:
    fake = endpoint([ResponseError("syntax")])
    with pytest.raises(GraphUnavailable) as failed:
        GraphClient(get_settings()).run(READ, {"id": "ws"})
    assert failed.value.code == "GRAPH_QUERY_FAILED"
    assert fake.calls == 1
