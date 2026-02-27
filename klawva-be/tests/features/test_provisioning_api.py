import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.main import app
from app.platform.db.base import Base
from app.platform.db.registry import load_model_registry
from app.platform.db.session import get_async_session


class FakeDigitalOceanClient:
    def __init__(self, should_fail: bool = False) -> None:
        self.should_fail = should_fail

    async def create_openclaw_droplet(self, *, session_id: str):
        _ = session_id
        if self.should_fail:
            raise RuntimeError("create_failed")

        class Result:
            droplet_id = "12345"
            status = "new"

        return Result()

    async def add_droplet_tag(self, *, droplet_id: str, tag: str) -> None:
        _ = droplet_id, tag

    async def destroy_droplet(self, *, droplet_id: str) -> None:
        _ = droplet_id


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

    monkeypatch.setattr(
        "app.features.provisioning.service.DigitalOceanClient",
        lambda: FakeDigitalOceanClient(),
    )

    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()
    asyncio.run(drop_models())


def _create_session(client: TestClient) -> str:
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
    return response.json()["sessionId"]


def test_start_provisioning_success(test_client: TestClient) -> None:
    session_id = _create_session(test_client)

    response = test_client.post("/api/provisioning/start", json={"sessionId": session_id})

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "active"
    assert payload["dropletId"] == "12345"
    assert payload["attemptCount"] == 1

    status = test_client.get(f"/api/sessions/{session_id}/status")
    assert status.status_code == 200
    assert status.json()["status"] == "ready"


def test_start_provisioning_failure_retry(
    test_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    session_id = _create_session(test_client)
    monkeypatch.setattr(
        "app.features.provisioning.service.DigitalOceanClient",
        lambda: FakeDigitalOceanClient(should_fail=True),
    )

    response = test_client.post("/api/provisioning/start", json={"sessionId": session_id})
    assert response.status_code == 502


def test_destroy_provisioning(test_client: TestClient) -> None:
    session_id = _create_session(test_client)
    start = test_client.post("/api/provisioning/start", json={"sessionId": session_id})
    assert start.status_code == 200

    destroy = test_client.post("/api/provisioning/destroy", json={"sessionId": session_id})
    assert destroy.status_code == 200
    assert destroy.json() == {"destroyed": True}


def test_bootstrap_provisioned_session(test_client: TestClient) -> None:
    session_id = _create_session(test_client)
    start = test_client.post("/api/provisioning/start", json={"sessionId": session_id})
    assert start.status_code == 200

    bootstrap = test_client.post("/api/provisioning/bootstrap", json={"sessionId": session_id})
    assert bootstrap.status_code == 200
    assert bootstrap.json()["status"] == "bootstrapped"

    status = test_client.get(f"/api/sessions/{session_id}/status")
    assert status.status_code == 200
    assert status.json()["status"] == "active"
    assert status.json()["connected"] is True

    activity = test_client.get(f"/api/sessions/{session_id}/activity")
    assert activity.status_code == 200
    activities = activity.json()["activities"]
    assert any(item["text"] == "OpenClaw bootstrap completed" for item in activities)


def test_bootstrap_requires_provisioning(test_client: TestClient) -> None:
    session_id = _create_session(test_client)

    bootstrap = test_client.post("/api/provisioning/bootstrap", json={"sessionId": session_id})
    assert bootstrap.status_code == 409
