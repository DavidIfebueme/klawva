import asyncio
import time
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.features.activity.models import ActivityEvent
from app.features.payments.models import VirtualAccount, Wallet, WalletTransaction
from app.features.sessions.models import Session
from app.features.termination.models import TerminationJob
from app.features.users.models import User
from app.main import app
from app.platform.db.base import Base
from app.platform.db.registry import load_model_registry
from app.platform.db.session import get_async_session


class FakeResponse:
    def __init__(self, json_data, status_code=200):
        self._json_data = json_data
        self.status_code = status_code

    def json(self):
        return self._json_data

    @property
    def text(self):
        import json

        return json.dumps(self._json_data)


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

    from app.platform.config import settings

    monkeypatch.setattr(settings, "history_magic_link_secret", "test-secret")
    monkeypatch.setattr(settings, "internal_service_token", "test-internal-token")
    monkeypatch.setattr(settings, "nomba_client_id", "test-client-id")
    monkeypatch.setattr(settings, "nomba_client_secret", "test-client-secret")
    monkeypatch.setattr(settings, "nomba_account_id", "test-account-id")

    async def fake_post(client_self, url, *args, **kwargs):
        url_str = str(url)
        if "auth/token/issue" in url_str:
            return FakeResponse(
                {
                    "code": "00",
                    "description": "Success",
                    "data": {
                        "access_token": "mocked-token-123",
                        "expiresAt": "2030-01-01T00:00:00Z",
                    },
                }
            )
        elif "accounts/virtual" in url_str:
            return FakeResponse(
                {
                    "code": "00",
                    "description": "Success",
                    "data": {
                        "bankAccountNumber": "1234567890",
                        "bankName": "Nomba Bank",
                        "bankAccountName": "Klawva / mock@example.com",
                    },
                }
            )
        elif "checkout/order" in url_str:
            return FakeResponse(
                {
                    "code": "00",
                    "description": "Success",
                    "data": {"checkoutLink": "https://nomba.local/checkout"},
                }
            )
        return FakeResponse({}, 404)

    async def fake_get(client_self, url, *args, **kwargs):
        url_str = str(url)
        if "checkout/order/" in url_str:
            return FakeResponse(
                {
                    "code": "00",
                    "description": "Success",
                    "data": {"status": "SUCCESS", "amount": "25.00", "currency": "NGN"},
                }
            )
        return FakeResponse({}, 404)

    monkeypatch.setattr("httpx.AsyncClient.post", fake_post)
    monkeypatch.setattr("httpx.AsyncClient.get", fake_get)

    async def fake_send_transactional_email(*args, **kwargs):
        pass

    monkeypatch.setattr(
        "app.features.dashboard.auth.send_transactional_email", fake_send_transactional_email
    )
    monkeypatch.setattr(
        "app.features.emails.service.send_transactional_email", fake_send_transactional_email
    )
    monkeypatch.setattr(
        "app.platform.email.service.send_transactional_email", fake_send_transactional_email
    )
    monkeypatch.setattr(
        "app.features.payments.providers.NombaProvider.verify_webhook_signature",
        lambda self, b, s: True,
    )

    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()
    asyncio.run(drop_models())


