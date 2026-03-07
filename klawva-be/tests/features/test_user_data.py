import json
from datetime import UTC, datetime
from unittest.mock import MagicMock

import pytest

from app.features.provisioning.user_data import (
    AGENT_BOOTSTRAP_PROFILE,
    build_session_config,
    build_user_data_script,
)


def _make_session(
    agent_id: str = "scrapper",
    channel: str = "whatsapp",
    brief: dict | None = None,
) -> MagicMock:
    session = MagicMock()
    session.id = "aaa-bbb-ccc"
    session.agent_id = agent_id
    session.channel = channel
    session.brief = brief or {"task": "monitor prices"}
    session.started_at = datetime(2026, 3, 3, 10, 0, 0, tzinfo=UTC)
    session.expires_at = datetime(2026, 3, 4, 10, 0, 0, tzinfo=UTC)
    return session


def _make_channel_link(
    channel: str = "whatsapp",
    external_id: str | None = None,
    qr_payload: str | None = None,
    link_target: str | None = None,
) -> MagicMock:
    link = MagicMock()
    link.channel = channel
    link.external_id = external_id
    link.qr_payload = qr_payload
    link.link_target = link_target
    return link


def test_build_session_config_contains_all_keys():
    session = _make_session()
    link = _make_channel_link(qr_payload="qr_data_here")
    config = build_session_config(session, link)

    expected_keys = {
        "session_id",
        "agent_id",
        "agent_profile",
        "channel",
        "brief",
        "session_window",
        "callbacks",
        "inference",
        "onboarding",
    }
    assert set(config.keys()) == expected_keys


def test_build_session_config_agent_profile():
    for agent_id in ("scrapper", "vendor", "researcher"):
        session = _make_session(agent_id=agent_id)
        config = build_session_config(session, None)
        assert config["agent_profile"] == AGENT_BOOTSTRAP_PROFILE[agent_id]


def test_build_session_config_unknown_agent():
    session = _make_session(agent_id="unknown_agent")
    config = build_session_config(session, None)
    assert config["agent_profile"] == {}


def test_build_session_config_whatsapp_channel():
    session = _make_session(channel="whatsapp")
    link = _make_channel_link(
        channel="whatsapp",
        qr_payload="qr_data",
        link_target=None,
        external_id=None,
    )
    config = build_session_config(session, link)

    assert config["channel"]["type"] == "whatsapp"
    assert config["channel"]["qr_payload"] == "qr_data"
    assert config["channel"]["bot_token"] is None
    assert config["channel"]["deep_link"] is None


def test_build_session_config_telegram_channel():
    session = _make_session(channel="telegram")
    link = _make_channel_link(
        channel="telegram",
        external_id="bot_token_abc",
        link_target="https://t.me/bot?start=xyz",
    )
    config = build_session_config(session, link)

    assert config["channel"]["type"] == "telegram"
    assert config["channel"]["bot_token"] == "bot_token_abc"
    assert config["channel"]["deep_link"] == "https://t.me/bot?start=xyz"


def test_build_session_config_no_channel_link():
    session = _make_session()
    config = build_session_config(session, None)

    assert config["channel"] == {"type": "whatsapp"}
    assert "bot_token" not in config["channel"]


def test_build_session_config_session_window():
    session = _make_session()
    config = build_session_config(session, None)
    window = config["session_window"]

    assert window["started_at"] == "2026-03-03T10:00:00+00:00"
    assert window["expires_at"] == "2026-03-04T10:00:00+00:00"
    assert window["duration_hours"] == 24


def test_build_session_config_session_window_nulls():
    session = _make_session()
    session.started_at = None
    session.expires_at = None
    config = build_session_config(session, None)

    assert config["session_window"]["started_at"] is None
    assert config["session_window"]["expires_at"] is None


