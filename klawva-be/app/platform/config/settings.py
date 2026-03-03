from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    env: str = "development"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    rate_limit_per_minute: int = 120
    internal_service_token: str | None = None

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/klawva"
    redis_url: str = "redis://localhost:6379/0"

    frontend_base_url: str = "http://localhost:3000"
    frontend_api_base_url: str = "http://localhost:8000"
    telegram_bot_token_pool: str = ""
    history_magic_link_secret: str | None = None
    history_magic_link_ttl_minutes: int = 20

    digitalocean_api_token: str | None = None
    digitalocean_api_base_url: str = "https://api.digitalocean.com"
    digitalocean_region: str = "nyc1"
    digitalocean_droplet_size: str = "s-2vcpu-4gb"
    digitalocean_openclaw_image: str = "openclaw"
    digitalocean_ssh_key_fingerprints: str = ""
    provisioning_max_retries: int = 3
    droplet_max_sessions: int = 5
    droplet_agent_gateway_port: int = 9090
    openclaw_bootstrap_dispatch_url: str | None = None
    openclaw_bootstrap_dispatch_timeout_seconds: int = 15
    openclaw_bootstrap_dispatch_token: str | None = None

    gradient_model_access_key: str | None = None
    gradient_base_url: str = "https://inference.do-ai.run"
    gradient_preferred_model: str = "openai-gpt-oss-120b"
    gradient_fallback_model: str = "openai-gpt-oss-20b"

    paystack_secret_key: str | None = None
    paystack_webhook_secret: str | None = None
    paystack_base_url: str = "https://api.paystack.co"

    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None
    stripe_base_url: str = "https://api.stripe.com"
    stripe_webhook_tolerance_seconds: int = 300

    brevo_api_key: str | None = None
    brevo_sender_email: str | None = None
    brevo_sender_name: str = "Klawva"
    contact_recipient_email: str | None = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
