import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.main import app
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

    async def fake_send(*, subject: str, body: str, reply_to: str | None = None) -> None:
        _ = subject, body, reply_to

    monkeypatch.setattr("app.features.emails.service.send_contact_email", fake_send)

    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()
    asyncio.run(drop_models())


def test_send_contact_email(test_client: TestClient) -> None:
    response = test_client.post(
        "/api/emails/contact",
        json={
            "name": "Owner",
            "email": "owner@example.com",
            "employeeType": "Full-Time",
            "description": "Need support with my account because it is locked.",
        },
    )

    assert response.status_code == 200
    assert response.json() == {"sent": True}


def test_send_contact_email_failure(
    test_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake_fail(*, subject: str, body: str, reply_to: str | None = None) -> None:
        _ = subject, body, reply_to
        from app.platform.email.service import EmailServiceError

        raise EmailServiceError("boom")

    monkeypatch.setattr("app.features.emails.service.send_contact_email", fake_fail)

    response = test_client.post(
        "/api/emails/contact",
        json={
            "name": "Owner",
            "email": "owner@example.com",
            "employeeType": "Full-Time",
            "description": "Need support with my account because it is locked.",
        },
    )

    assert response.status_code == 502
    assert response.json() == {
        "error": {"code": "http_error", "message": "email_send_failed"}
    }
