from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.features.payments.models import Payment
from app.features.activity.models import ActivityEvent
from app.features.reports.models import MissionReport
from app.main import app
from app.platform.config import settings
from app.platform.db.base import Base
from app.platform.db.registry import load_model_registry
from app.platform.db.session import get_async_session


class FakeDigitalOceanClient:
    async def create_openclaw_droplet(
        self,
        *,
        session_id: str,
        user_data: str | None = None,
        ssh_keys: list[str] | None = None,
    ):
        _ = session_id, user_data, ssh_keys

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
    monkeypatch.setattr(settings, "telegram_bot_token_pool", "tokenA,tokenB")
    monkeypatch.setattr(settings, "droplet_agent_gateway_port", 9090)
    monkeypatch.setattr(settings, "droplet_max_sessions", 5)
    monkeypatch.setattr(settings, "digitalocean_region", "nyc1")
    monkeypatch.setattr(settings, "digitalocean_ssh_key_fingerprints", "")
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


def test_activity_and_report_entries(test_client: TestClient) -> None:
    create_response = test_client.post(
        "/api/sessions",
        json={
            "agentId": "vendor",
            "channel": "whatsapp",
            "brief": {"catalog": "v1"},
            "paymentRef": "pay_789",
        },
    )
    payload = create_response.json()
    session_id = payload["sessionId"]
    headers = {"x-session-token": payload["sessionToken"]}

    import asyncio

    async def seed_data() -> None:
        override = app.dependency_overrides[get_async_session]
        async for db in override():
            db.add(
                ActivityEvent(
                    session_id=session_id,
                    event_type="agent_update",
                    payload={"text": "Agent started"},
                )
            )
            db.add(
                MissionReport(
                    session_id=session_id,
                    summary="Work completed",
                    report_data={"stats": [{"label": "Pages", "value": "12"}]},
                    delivered_at=datetime.now(UTC),
                )
            )
            await db.commit()

    asyncio.run(seed_data())

    activity_response = test_client.get(f"/api/sessions/{session_id}/activity", headers=headers)
    assert activity_response.status_code == 200
    activities = activity_response.json()["activities"]
    assert len(activities) == 1
    assert activities[0]["text"] == "Agent started"

    report_response = test_client.get(f"/api/sessions/{session_id}/report", headers=headers)
    assert report_response.status_code == 200
    assert report_response.json()["stats"] == [{"label": "Pages", "value": "12"}]
    assert report_response.json()["summary"] == "Work completed"


def test_activate_requires_initialized_payment(test_client: TestClient) -> None:
    create_response = test_client.post(
        "/api/sessions",
        json={
            "agentId": "researcher",
            "channel": "telegram",
            "brief": {"topic": "fintech"},
            "paymentRef": "pay_gate_1",
        },
    )
    payload = create_response.json()
    session_id = payload["sessionId"]
    headers = {"x-session-token": payload["sessionToken"]}

    activation = test_client.post(f"/api/sessions/{session_id}/activate", headers=headers)
    assert activation.status_code == 422
    assert activation.json() == {
        "error": {"code": "http_error", "message": "payment_not_initialized"}
    }


def test_activate_rejects_unconfirmed_payment(test_client: TestClient) -> None:
    create_response = test_client.post(
        "/api/sessions",
        json={
            "agentId": "researcher",
            "channel": "telegram",
            "brief": {"topic": "fintech"},
            "paymentRef": "pay_gate_pending",
        },
    )
    payload = create_response.json()
    session_id = payload["sessionId"]
    headers = {"x-session-token": payload["sessionToken"]}

    import asyncio

    async def seed_pending_payment() -> None:
        override = app.dependency_overrides[get_async_session]
        async for db in override():
            db.add(
                Payment(
                    session_id=session_id,
                    provider="paystack",
                    provider_reference="pay_ref_pending_1",
                    amount_minor=250000,
                    currency="NGN",
                    status="pending",
                )
            )
            await db.commit()

    asyncio.run(seed_pending_payment())

    activation = test_client.post(f"/api/sessions/{session_id}/activate", headers=headers)
    assert activation.status_code == 409
    assert activation.json() == {
        "error": {"code": "http_error", "message": "payment_not_confirmed"}
    }


def test_activate_with_confirmed_payment(test_client: TestClient) -> None:
    create_response = test_client.post(
        "/api/sessions",
        json={
            "agentId": "researcher",
            "channel": "telegram",
            "brief": {"topic": "fintech"},
            "paymentRef": "pay_gate_2",
        },
    )
    payload = create_response.json()
    session_id = payload["sessionId"]
    headers = {"x-session-token": payload["sessionToken"]}

    import asyncio

    async def seed_payment() -> None:
        override = app.dependency_overrides[get_async_session]
        async for db in override():
            db.add(
                Payment(
                    session_id=session_id,
                    provider="paystack",
                    provider_reference="pay_ref_confirmed_1",
                    amount_minor=250000,
                    currency="NGN",
                    status="confirmed",
                    confirmed_at=datetime.now(UTC),
                )
            )
            await db.commit()

    asyncio.run(seed_payment())

    activation = test_client.post(f"/api/sessions/{session_id}/activate", headers=headers)
    assert activation.status_code == 200
    body = activation.json()
    assert body["status"] == "active"
    assert body["telegramToken"] is None
    assert "telegramDeepLink" in body
