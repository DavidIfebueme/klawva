import os

from app.platform.config.settings import Settings

ENV_KEYS = [
    "DATABASE_URL",
    "REDIS_URL",
    "FRONTEND_BASE_URL",
    "FRONTEND_API_BASE_URL",
    "DIGITALOCEAN_API_TOKEN",
    "GRADIENT_MODEL_ACCESS_KEY",
    "PAYSTACK_SECRET_KEY",
    "PAYSTACK_WEBHOOK_SECRET",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "BREVO_API_KEY",
    "BREVO_SENDER_EMAIL",
    "CONTACT_RECIPIENT_EMAIL",
]


def test_settings_defaults() -> None:
    for key in ENV_KEYS:
        os.environ.pop(key, None)

    cfg = Settings()

    assert cfg.env == "development"
    assert cfg.api_port == 8000
    assert cfg.digitalocean_openclaw_image == "openclaw"
    assert cfg.gradient_fallback_model == "openai-gpt-oss-20b"


def test_settings_env_override() -> None:
    os.environ["DATABASE_URL"] = "postgresql+psycopg://u:p@localhost:5432/db"
    os.environ["REDIS_URL"] = "redis://localhost:6380/1"
    os.environ["DIGITALOCEAN_API_TOKEN"] = "do-token"
    os.environ["GRADIENT_MODEL_ACCESS_KEY"] = "grad-key"
    os.environ["PAYSTACK_SECRET_KEY"] = "paystack-key"
    os.environ["STRIPE_SECRET_KEY"] = "stripe-key"
    os.environ["BREVO_API_KEY"] = "brevo-key"
    os.environ["BREVO_SENDER_EMAIL"] = "sender@example.com"
    os.environ["CONTACT_RECIPIENT_EMAIL"] = "contact@example.com"

    cfg = Settings()

    assert cfg.database_url == "postgresql+psycopg://u:p@localhost:5432/db"
    assert cfg.redis_url == "redis://localhost:6380/1"
    assert cfg.digitalocean_api_token == "do-token"
    assert cfg.gradient_model_access_key == "grad-key"
    assert cfg.paystack_secret_key == "paystack-key"
    assert cfg.stripe_secret_key == "stripe-key"
    assert cfg.brevo_api_key == "brevo-key"
    assert cfg.brevo_sender_email == "sender@example.com"
    assert cfg.contact_recipient_email == "contact@example.com"

    for key in ENV_KEYS:
        os.environ.pop(key, None)
