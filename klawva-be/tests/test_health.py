from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_ready(monkeypatch) -> None:
    async def _ready() -> bool:
        return True

    monkeypatch.setattr("app.platform.http.routes.health.is_database_ready", _ready)

    response = client.get("/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


def test_ready_not_ready(monkeypatch) -> None:
    async def _not_ready() -> bool:
        return False

    monkeypatch.setattr("app.platform.http.routes.health.is_database_ready", _not_ready)

    response = client.get("/ready")
    assert response.status_code == 503
    assert response.json() == {
        "error": {"code": "http_error", "message": "service_not_ready"}
    }


def test_not_found_envelope() -> None:
    response = client.get("/missing")
    assert response.status_code == 404
    assert response.json() == {
        "error": {"code": "http_error", "message": "Not Found"}
    }
