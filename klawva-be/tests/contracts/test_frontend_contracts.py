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


def test_frontend_session_contract_end_to_end(test_client: TestClient) -> None:
    create = test_client.post(
        "/api/sessions",
        json={
            "agentId": "scrapper",
            "channel": "whatsapp",
            "brief": {"task": "monitor"},
            "paymentRef": "pref",
        },
    )
    assert create.status_code == 200
    create_body = create.json()
    assert set(create_body.keys()) == {"sessionId", "sessionToken"}
    session_id = create_body["sessionId"]
    session_token = create_body["sessionToken"]
    headers = {"x-session-token": session_token}

    status = test_client.get(f"/api/sessions/{session_id}/status", headers=headers)
    assert status.status_code == 200
    status_body = status.json()
    assert "status" in status_body
    assert status_body["status"] in {"provisioning", "ready", "active", "completed"}

    qr = test_client.get(f"/api/sessions/{session_id}/qr", headers=headers)
    assert qr.status_code == 200
    qr_body = qr.json()
    assert set(qr_body.keys()) == {"qr", "expiresIn"}

    activity = test_client.get(f"/api/sessions/{session_id}/activity", headers=headers)
    assert activity.status_code == 200
    activity_body = activity.json()
    assert set(activity_body.keys()) == {"activities"}
    assert isinstance(activity_body["activities"], list)

    report = test_client.get(f"/api/sessions/{session_id}/report", headers=headers)
    assert report.status_code == 200
    report_body = report.json()
    assert set(report_body.keys()) == {"dateRange", "stats", "summary"}
    assert isinstance(report_body["stats"], list)
