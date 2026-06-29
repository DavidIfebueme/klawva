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
    telegram_accounts_map_path: str = "/home/klawva/.openclaw/telegram_accounts.json"
    history_magic_link_secret: str | None = None
    history_magic_link_ttl_minutes: int = 20

    openclaw_gateway_url: str = "http://localhost:9090"
    openclaw_gateway_ws_url: str = "ws://localhost:9090"
    openclaw_gateway_token: str | None = None
    openclaw_config_path: str = "/home/klawva/.openclaw/openclaw.json"
    openclaw_workspaces_dir: str = "/home/klawva/.openclaw/workspaces"
    openclaw_agents_dir: str = "/home/klawva/.openclaw/agents"
    openclaw_restart_command: str = ""

    zai_base_url: str = "https://api.z.ai/api/paas/v4/"
    zai_api_key: str | None = None
    zai_model: str = "zai/glm-4.7"
    zai_fallback_model: str = "zai/glm-4.7-flash"

    whatsapp_klawva_account_pool: str = ""
    whatsapp_numbers_map_path: str = "/etc/openclaw/whatsapp_numbers.json"

    nomba_client_id: str | None = None
    nomba_client_secret: str | None = None
    nomba_account_id: str | None = None
    nomba_base_url: str = "https://api.nomba.com"
    nomba_webhook_secret: str | None = None
    nomba_subaccount_id: str | None = None

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
