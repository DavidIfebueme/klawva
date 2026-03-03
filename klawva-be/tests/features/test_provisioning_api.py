import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.main import app
from app.platform.config import settings
from app.platform.db.base import Base
from app.platform.db.registry import load_model_registry
from app.platform.db.session import get_async_session


class FakeDigitalOceanClient:
    def __init__(self, should_fail: bool = False) -> None:
        self.should_fail = should_fail

    async def create_openclaw_droplet(
        self,
        *,
        session_id: str,
        user_data: str | None = None,
        ssh_keys: list[str] | None = None,
    ):
        _ = session_id, user_data, ssh_keys
        if self.should_fail:
            raise RuntimeError("create_failed")

        class Result:
            droplet_id = "12345"
            status = "new"

        return Result()

    async def get_droplet(self, *, droplet_id: str) -> dict:
        return {
            "id": droplet_id,
            "networks": {
                "v4": [{"ip_address": "10.0.0.99", "type": "public"}]
            },
        }

    async def destroy_droplet(self, *, droplet_id: str) -> None:
        _ = droplet_id

    @staticmethod
    def extract_public_ipv4(droplet_data: dict) -> str | None:
        for net in droplet_data.get("networks", {}).get("v4", []):
            if net.get("type") == "public":
                return net["ip_address"]
        return None


class FakeDropletAgentClient:
    async def push_session(self, *, droplet_ip, session_config):
        pass

    async def remove_session(self, *, droplet_ip, session_id):
        pass


class FakeOpenClawRuntimeClient:
    async def dispatch_bootstrap(self, payload: dict[str, object]) -> None:
        _ = payload


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
        "app.features.provisioning.pool.DigitalOceanClient",
        lambda: FakeDigitalOceanClient(),
    )
    monkeypatch.setattr(
        "app.features.provisioning.pool.DropletAgentClient",
        lambda: FakeDropletAgentClient(),
    )
    monkeypatch.setattr(
        "app.features.provisioning.bootstrap.OpenClawRuntimeClient",
        lambda: FakeOpenClawRuntimeClient(),
    )
    monkeypatch.setattr(settings, "internal_service_token", "internal-token")
    monkeypatch.setattr(settings, "droplet_agent_gateway_port", 9090)
    monkeypatch.setattr(settings, "droplet_max_sessions", 5)
    monkeypatch.setattr(settings, "digitalocean_region", "nyc1")
    monkeypatch.setattr(settings, "digitalocean_ssh_key_fingerprints", "")

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


def _sample_config(session_id: str) -> dict:
    return {
        "session_id": session_id,
        "agent_id": "scrapper",
        "channel": {"type": "whatsapp"},
    }


def test_start_provisioning_success(test_client: TestClient) -> None:
    session_id, session_token = _create_session(test_client)

    response = test_client.post(
        "/api/provisioning/start",
        json={"sessionId": session_id, "sessionConfig": _sample_config(session_id)},
        headers={"x-internal-token": "internal-token"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "active"
    assert payload["dropletId"] == "12345"
    assert payload["attemptCount"] == 1

    status = test_client.get(
        f"/api/sessions/{session_id}/status",
        headers={"x-session-token": session_token},
    )
    assert status.status_code == 200
    assert status.json()["status"] == "ready"


def test_start_provisioning_failure_retry(
    test_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    session_id, _ = _create_session(test_client)
    monkeypatch.setattr(
        "app.features.provisioning.pool.DigitalOceanClient",
        lambda: FakeDigitalOceanClient(should_fail=True),
    )

    response = test_client.post(
        "/api/provisioning/start",
        json={"sessionId": session_id, "sessionConfig": _sample_config(session_id)},
        headers={"x-internal-token": "internal-token"},
    )
    assert response.status_code == 502


def test_destroy_provisioning(test_client: TestClient) -> None:
    session_id, _ = _create_session(test_client)
    start = test_client.post(
        "/api/provisioning/start",
        json={"sessionId": session_id, "sessionConfig": _sample_config(session_id)},
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


def test_bootstrap_provisioned_session(test_client: TestClient) -> None:
    session_id, session_token = _create_session(test_client)
    start = test_client.post(
        "/api/provisioning/start",
        json={"sessionId": session_id, "sessionConfig": _sample_config(session_id)},
        headers={"x-internal-token": "internal-token"},
    )
    assert start.status_code == 200

    bootstrap = test_client.post(
        "/api/provisioning/bootstrap",
        json={"sessionId": session_id},
        headers={"x-internal-token": "internal-token"},
    )
    assert bootstrap.status_code == 200
    assert bootstrap.json()["status"] == "bootstrapped"

    status = test_client.get(
        f"/api/sessions/{session_id}/status",
        headers={"x-session-token": session_token},
    )
    assert status.status_code == 200
    assert status.json()["status"] == "active"
    assert status.json()["connected"] is True

    activity = test_client.get(
        f"/api/sessions/{session_id}/activity",
        headers={"x-session-token": session_token},
    )
    assert activity.status_code == 200
    activities = activity.json()["activities"]
    assert any(item["text"] == "OpenClaw bootstrap completed" for item in activities)


def test_bootstrap_requires_provisioning(test_client: TestClient) -> None:
    session_id, _ = _create_session(test_client)

    bootstrap = test_client.post(
        "/api/provisioning/bootstrap",
        json={"sessionId": session_id},
        headers={"x-internal-token": "internal-token"},
    )
    assert bootstrap.status_code == 409
