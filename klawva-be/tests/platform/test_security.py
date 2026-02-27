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

    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()
    asyncio.run(drop_models())


def test_redaction() -> None:
    assert redact_sensitive("Bearer token abc") == "[REDACTED]"
    assert redact_sensitive("plain message") == "plain message"


def test_internal_auth_required(test_client: TestClient) -> None:
    response = test_client.post("/api/provisioning/start", json={"sessionId": "x"})
    assert response.status_code == 401
    assert response.json() == {
        "error": {"code": "unauthorized", "message": "invalid_internal_token"}
    }


def test_internal_auth_success(test_client: TestClient) -> None:
    create = test_client.post(
        "/api/sessions",
        json={
            "agentId": "scrapper",
            "channel": "whatsapp",
            "brief": {"task": "m"},
            "paymentRef": "r",
        },
    )
    session_id = create.json()["sessionId"]

    response = test_client.post(
        "/api/provisioning/start",
        json={"sessionId": session_id},
        headers={"x-internal-token": "secret-token"},
    )
    assert response.status_code in {200, 502}
