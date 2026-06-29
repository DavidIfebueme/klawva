from datetime import UTC, datetime

from app.features.sessions.schemas import SessionSchema
from app.platform.db.base import Base
from app.platform.db.registry import load_model_registry

EXPECTED_TABLES = {
    "users",
    "sessions",
    "payments",
    "provisioning_jobs",
    "channel_links",
    "activity_events",
    "mission_reports",
    "termination_jobs",
    "email_events",
    "idempotency_keys",
    "wallets",
    "wallet_transactions",
    "virtual_accounts",
}


def test_model_registry_tables_present() -> None:
    load_model_registry()
    table_names = set(Base.metadata.tables.keys())
    assert EXPECTED_TABLES.issubset(table_names)


def test_session_schema_contract() -> None:
    now = datetime.now(UTC)
    data = {
        "id": "session-id",
        "agent_id": "scrapper",
        "channel": "whatsapp",
        "brief": {"task": "monitor prices"},
        "payment_ref": "pay-ref",
        "status": "provisioning",
        "started_at": None,
        "expires_at": None,
        "completed_at": None,
        "user_id": None,
        "auto_renew": False,
        "created_at": now,
        "updated_at": now,
    }

    schema = SessionSchema.model_validate(data)

    assert schema.id == "session-id"
    assert schema.agent_id == "scrapper"
    assert schema.channel == "whatsapp"
