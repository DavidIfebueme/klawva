from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.features.payments.models import Payment
from app.features.activity.models import ActivityEvent
from app.features.provisioning.models import ProvisioningJob
from app.features.reports.models import MissionReport
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

    monkeypatch.setattr(settings, "telegram_bot_token_pool", "tokenA,tokenB")
    monkeypatch.setattr(settings, "openclaw_config_path", "/tmp/test_openclaw.json")
    monkeypatch.setattr(settings, "openclaw_workspaces_dir", "/tmp/test_workspaces")
    monkeypatch.setattr(settings, "zai_api_key", "test-zai-key")
    monkeypatch.setattr(settings, "zai_base_url", "https://api.z.ai/api/paas/v4/")
    monkeypatch.setattr(settings, "zai_model", "glm-4.7")
    monkeypatch.setattr(settings, "zai_fallback_model", "glm-4.7-flash")

    import json
    from pathlib import Path

    config_path = Path("/tmp/test_openclaw.json")
    config_path.write_text(json.dumps({"agents": {"list": []}, "bindings": []}))

    workspace_dir = Path("/tmp/test_workspaces")
    workspace_dir.mkdir(parents=True, exist_ok=True)

    async def fake_read_config():
        return json.loads(config_path.read_text())

    async def fake_get_whatsapp_qr(account_id="default"):
        return "fake-qr-data", 60

    monkeypatch.setattr("app.platform.clients.openclaw_gateway.read_config", fake_read_config)
    monkeypatch.setattr("app.platform.clients.openclaw_gateway.get_whatsapp_qr", fake_get_whatsapp_qr)

    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()
    asyncio.run(drop_models())


def test_create_session(test_client: TestClient) -> None:
    response = test_client.post(
        "/api/sessions",
        json={
            "agentId": "scrapper",
            "channel": "whatsapp",
            "brief": {"task": "monitor"},
            "paymentRef": "pay_123",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert "sessionId" in body
    assert "sessionToken" in body


def test_status_activity_report_flow(test_client: TestClient) -> None:
    create_response = test_client.post(
        "/api/sessions",
        json={
            "agentId": "researcher",
            "channel": "telegram",
            "brief": {"topic": "fintech"},
            "paymentRef": "pay_456",
        },
    )
    payload = create_response.json()
    session_id = payload["sessionId"]
    headers = {"x-session-token": payload["sessionToken"]}

    status_response = test_client.get(f"/api/sessions/{session_id}/status", headers=headers)
    assert status_response.status_code == 200
    assert status_response.json()["status"] == "provisioning"

    assert status_response.json().get("connected") is None

    activity_response = test_client.get(f"/api/sessions/{session_id}/activity", headers=headers)
    assert activity_response.status_code == 200
    assert activity_response.json() == {"activities": []}

    report_response = test_client.get(f"/api/sessions/{session_id}/report", headers=headers)
    assert report_response.status_code == 200
    assert report_response.json()["summary"] == "Mission report is not ready yet."
