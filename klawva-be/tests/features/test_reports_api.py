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
            "agentId": "scrapper",
            "channel": "whatsapp",
            "brief": {"task": "monitor"},
            "paymentRef": "pref",
        },
    )
    assert response.status_code == 200
    return response.json()["sessionId"]


def test_upsert_and_get_report(test_client: TestClient) -> None:
    session_id = _create_session(test_client)

    upsert = test_client.post(
        "/api/reports/upsert",
        json={
            "sessionId": session_id,
            "summary": "Mission complete",
            "reportData": {"stats": [{"label": "Pages", "value": "15"}]},
            "reportCardUrl": "https://cdn.example.com/card.png",
        },
    )

    assert upsert.status_code == 200
    assert upsert.json()["summary"] == "Mission complete"

    fetched = test_client.get(f"/api/reports/{session_id}")
    assert fetched.status_code == 200
    assert fetched.json()["reportData"]["stats"][0]["value"] == "15"


def test_get_missing_report(test_client: TestClient) -> None:
    session_id = _create_session(test_client)
    fetched = test_client.get(f"/api/reports/{session_id}")
    assert fetched.status_code == 404
    assert fetched.json() == {
        "error": {"code": "http_error", "message": "mission_report_not_found"}
    }
