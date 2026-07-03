import hashlib
import hmac
import time
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.features.channels.models import ChannelLink
from app.features.provisioning.service import _resolve_channel_binding
from app.features.sessions.models import Session
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
    monkeypatch.setattr(settings, "whatsapp_klawva_account_pool", "account1,account2")
    monkeypatch.setattr(settings, "internal_service_token", "internal-token")

    async def fake_get_whatsapp_qr(account_id: str):
        return "mock_qr_data", 60

    monkeypatch.setattr(
        "app.platform.clients.openclaw_gateway.get_whatsapp_qr", fake_get_whatsapp_qr
    )

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
    session_id, session_token = _create_session(test_client, agent="vendor", channel="whatsapp")

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
        item
        for item in activity.json()["activities"]
        if item.get("text") == "Telegram channel connected"
    ]
    assert len(connected_events) == 1


def test_assign_telegram_reuses_token_from_completed_session(test_client: TestClient) -> None:
    first_session_id, _ = _create_session(test_client, agent="researcher", channel="telegram")

    first_assign = test_client.post(
        "/api/channels/telegram/assign",
        json={"sessionId": first_session_id},
        headers={"x-internal-token": "internal-token"},
    )
    assert first_assign.status_code == 200
    assert first_assign.json()["token"] == "tokenA"

    import asyncio

    async def mark_first_session_completed() -> None:
        override = app.dependency_overrides[get_async_session]
        async for db in override():
            session = await db.get(Session, first_session_id)
            assert session is not None
            session.status = "completed"
            session.completed_at = datetime.now(UTC)
            await db.commit()

    asyncio.run(mark_first_session_completed())

    second_session_id, _ = _create_session(test_client, agent="researcher", channel="telegram")

    second_assign = test_client.post(
        "/api/channels/telegram/assign",
        json={"sessionId": second_session_id},
        headers={"x-internal-token": "internal-token"},
    )
    assert second_assign.status_code == 200
    assert second_assign.json()["token"] == "tokenA"


def _telegram_widget_payload(user_id: int, bot_token: str) -> dict:
    auth_date = int(time.time())
    data = {
        "id": user_id,
        "first_name": "Test",
        "auth_date": auth_date,
    }
    data_pairs = [f"{k}={v}" for k, v in sorted(data.items())]
    data_check_string = "\n".join(data_pairs)
    secret_key = hashlib.sha256(bot_token.encode("utf-8")).digest()
    hash_value = hmac.new(
        secret_key, data_check_string.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    data["hash"] = hash_value
    return data


def test_telegram_auth_stores_user_id(
    test_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    bot_token = "test-auth-bot-token"
    monkeypatch.setattr(settings, "telegram_auth_bot_token", bot_token)

    session_id, session_token = _create_session(
        test_client, agent="researcher", channel="telegram"
    )

    user = _telegram_widget_payload(123456789, bot_token)
    response = test_client.post(
        "/api/channels/telegram/auth",
        json={"sessionId": session_id, "user": user},
        headers={"x-session-token": session_token},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["stored"] is True
    assert payload["telegramUserId"] == "123456789"


def test_telegram_auth_rejects_invalid_hash(
    test_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    bot_token = "test-auth-bot-token"
    monkeypatch.setattr(settings, "telegram_auth_bot_token", bot_token)

    session_id, session_token = _create_session(
        test_client, agent="researcher", channel="telegram"
    )

    user = _telegram_widget_payload(123456789, bot_token)
    user["hash"] = "invalid-hash"
    response = test_client.post(
        "/api/channels/telegram/auth",
        json={"sessionId": session_id, "user": user},
        headers={"x-session-token": session_token},
    )

    assert response.status_code == 200
    assert response.json()["stored"] is False


def test_telegram_auth_rejects_non_telegram_session(
    test_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    bot_token = "test-auth-bot-token"
    monkeypatch.setattr(settings, "telegram_auth_bot_token", bot_token)

    session_id, session_token = _create_session(
        test_client, agent="scrapper", channel="whatsapp"
    )

    user = _telegram_widget_payload(123456789, bot_token)
    response = test_client.post(
        "/api/channels/telegram/auth",
        json={"sessionId": session_id, "user": user},
        headers={"x-session-token": session_token},
    )

    assert response.status_code == 200
    assert response.json()["stored"] is False


def test_resolve_channel_binding_pre_locks_telegram(
    test_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import tempfile

    with tempfile.TemporaryDirectory() as tmpdir:
        map_path = f"{tmpdir}/telegram_accounts.json"
        monkeypatch.setattr(settings, "telegram_accounts_map_path", map_path)

        session = Session(agent_id="scrapper", channel="telegram", brief={"task": "work"})
        link = ChannelLink(
            session_id=session.id,
            channel="telegram",
            status="assigned",
            external_id="bot-token-123",
            telegram_user_id="12345",
        )
        channel_type, account_id, account_config = _resolve_channel_binding(session, link)

        assert channel_type == "telegram"
        assert account_config["dmPolicy"] == "allowlist"
        assert account_config["allowFrom"] == ["12345"]
        assert account_config["enabled"] is True
