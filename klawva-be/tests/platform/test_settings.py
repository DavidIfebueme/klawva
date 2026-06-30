import os

from app.platform.config.settings import Settings

ENV_KEYS = [
    "DATABASE_URL",
    "REDIS_URL",
    "FRONTEND_BASE_URL",
    "FRONTEND_API_BASE_URL",
    "OPENCLAW_GATEWAY_TOKEN",
    "ZAI_API_KEY",
    "NOMBA_CLIENT_ID",
    "NOMBA_CLIENT_SECRET",
    "NOMBA_ACCOUNT_ID",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "BREVO_API_KEY",
    "BREVO_SENDER_EMAIL",
    "CONTACT_RECIPIENT_EMAIL",
]


import pytest

def test_settings_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in ENV_KEYS:
        monkeypatch.delenv(key, raising=False)

    cfg = Settings()

    assert cfg.env == "development"
    assert cfg.api_port == 8000
    assert cfg.openclaw_gateway_url == "http://localhost:9090"
    assert cfg.zai_model == "google/gemini-2.5-flash"
    assert cfg.zai_fallback_model == "google/gemini-2.5-flash"


def test_settings_env_override(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://u:p@localhost:5432/db")
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6380/1")
    monkeypatch.setenv("OPENCLAW_GATEWAY_TOKEN", "gw-token")
    monkeypatch.setenv("ZAI_API_KEY", "zai-key")
    monkeypatch.setenv("NOMBA_CLIENT_ID", "nomba-client-id")
    monkeypatch.setenv("NOMBA_CLIENT_SECRET", "nomba-client-secret")
    monkeypatch.setenv("NOMBA_ACCOUNT_ID", "nomba-account-id")
    monkeypatch.setenv("STRIPE_SECRET_KEY", "stripe-key")
    monkeypatch.setenv("BREVO_API_KEY", "brevo-key")
    monkeypatch.setenv("BREVO_SENDER_EMAIL", "sender@example.com")
    monkeypatch.setenv("CONTACT_RECIPIENT_EMAIL", "contact@example.com")

    cfg = Settings()

    assert cfg.database_url == "postgresql+psycopg://u:p@localhost:5432/db"
    assert cfg.redis_url == "redis://localhost:6380/1"
    assert cfg.openclaw_gateway_token == "gw-token"
    assert cfg.zai_api_key == "zai-key"
    assert cfg.nomba_client_id == "nomba-client-id"
    assert cfg.nomba_client_secret == "nomba-client-secret"
    assert cfg.nomba_account_id == "nomba-account-id"
    assert cfg.stripe_secret_key == "stripe-key"
    assert cfg.brevo_api_key == "brevo-key"
    assert cfg.brevo_sender_email == "sender@example.com"
    assert cfg.contact_recipient_email == "contact@example.com"
