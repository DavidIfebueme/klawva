import asyncio
import json

from fastapi.testclient import TestClient

from runtime_bridge.app import create_runtime_bridge_app
from runtime_bridge.config import RuntimeBridgeSettings
from runtime_bridge.runtime import BridgeRuntime


class FakeCallbackClient:
    def __init__(self):
        self.onboarding_calls = []

    async def send_onboarding_event(self, **kwargs):
        self.onboarding_calls.append(kwargs)

    async def ingest_activity(self, **kwargs):
        return None

    async def upsert_report(self, **kwargs):
        return None


class FakeTelegramClient:
    async def get_updates(self, **kwargs):
        return []

    async def send_message(self, **kwargs):
        return True


def _make_session_config(session_id: str, channel: str) -> dict:
    payload = {
        "session_id": session_id,
        "agent_id": "researcher",
        "channel": {"type": channel},
        "callbacks": {
            "base_url": "https://api.klawva.xyz",
            "internal_token": "bridge-token",
            "endpoints": {
                "onboarding_event": "/api/channels/onboarding/event",
                "activity_ingest": "/api/activity/ingest",
                "report_upsert": "/api/reports/upsert",
            },
        },
        "onboarding": {"intro_message": "hello"},
    }
    if channel == "telegram":
        payload["channel"]["bot_token"] = "bot-token"
    return payload


def test_runtime_bridge_api_requires_internal_token(tmp_path, monkeypatch):
    settings = RuntimeBridgeSettings(
        bridge_internal_token="bridge-token",
        bridge_sessions_dir=str(tmp_path),
        bridge_telegram_poll_pause_seconds=1,
        bridge_telegram_poll_timeout_seconds=1,
    )
    runtime = BridgeRuntime(
        settings=settings,
        callback_client=FakeCallbackClient(),
        telegram_client=FakeTelegramClient(),
    )

    from runtime_bridge import app as bridge_app_module

    monkeypatch.setattr(bridge_app_module, "runtime_bridge_settings", settings)

    app = create_runtime_bridge_app(runtime)
    client = TestClient(app)

    unauthorized = client.post("/sessions", json=_make_session_config("sess-1", "telegram"))
    assert unauthorized.status_code == 401


def test_runtime_bridge_upsert_delete_and_whatsapp_event(tmp_path, monkeypatch):
    settings = RuntimeBridgeSettings(
        bridge_internal_token="bridge-token",
        bridge_sessions_dir=str(tmp_path),
        bridge_telegram_poll_pause_seconds=1,
        bridge_telegram_poll_timeout_seconds=1,
    )
    callback_client = FakeCallbackClient()
    runtime = BridgeRuntime(
        settings=settings,
        callback_client=callback_client,
        telegram_client=FakeTelegramClient(),
    )

    from runtime_bridge import app as bridge_app_module

    monkeypatch.setattr(bridge_app_module, "runtime_bridge_settings", settings)

    app = create_runtime_bridge_app(runtime)
    client = TestClient(app)
    headers = {"x-internal-token": "bridge-token"}

    upsert = client.post("/sessions", json=_make_session_config("sess-2", "whatsapp"), headers=headers)
    assert upsert.status_code == 200
    assert upsert.json() == {"sessionId": "sess-2", "accepted": True, "channel": "whatsapp"}

    saved = tmp_path / "sess-2.json"
    assert saved.exists()
    stored = json.loads(saved.read_text())
    assert stored["session_id"] == "sess-2"

    event = client.post(
        "/channels/whatsapp/event",
        json={"sessionId": "sess-2", "eventType": "linked", "target": "+2340000000000"},
        headers=headers,
    )
    assert event.status_code == 200
    assert event.json() == {"accepted": True, "sessionId": "sess-2"}
    assert len(callback_client.onboarding_calls) == 1
    assert callback_client.onboarding_calls[0]["event_type"] == "linked"

    deleted = client.delete("/sessions/sess-2", headers=headers)
    assert deleted.status_code == 200
    assert deleted.json() == {"sessionId": "sess-2", "removed": True}
    assert not saved.exists()

    asyncio.run(runtime.shutdown())


def test_runtime_bridge_uses_token_file_fallback(tmp_path, monkeypatch):
    token_file = tmp_path / "gateway_token"
    token_file.write_text("file-token")

    settings = RuntimeBridgeSettings(
        bridge_internal_token="",
        bridge_internal_token_file=str(token_file),
        bridge_sessions_dir=str(tmp_path / "sessions"),
        bridge_telegram_poll_pause_seconds=1,
        bridge_telegram_poll_timeout_seconds=1,
    )
    runtime = BridgeRuntime(
        settings=settings,
        callback_client=FakeCallbackClient(),
        telegram_client=FakeTelegramClient(),
    )

    from runtime_bridge import app as bridge_app_module

    monkeypatch.setattr(bridge_app_module, "runtime_bridge_settings", settings)

    app = create_runtime_bridge_app(runtime)
    client = TestClient(app)
    response = client.post(
        "/sessions",
        json=_make_session_config("sess-file-token", "whatsapp"),
        headers={"x-internal-token": "file-token"},
    )
    assert response.status_code == 200

    asyncio.run(runtime.shutdown())
