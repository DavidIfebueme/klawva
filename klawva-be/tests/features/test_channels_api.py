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
    monkeypatch.setattr(settings, "telegram_bot_token_pool", "tokenA,tokenB")
    monkeypatch.setattr(settings, "internal_service_token", "internal-token")

    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()
    asyncio.run(drop_models())


def _create_session(client: TestClient, *, agent: str, channel: str) -> tuple[str, str]:
    response = client.post(
        "/api/sessions",
        json={
            "agentId": agent,
            "channel": channel,
            "brief": {"task": "work"},
            "paymentRef": "pref",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    return payload["sessionId"], payload["sessionToken"]


def test_get_session_qr(test_client: TestClient) -> None:
    session_id, session_token = _create_session(test_client, agent="scrapper", channel="whatsapp")

    response = test_client.get(
        f"/api/sessions/{session_id}/qr",
        headers={"x-session-token": session_token},
    )

    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload["qr"], str)
    assert payload["expiresIn"] == 60


def test_assign_telegram_token_non_vendor(test_client: TestClient) -> None:
    session_id, _ = _create_session(test_client, agent="researcher", channel="telegram")

    response = test_client.post(
        "/api/channels/telegram/assign",
        json={"sessionId": session_id},
        headers={"x-internal-token": "internal-token"},
    )

    assert response.status_code == 200
    assert response.json()["token"] == "tokenA"
    assert "deepLink" in response.json()


def test_assign_telegram_token_vendor_rejected(test_client: TestClient) -> None:
    session_id, _ = _create_session(test_client, agent="vendor", channel="telegram")

    response = test_client.post(
        "/api/channels/telegram/assign",
        json={"sessionId": session_id},
        headers={"x-internal-token": "internal-token"},
    )

    assert response.status_code == 409
    assert response.json() == {
        "error": {"code": "http_error", "message": "vendor_telegram_not_allowed"}
    }


def test_onboarding_event_updates_channel_link(test_client: TestClient) -> None:
    session_id, _ = _create_session(test_client, agent="researcher", channel="telegram")

    assign = test_client.post(
        "/api/channels/telegram/assign",
        json={"sessionId": session_id},
        headers={"x-internal-token": "internal-token"},
    )
    assert assign.status_code == 200

    linked = test_client.post(
        "/api/channels/onboarding/event",
        json={
            "sessionId": session_id,
            "channel": "telegram",
            "eventType": "linked",
            "target": "@user123",
            "callbackEventId": "cb_link_1",
        },
        headers={"x-internal-token": "internal-token"},
    )
    assert linked.status_code == 200
    assert linked.json() == {
        "status": "linked",
        "target": "@user123",
        "callbackEventId": "cb_link_1",
    }

    intro = test_client.post(
        "/api/channels/onboarding/event",
        json={
            "sessionId": session_id,
            "channel": "telegram",
            "eventType": "intro_sent",
            "callbackEventId": "cb_intro_1",
        },
        headers={"x-internal-token": "internal-token"},
    )
    assert intro.status_code == 200
    assert intro.json()["status"] == "intro_sent"
    assert intro.json()["callbackEventId"] == "cb_intro_1"


def test_explicit_onboarding_callbacks(test_client: TestClient) -> None:
    session_id, _ = _create_session(test_client, agent="researcher", channel="telegram")

    assign = test_client.post(
        "/api/channels/telegram/assign",
        json={"sessionId": session_id},
        headers={"x-internal-token": "internal-token"},
    )
    assert assign.status_code == 200

    link_confirmed = test_client.post(
        "/api/channels/onboarding/link-confirmed",
        json={
            "sessionId": session_id,
            "channel": "telegram",
            "target": "@user99",
            "callbackEventId": "cb_link_explicit",
        },
        headers={"x-internal-token": "internal-token"},
    )
    assert link_confirmed.status_code == 200
    assert link_confirmed.json() == {
        "status": "linked",
        "target": "@user99",
        "callbackEventId": "cb_link_explicit",
    }

    intro_delivered = test_client.post(
        "/api/channels/onboarding/intro-delivered",
        json={
            "sessionId": session_id,
            "channel": "telegram",
            "callbackEventId": "cb_intro_explicit",
        },
        headers={"x-internal-token": "internal-token"},
    )
    assert intro_delivered.status_code == 200
    assert intro_delivered.json() == {
        "status": "intro_sent",
        "target": "@user99",
        "callbackEventId": "cb_intro_explicit",
    }


def test_onboarding_event_supports_terminated_state(test_client: TestClient) -> None:
    session_id, _ = _create_session(test_client, agent="researcher", channel="telegram")

    assign = test_client.post(
        "/api/channels/telegram/assign",
        json={"sessionId": session_id},
        headers={"x-internal-token": "internal-token"},
    )
    assert assign.status_code == 200

    terminated = test_client.post(
        "/api/channels/onboarding/event",
        json={
            "sessionId": session_id,
            "channel": "telegram",
            "eventType": "terminated",
            "callbackEventId": "cb_terminated_1",
        },
        headers={"x-internal-token": "internal-token"},
    )
    assert terminated.status_code == 200
    assert terminated.json() == {
        "status": "terminated",
        "target": assign.json().get("deepLink"),
        "callbackEventId": "cb_terminated_1",
    }


def test_onboarding_event_is_idempotent_for_replayed_callback_id(test_client: TestClient) -> None:
    session_id, session_token = _create_session(test_client, agent="researcher", channel="telegram")

    assign = test_client.post(
        "/api/channels/telegram/assign",
        json={"sessionId": session_id},
        headers={"x-internal-token": "internal-token"},
    )
    assert assign.status_code == 200

    payload = {
        "sessionId": session_id,
        "channel": "telegram",
        "eventType": "linked",
        "target": "@idempotent_user",
        "callbackEventId": "cb_replay_linked_1",
    }
    first = test_client.post(
        "/api/channels/onboarding/event",
        json=payload,
        headers={"x-internal-token": "internal-token"},
    )
    second = test_client.post(
        "/api/channels/onboarding/event",
        json=payload,
        headers={"x-internal-token": "internal-token"},
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json() == first.json()

    activity = test_client.get(
        f"/api/sessions/{session_id}/activity",
        headers={"x-session-token": session_token},
    )
    assert activity.status_code == 200
    connected_events = [
        item for item in activity.json()["activities"] if item.get("text") == "Telegram channel connected"
    ]
    assert len(connected_events) == 1
