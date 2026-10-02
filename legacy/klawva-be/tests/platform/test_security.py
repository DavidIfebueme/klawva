import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.main import app
from app.platform.config import settings
from app.platform.db.base import Base
from app.platform.db.registry import load_model_registry
from app.platform.db.session import get_async_session
from app.platform.security.redaction import redact_sensitive


@pytest.fixture
def test_client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    load_model_registry()
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)

    async def init_models() -> None:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async def drop_models() -> None:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await engine.dispose()

    async def override_get_async_session() -> AsyncSession:
        async with session_factory() as session:
            yield session

    import asyncio

    asyncio.run(init_models())
    app.dependency_overrides[get_async_session] = override_get_async_session
    monkeypatch.setattr(settings, "internal_service_token", "secret-token")
    monkeypatch.setattr(settings, "rate_limit_per_minute", 200)
    monkeypatch.setattr(settings, "openclaw_config_path", "/tmp/test_sec_openclaw.json")
    monkeypatch.setattr(settings, "openclaw_workspaces_dir", "/tmp/test_sec_workspaces")
    monkeypatch.setattr(settings, "zai_api_key", "test-zai-key")
    monkeypatch.setattr(settings, "zai_base_url", "https://api.z.ai/api/paas/v4/")
    monkeypatch.setattr(settings, "zai_model", "glm-4.7")
    monkeypatch.setattr(settings, "zai_fallback_model", "glm-4.7-flash")

    config_path = Path("/tmp/test_sec_openclaw.json")
    config_path.write_text(json.dumps({"agents": {"list": []}, "bindings": []}))

    workspace_dir = Path("/tmp/test_sec_workspaces")
    workspace_dir.mkdir(parents=True, exist_ok=True)

    async def fake_read_config():
        return json.loads(config_path.read_text())

    monkeypatch.setattr("app.platform.clients.openclaw_gateway.read_config", fake_read_config)

    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()
    asyncio.run(drop_models())


def test_redaction() -> None:
    assert redact_sensitive("Bearer token abc") == "[REDACTED]"
    assert redact_sensitive("plain message") == "plain message"
