import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.main import app
from app.platform.config import settings
from app.platform.db.base import Base
from app.platform.db.registry import load_model_registry
from app.platform.db.session import get_async_session


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
    monkeypatch.setattr(settings, "telegram_bot_token_pool", "tokenA,tokenB")
    monkeypatch.setattr(settings, "internal_service_token", "internal-token")

    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()
    asyncio.run(drop_models())


def _create_session(client: TestClient, *, agent: str, channel: str) -> tuple[str, str]:
    response = client.post(
        "/api/sessions",
        json={
            "agentId": agent,
            "channel": channel,
            "brief": {"task": "work"},
            "paymentRef": "pref",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    return payload["sessionId"], payload["sessionToken"]


def test_get_session_qr(test_client: TestClient) -> None:
    session_id, session_token = _create_session(test_client, agent="scrapper", channel="whatsapp")

    response = test_client.get(
        f"/api/sessions/{session_id}/qr",
        headers={"x-session-token": session_token},
    )

    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload["qr"], str)
    assert payload["expiresIn"] == 60


def test_assign_telegram_token_non_vendor(test_client: TestClient) -> None:
    session_id, _ = _create_session(test_client, agent="researcher", channel="telegram")

    response = test_client.post(
        "/api/channels/telegram/assign",
        json={"sessionId": session_id},
        headers={"x-internal-token": "internal-token"},
    )

    assert response.status_code == 200
    assert response.json()["token"] == "tokenA"


def test_assign_telegram_token_vendor_rejected(test_client: TestClient) -> None:
    session_id, _ = _create_session(test_client, agent="vendor", channel="telegram")

    response = test_client.post(
        "/api/channels/telegram/assign",
        json={"sessionId": session_id},
        headers={"x-internal-token": "internal-token"},
    )

    assert response.status_code == 409
    assert response.json() == {
        "error": {"code": "http_error", "message": "vendor_telegram_not_allowed"}
    }
