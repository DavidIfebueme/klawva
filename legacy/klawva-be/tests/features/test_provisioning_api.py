import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.main import app
from app.platform.config import settings
from app.platform.db.base import Base
from app.platform.db.registry import load_model_registry
from app.platform.db.session import get_async_session


@pytest.fixture
def test_client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    load_model_registry()
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)

    async def init_models() -> None:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async def drop_models() -> None:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await engine.dispose()

    async def override_get_async_session() -> AsyncSession:
        async with session_factory() as session:
            yield session

    import asyncio

    asyncio.run(init_models())
    app.dependency_overrides[get_async_session] = override_get_async_session

    monkeypatch.setattr(settings, "internal_service_token", "internal-token")
    monkeypatch.setattr(settings, "openclaw_config_path", "/tmp/test_prov_openclaw.json")
    monkeypatch.setattr(settings, "openclaw_workspaces_dir", "/tmp/test_prov_workspaces")
    monkeypatch.setattr(settings, "openclaw_agents_dir", "/tmp/test_prov_agents")
    monkeypatch.setattr(settings, "zai_api_key", "test-zai-key")
    monkeypatch.setattr(settings, "zai_base_url", "https://api.z.ai/api/paas/v4/")
    monkeypatch.setattr(settings, "zai_model", "glm-4.7")
    monkeypatch.setattr(settings, "zai_fallback_model", "glm-4.7-flash")

    config_path = Path("/tmp/test_prov_openclaw.json")
    config_path.write_text(json.dumps({"agents": {"list": []}, "bindings": []}))

    workspace_dir = Path("/tmp/test_prov_workspaces")
    workspace_dir.mkdir(parents=True, exist_ok=True)

    agents_dir = Path("/tmp/test_prov_agents")
    agents_dir.mkdir(parents=True, exist_ok=True)

    async def fake_read_config():
        return json.loads(config_path.read_text())

    monkeypatch.setattr("app.platform.clients.openclaw_gateway.read_config", fake_read_config)

    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()
    asyncio.run(drop_models())


def _create_session(client: TestClient) -> tuple[str, str]:
    response = client.post(
        "/api/sessions",
        json={
            "agentId": "scrapper",
            "channel": "whatsapp",
            "brief": {"task": "monitor"},
            "paymentRef": "pre_ref",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    return payload["sessionId"], payload["sessionToken"]


def test_start_provisioning_success(test_client: TestClient) -> None:
    session_id, session_token = _create_session(test_client)

    response = test_client.post(
        "/api/provisioning/start",
        json={"sessionId": session_id},
        headers={"x-internal-token": "internal-token"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "active"
    assert payload["agentIdInGateway"] is not None
    assert payload["attemptCount"] == 1

    status = test_client.get(
        f"/api/sessions/{session_id}/status",
        headers={"x-session-token": session_token},
    )
    assert status.status_code == 200
    assert status.json()["status"] == "ready"


def test_destroy_provisioning(test_client: TestClient) -> None:
    session_id, _ = _create_session(test_client)
    start = test_client.post(
        "/api/provisioning/start",
        json={"sessionId": session_id},
        headers={"x-internal-token": "internal-token"},
    )
    assert start.status_code == 200

    destroy = test_client.post(
        "/api/provisioning/destroy",
        json={"sessionId": session_id},
        headers={"x-internal-token": "internal-token"},
    )
    assert destroy.status_code == 200
    assert destroy.json() == {"destroyed": True}