def test_build_session_config_callbacks(monkeypatch):
    from app.platform.config import settings

    monkeypatch.setattr(settings, "frontend_api_base_url", "https://api.klawva.xyz")
    monkeypatch.setattr(settings, "internal_service_token", "secret_token")

    session = _make_session()
    config = build_session_config(session, None)
    cb = config["callbacks"]

    assert cb["base_url"] == "https://api.klawva.xyz"
    assert cb["internal_token"] == "secret_token"
    assert cb["endpoints"]["onboarding_event"] == "/api/channels/onboarding/event"
    assert "/api/channels/onboarding/link-confirmed" in cb["endpoints"]["link_confirmed"]
    assert cb["endpoints"]["intro_delivered"] == "/api/channels/onboarding/intro-delivered"
    assert cb["endpoints"]["activity_ingest"] == "/api/activity/ingest"
    assert cb["endpoints"]["report_upsert"] == "/api/reports/upsert"


def test_build_session_config_inference(monkeypatch):
    from app.platform.config import settings

    monkeypatch.setattr(settings, "gradient_base_url", "https://inference.test.run")
    monkeypatch.setattr(settings, "gradient_model_access_key", "key_123")
    monkeypatch.setattr(settings, "gradient_preferred_model", "model-a")
    monkeypatch.setattr(settings, "gradient_fallback_model", "model-b")

    session = _make_session()
    config = build_session_config(session, None)
    inf = config["inference"]

    assert inf["provider"] == "gradient"
    assert inf["base_url"] == "https://inference.test.run"
    assert inf["access_key"] == "key_123"
    assert inf["preferred_model"] == "model-a"
    assert inf["fallback_model"] == "model-b"


def test_build_session_config_onboarding():
    session = _make_session()
    config = build_session_config(session, None)
    onb = config["onboarding"]

    assert onb["welcome_required"] is True
    assert onb["final_report_delivery"] == "end_of_shift"
    assert onb["termination_behavior"] == "auto_terminate_after_report"
    assert "Klawva session is live" in onb["intro_message"]


def test_build_session_config_brief_passthrough():
    brief = {"task": "scrape site", "urls": "https://example.com", "output": "csv"}
    session = _make_session(brief=brief)
    config = build_session_config(session, None)
    assert config["brief"] == brief


def test_build_user_data_script_starts_with_shebang():
    config = {"session_id": "test-id", "callbacks": {"internal_token": "tok"}}
    script = build_user_data_script(config, gateway_port=9090)
    assert script.startswith("#!/bin/bash")


def test_build_user_data_script_contains_session_json():
    config = {"session_id": "sess-123", "agent_id": "scrapper", "callbacks": {"internal_token": "t"}}
    script = build_user_data_script(config, gateway_port=9090)

    assert "/etc/openclaw/sessions/sess-123.json" in script
    assert '"agent_id": "scrapper"' in script


def test_build_user_data_script_json_is_parseable():
    session = _make_session()
    config = build_session_config(session, None)
    script = build_user_data_script(config, gateway_port=9090)

    start_marker = "'KLAWVA_CONFIG_EOF'\n"
    end_marker = "\nKLAWVA_CONFIG_EOF"
    start = script.index(start_marker) + len(start_marker)
    end = script.index(end_marker, start)
    embedded_json = script[start:end]

    parsed = json.loads(embedded_json)
    assert parsed["session_id"] == "aaa-bbb-ccc"
    assert parsed["agent_id"] == "scrapper"


def test_build_user_data_script_gateway_port():
    config = {"session_id": "x", "callbacks": {"internal_token": "t"}}
    script = build_user_data_script(config, gateway_port=8888)
    assert "8888" in script


def test_build_user_data_script_gateway_token(monkeypatch):
    from app.platform.config import settings

    monkeypatch.setattr(settings, "internal_service_token", "my_secret")

    session = _make_session()
    config = build_session_config(session, None)
    script = build_user_data_script(config, gateway_port=9090)

    assert "my_secret" in script
    assert "/etc/openclaw/gateway_token" in script


def test_build_user_data_script_systemd_restarts():
    config = {"session_id": "x", "callbacks": {"internal_token": "t"}}
    script = build_user_data_script(config, gateway_port=9090)

    assert "systemctl restart openclaw-gateway" in script
    assert "systemctl restart openclaw-agent" in script
