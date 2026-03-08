import asyncio

from runtime_bridge.config import RuntimeBridgeSettings
from runtime_bridge.runtime import BridgeRuntime


class FakeCallbackClient:
    def __init__(self):
        self.onboarding_calls = []
        self.activity_calls = []

    async def send_onboarding_event(self, **kwargs):
        self.onboarding_calls.append(kwargs)

    async def ingest_activity(self, **kwargs):
        self.activity_calls.append(kwargs)

    async def upsert_report(self, **kwargs):
        return None


class FakeTelegramClient:
    def __init__(self):
        self.sent_messages = []

    async def get_updates(self, **kwargs):
        return []

    async def send_message(self, **kwargs):
        self.sent_messages.append(kwargs)
        return True


def test_telegram_start_triggers_link_and_intro_callbacks(tmp_path):
    callback_client = FakeCallbackClient()
    telegram_client = FakeTelegramClient()
    settings = RuntimeBridgeSettings(
        bridge_internal_token="bridge-token",
        bridge_sessions_dir=str(tmp_path),
        bridge_telegram_poll_pause_seconds=1,
        bridge_telegram_poll_timeout_seconds=1,
    )
    runtime = BridgeRuntime(
        settings=settings,
        callback_client=callback_client,
        telegram_client=telegram_client,
    )

    session_id = "sess-telegram-1"
    config = {
        "session_id": session_id,
        "agent_id": "researcher",
        "channel": {
            "type": "telegram",
            "bot_token": "token-123",
        },
        "callbacks": {
            "base_url": "https://api.klawva.xyz",
            "internal_token": "bridge-token",
            "endpoints": {
                "onboarding_event": "/api/channels/onboarding/event",
                "activity_ingest": "/api/activity/ingest",
            },
        },
        "onboarding": {
            "intro_message": "Your Klawva session is live",
        },
    }

    asyncio.run(runtime.upsert_session(session_config=config))

    update = {
        "update_id": 101,
        "message": {
            "text": f"/start {session_id}",
            "chat": {"id": 555001},
            "from": {"username": "tester"},
        },
    }
    asyncio.run(runtime._handle_telegram_update(session_id=session_id, update=update))

    assert len(callback_client.onboarding_calls) == 2
    assert callback_client.onboarding_calls[0]["event_type"] == "linked"
    assert callback_client.onboarding_calls[0]["target"] == "@tester"
    assert callback_client.onboarding_calls[1]["event_type"] == "intro_sent"

    assert len(callback_client.activity_calls) == 1
    assert callback_client.activity_calls[0]["event_type"] == "channel_intro_sent"

    assert len(telegram_client.sent_messages) == 1
    assert telegram_client.sent_messages[0]["chat_id"] == 555001

    asyncio.run(runtime.shutdown())
