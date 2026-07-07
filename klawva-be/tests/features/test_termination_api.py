from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.features.termination.models import TerminationJob
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

    async def fake_destroy(db: AsyncSession, *, session_id: str) -> bool:
        _ = db, session_id
        return True

    import asyncio

    asyncio.run(init_models())
    app.dependency_overrides[get_async_session] = override_get_async_session
    monkeypatch.setattr("app.features.termination.service.destroy_provisioning", fake_destroy)
    monkeypatch.setattr(settings, "internal_service_token", "internal-token")

    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()
    asyncio.run(drop_models())


def _create_session(client: TestClient) -> tuple[str, str]:
    response = client.post(
        "/api/sessions",
        json={
            "agentId": "researcher",
            "channel": "telegram",
            "brief": {"task": "report"},
            "paymentRef": "pref",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    return payload["sessionId"], payload["sessionToken"]


def test_schedule_termination(test_client: TestClient) -> None:
    session_id, _ = _create_session(test_client)

    response = test_client.post(
        "/api/termination/schedule",
        json={"sessionId": session_id},
        headers={"x-internal-token": "internal-token"},
    )

    assert response.status_code == 200
    assert response.json()["sessionId"] == session_id
    assert response.json()["status"] == "scheduled"


def test_execute_due_termination(test_client: TestClient) -> None:
    session_id, session_token = _create_session(test_client)
    schedule = test_client.post(
        "/api/termination/schedule",
        json={"sessionId": session_id},
        headers={"x-internal-token": "internal-token"},
    )
    assert schedule.status_code == 200

    import asyncio

    async def move_due() -> None:
        override = app.dependency_overrides[get_async_session]
        async for db in override():
            statement = (
                update(TerminationJob)
                .where(TerminationJob.session_id == session_id)
                .values(scheduled_for=datetime.now(UTC) - timedelta(minutes=1))
            )
            await db.execute(statement)
            await db.commit()

    asyncio.run(move_due())

    execute = test_client.post(
        "/api/termination/execute-due",
        headers={"x-internal-token": "internal-token"},
    )
    assert execute.status_code == 200
    assert execute.json() == {"terminated": 1}

    status = test_client.get(
        f"/api/sessions/{session_id}/status",
        headers={"x-session-token": session_token},
    )
    assert status.status_code == 200
    assert status.json()["status"] == "completed"


def test_execute_termination_share_token_in_email_url(
    test_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    session_id, _ = _create_session(test_client)
    send_ended_url = None

    async def capture_send_shift_ended_email(
        db: AsyncSession, *, session: object, report_url: str | None = None
    ) -> None:
        nonlocal send_ended_url
        send_ended_url = report_url

    monkeypatch.setattr(
        "app.features.termination.service.send_shift_ended_email",
        capture_send_shift_ended_email,
    )

    test_client.post(
        "/api/termination/schedule",
        json={"sessionId": session_id},
        headers={"x-internal-token": "internal-token"},
    )

    async def move_due() -> None:
        override = app.dependency_overrides[get_async_session]
        async for db in override():
            statement = (
                update(TerminationJob)
                .where(TerminationJob.session_id == session_id)
                .values(scheduled_for=datetime.now(UTC) - timedelta(minutes=1))
            )
            await db.execute(statement)
            await db.commit()

    import asyncio

    asyncio.run(move_due())

    execute = test_client.post(
        "/api/termination/execute-due",
        headers={"x-internal-token": "internal-token"},
    )
    assert execute.status_code == 200
    assert execute.json() == {"terminated": 1}

    assert send_ended_url is not None, "send_shift_ended_email was not called"
    assert "shareToken=" in send_ended_url, (
        f"Expected shareToken in report_url, got: {send_ended_url}"
    )
    assert "report/" in send_ended_url
