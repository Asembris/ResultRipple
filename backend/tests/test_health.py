from fastapi.testclient import TestClient


def test_health_is_live_without_touching_the_graph(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "resultripple-api"
    assert body["version"]
