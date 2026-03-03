import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.main import app
from app.platform.config import settings
from app.platform.db.base import Base
from app.platform.db.registry import load_model_registry
from app.platform.db.session import get_async_session
from app.platform.security.redaction import redact_sensitive


class FakeDigitalOceanClient:
    async def create_openclaw_droplet(
        self, *, session_id: str, user_data=None, ssh_keys=None
    ):
        _ = session_id, user_data, ssh_keys

        class Result:
            droplet_id = "12345"
            status = "new"

        return Result()

    async def get_droplet(self, *, droplet_id: str) -> dict:
        return {
            "id": droplet_id,
            "networks": {"v4": [{"ip_address": "10.0.0.1", "type": "public"}]},
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
    monkeypatch.setattr(settings, "internal_service_token", "secret-token")
    monkeypatch.setattr(settings, "rate_limit_per_minute", 200)
    monkeypatch.setattr(
        "app.features.provisioning.pool.DigitalOceanClient",
        lambda: FakeDigitalOceanClient(),
    )
    monkeypatch.setattr(
        "app.features.provisioning.pool.DropletAgentClient",
        lambda: FakeDropletAgentClient(),
    )
    monkeypatch.setattr(settings, "droplet_agent_gateway_port", 9090)
    monkeypatch.setattr(settings, "droplet_max_sessions", 5)
    monkeypatch.setattr(settings, "digitalocean_region", "nyc1")
    monkeypatch.setattr(settings, "digitalocean_ssh_key_fingerprints", "")

    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()
    asyncio.run(drop_models())


def test_redaction() -> None:
    assert redact_sensitive("Bearer token abc") == "[REDACTED]"
    assert redact_sensitive("plain message") == "plain message"


def test_internal_auth_required(test_client: TestClient) -> None:
    response = test_client.post(
        "/api/provisioning/start",
        json={"sessionId": "x", "sessionConfig": {"session_id": "x"}},
    )
    assert response.status_code == 401
    assert response.json() == {
        "error": {"code": "unauthorized", "message": "invalid_internal_token"}
    }


def test_internal_auth_success(test_client: TestClient) -> None:
    create = test_client.post(
        "/api/sessions",
        json={
            "agentId": "scrapper",
            "channel": "whatsapp",
            "brief": {"task": "m"},
            "paymentRef": "r",
        },
    )
    session_id = create.json()["sessionId"]

    response = test_client.post(
        "/api/provisioning/start",
        json={"sessionId": session_id, "sessionConfig": {"session_id": session_id}},
        headers={"x-internal-token": "secret-token"},
    )
    assert response.status_code == 200
