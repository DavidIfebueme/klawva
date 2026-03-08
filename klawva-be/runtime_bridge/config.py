from pydantic_settings import BaseSettings, SettingsConfigDict


class RuntimeBridgeSettings(BaseSettings):
    bridge_internal_token: str = ""
    bridge_internal_token_file: str = "/etc/openclaw/gateway_token"
    bridge_sessions_dir: str = "/etc/openclaw/sessions"
    bridge_gateway_port: int = 9090
    bridge_telegram_poll_timeout_seconds: int = 25
    bridge_telegram_poll_pause_seconds: int = 2

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


runtime_bridge_settings = RuntimeBridgeSettings()
