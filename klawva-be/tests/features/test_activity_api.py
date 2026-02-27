import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.main import app
from app.platform.db.base import Base
from app.platform.db.registry import load_model_registry
from app.platform.db.session import get_async_session


@pytest.fixture
def test_client() -> TestClient:
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
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()
    asyncio.run(drop_models())


def _create_session(client: TestClient) -> str:
    response = client.post(
        "/api/sessions",
        json={
            "agentId": "researcher",
            "channel": "telegram",
            "brief": {"task": "research"},
            "paymentRef": "pref",
        },
    )
    assert response.status_code == 200
    return response.json()["sessionId"]


def test_activity_ingest_updates_projection(test_client: TestClient) -> None:
    session_id = _create_session(test_client)

    ingest = test_client.post(
        "/api/activity/ingest",
        json={
            "sessionId": session_id,
            "eventType": "channel_ready",
            "text": "Channel linked",
            "payload": {"stage": "channel"},
        },
    )
    assert ingest.status_code == 200
    assert "eventId" in ingest.json()

    projection = test_client.get(f"/api/activity/sessions/{session_id}/projection")
    assert projection.status_code == 200
    assert projection.json() == {"status": "ready", "connected": True}


def test_activity_projection_default(test_client: TestClient) -> None:
    session_id = _create_session(test_client)

    projection = test_client.get(f"/api/activity/sessions/{session_id}/projection")
    assert projection.status_code == 200
    assert projection.json() == {"status": "provisioning", "connected": None}