def test_user_creation_on_session_create(test_client: TestClient) -> None:
    response = test_client.post(
        "/api/sessions",
        json={
            "agentId": "scrapper",
            "channel": "whatsapp",
            "brief": {"task": "monitor prices"},
            "customerEmail": "user@example.com",
            "paymentRef": "pref_123",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert "sessionId" in payload
    assert "sessionToken" in payload


def test_dashboard_magic_link_auth_flow(test_client: TestClient) -> None:
    test_client.post(
        "/api/sessions",
        json={
            "agentId": "scrapper",
            "channel": "whatsapp",
            "brief": {"task": "monitor"},
            "customerEmail": "test@example.com",
        },
    )

    req_res = test_client.post(
        "/api/dashboard/auth/request-magic-link",
        json={"email": "test@example.com"},
    )
    assert req_res.status_code == 200
    assert req_res.json() == {"success": True}

    from app.features.dashboard.auth import generate_token

    token = generate_token("test@example.com", exp_minutes=30, scope="dashboard_magic_link")

    verify_res = test_client.post(
        "/api/dashboard/auth/verify-magic-link",
        json={"token": token},
    )
    assert verify_res.status_code == 200
    verify_data = verify_res.json()
    assert "token" in verify_data
    assert verify_data["user"]["email"] == "test@example.com"


def test_virtual_account_creation_mock(test_client: TestClient) -> None:
    test_client.post(
        "/api/sessions",
        json={
            "agentId": "scrapper",
            "channel": "whatsapp",
            "brief": {},
            "customerEmail": "testva@example.com",
        },
    )
    from app.features.dashboard.auth import generate_token

    auth_token = generate_token("testva@example.com", exp_minutes=60, scope="dashboard_session")
    headers = {"x-dashboard-token": auth_token}

    response = test_client.post("/api/dashboard/wallet/create-virtual-account", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["hasVirtualAccount"] is True
    assert data["bankAccountNumber"] == "1234567890"
    assert data["bankName"] == "Nomba Bank"


def test_wallet_funding_webhook(test_client: TestClient) -> None:
    test_client.post(
        "/api/sessions",
        json={
            "agentId": "scrapper",
            "channel": "whatsapp",
            "brief": {"task": "monitor"},
            "customerEmail": "wallet@example.com",
        },
    )
    from app.features.dashboard.auth import generate_token

    auth_token = generate_token("wallet@example.com", exp_minutes=60, scope="dashboard_session")
    headers = {"x-dashboard-token": auth_token}

    create_va_res = test_client.post(
        "/api/dashboard/wallet/create-virtual-account", headers=headers
    )
    assert create_va_res.status_code == 200

    wallet_res = test_client.get("/api/dashboard/wallet", headers=headers)
    assert wallet_res.status_code == 200
    wallet_data = wallet_res.json()
    assert wallet_data["balanceMinor"] == 0

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:

        async def get_va_ref_from_db():
            dep = app.dependency_overrides[get_async_session]
            async for s in dep():
                res = await s.execute(select(VirtualAccount))
                return res.scalars().first().nomba_account_ref

        va_ref = loop.run_until_complete(get_va_ref_from_db())
    finally:
        loop.close()
    assert va_ref is not None

    webhook_payload = {
        "event_id": "tx_fund_1",
        "event": "payment_success",
        "data": {
            "amount": 7500.00,  # ₦7,500
            "currency": "NGN",
            "status": "success",
            "reference": va_ref,
        },
    }

    webhook_res = test_client.post(
        "/api/payments/nomba/webhook",
        json=webhook_payload,
        headers={"nomba-signature": "sig"},
    )
    assert webhook_res.status_code == 200

    wallet_res = test_client.get("/api/dashboard/wallet", headers=headers)
    assert wallet_res.status_code == 200
    assert wallet_res.json()["balanceMinor"] == 750000

    tx_res = test_client.get("/api/dashboard/wallet/transactions", headers=headers)
    assert tx_res.status_code == 200
    tx_data = tx_res.json()
    assert len(tx_data) == 1
    assert tx_data[0]["type"] == "credit"
    assert tx_data[0]["amountMinor"] == 750000


def test_zero_downtime_auto_renewal_extension(test_client: TestClient) -> None:
    response = test_client.post(
        "/api/sessions",
        json={
            "agentId": "scrapper",
            "channel": "whatsapp",
            "brief": {"task": "monitor"},
            "customerEmail": "renew@example.com",
        },
    )
    session_id = response.json()["sessionId"]

    from app.features.dashboard.auth import generate_token

    auth_token = generate_token("renew@example.com", exp_minutes=60, scope="dashboard_session")
    headers = {"x-dashboard-token": auth_token}

    test_client.patch(
        f"/api/dashboard/sessions/{session_id}/auto-renew",
        json={"autoRenew": True},
        headers=headers,
    )

    import asyncio

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:

        async def prepare_session_for_renewal():
            dep = app.dependency_overrides[get_async_session]
            async for s in dep():
                user_stmt = select(User).where(User.email == "renew@example.com")
                user = (await s.execute(user_stmt)).scalar_one()
                wallet_stmt = select(Wallet).where(Wallet.user_id == user.id)
                wallet = (await s.execute(wallet_stmt)).scalar_one()
                wallet.balance_minor = 500000

                sess = await s.get(Session, session_id)
                sess.status = "active"
                sess.expires_at = datetime.now(UTC) + timedelta(hours=1.5)

                job = TerminationJob(
                    session_id=session_id,
                    status="scheduled",
                    scheduled_for=sess.expires_at,
                )
                s.add(job)
                await s.commit()

        loop.run_until_complete(prepare_session_for_renewal())
    finally:
        loop.close()

    exec_res = test_client.post(
        "/api/termination/execute-due",
        headers={"x-internal-token": "test-internal-token"},
    )
    assert exec_res.status_code == 200

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:

        async def verify_extension():
            dep = app.dependency_overrides[get_async_session]
            async for s in dep():
                sess = await s.get(Session, session_id)
                job_stmt = select(TerminationJob).where(TerminationJob.session_id == session_id)
                job = (await s.execute(job_stmt)).scalar_one()
                user_stmt = select(User).where(User.email == "renew@example.com")
                user = (await s.execute(user_stmt)).scalar_one()
                wallet_stmt = select(Wallet).where(Wallet.user_id == user.id)
                wallet = (await s.execute(wallet_stmt)).scalar_one()
                return sess.expires_at, job.scheduled_for, sess.status, wallet.balance_minor

        new_expires_at, new_scheduled_for, status, balance = loop.run_until_complete(
            verify_extension()
        )
    finally:
        loop.close()

    new_expires_utc = (
        new_expires_at.replace(tzinfo=UTC) if new_expires_at.tzinfo is None else new_expires_at
    )
    new_scheduled_utc = (
        new_scheduled_for.replace(tzinfo=UTC)
        if new_scheduled_for.tzinfo is None
        else new_scheduled_for
    )
    assert new_expires_utc > datetime.now(UTC) + timedelta(hours=23)
    assert new_scheduled_utc == new_expires_utc
    assert status == "active"
    assert balance == 250000


def test_brief_update_endpoint(test_client: TestClient) -> None:
    response = test_client.post(
        "/api/sessions",
        json={
            "agentId": "scrapper",
            "channel": "whatsapp",
            "brief": {"task": "original brief"},
            "customerEmail": "brief@example.com",
        },
    )
    session_id = response.json()["sessionId"]

    from app.features.dashboard.auth import generate_token

    auth_token = generate_token("brief@example.com", exp_minutes=60, scope="dashboard_session")
    headers = {"x-dashboard-token": auth_token}

    update_res = test_client.patch(
        f"/api/dashboard/sessions/{session_id}/brief",
        json={"brief": {"task": "updated brief"}},
        headers=headers,
    )
    assert update_res.status_code == 200
    assert update_res.json() == {"success": True}

    get_res = test_client.get(f"/api/dashboard/sessions/{session_id}/brief", headers=headers)
    assert get_res.status_code == 200
    assert get_res.json()["brief"] == {"task": "updated brief"}
