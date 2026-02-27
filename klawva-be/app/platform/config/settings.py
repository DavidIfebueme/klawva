from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    env: str = "development"
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/klawva"
    redis_url: str = "redis://localhost:6379/0"

    frontend_base_url: str = "http://localhost:3000"
    frontend_api_base_url: str = "http://localhost:8000"

    digitalocean_api_token: str | None = None
    digitalocean_region: str = "nyc1"
    digitalocean_droplet_size: str = "s-2vcpu-4gb"
    digitalocean_openclaw_image: str = "openclaw"

    gradient_model_access_key: str | None = None
    gradient_base_url: str = "https://inference.do-ai.run"
    gradient_preferred_model: str = "openai-gpt-oss-120b"
    gradient_fallback_model: str = "openai-gpt-oss-20b"

    paystack_secret_key: str | None = None
    paystack_webhook_secret: str | None = None

    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None

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
