from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.features.activity.models import ActivityEvent
from app.features.reports.models import MissionReport
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


def test_create_session(test_client: TestClient) -> None:
    response = test_client.post(
        "/api/sessions",
        json={
            "agentId": "scrapper",
            "channel": "whatsapp",
            "brief": {"task": "monitor"},
            "paymentRef": "pay_123",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert "sessionId" in body


def test_status_activity_report_flow(test_client: TestClient) -> None:
    create_response = test_client.post(
        "/api/sessions",
        json={
            "agentId": "researcher",
            "channel": "telegram",
            "brief": {"topic": "fintech"},
            "paymentRef": "pay_456",
        },
    )
    session_id = create_response.json()["sessionId"]

    status_response = test_client.get(f"/api/sessions/{session_id}/status")
    assert status_response.status_code == 200
    assert status_response.json()["status"] == "provisioning"

    assert status_response.json().get("connected") is None

    activity_response = test_client.get(f"/api/sessions/{session_id}/activity")
    assert activity_response.status_code == 200
    assert activity_response.json() == {"activities": []}

    report_response = test_client.get(f"/api/sessions/{session_id}/report")
    assert report_response.status_code == 200
    assert report_response.json()["summary"] == "Mission report is not ready yet."


def test_activity_and_report_entries(test_client: TestClient) -> None:
    create_response = test_client.post(
        "/api/sessions",
        json={
            "agentId": "vendor",
            "channel": "whatsapp",
            "brief": {"catalog": "v1"},
            "paymentRef": "pay_789",
        },
    )
    session_id = create_response.json()["sessionId"]

    import asyncio

    async def seed_data() -> None:
        override = app.dependency_overrides[get_async_session]
        async for db in override():
            db.add(
                ActivityEvent(
                    session_id=session_id,
                    event_type="agent_update",
                    payload={"text": "Agent started"},
                )
            )
            db.add(
                MissionReport(
                    session_id=session_id,
                    summary="Work completed",
                    report_data={"stats": [{"label": "Pages", "value": "12"}]},
                    delivered_at=datetime.now(UTC),
                )
            )
            await db.commit()

    asyncio.run(seed_data())

    activity_response = test_client.get(f"/api/sessions/{session_id}/activity")
    assert activity_response.status_code == 200
    activities = activity_response.json()["activities"]
    assert len(activities) == 1
    assert activities[0]["text"] == "Agent started"

    report_response = test_client.get(f"/api/sessions/{session_id}/report")
    assert report_response.status_code == 200
    assert report_response.json()["stats"] == [{"label": "Pages", "value": "12"}]
    assert report_response.json()["summary"] == "Work completed"
