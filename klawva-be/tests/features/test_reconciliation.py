import asyncio
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.features.payments.models import FailedReconciliation, Payment
from app.features.payments.providers import (
    ProviderInitResult,
    ProviderVerificationResult,
    WebhookParseResult,
)
from app.main import app
from app.platform.db.base import Base
from app.platform.db.registry import load_model_registry
from app.platform.db.session import get_async_session


class MockNombaProvider:
    name = "nomba"

    def __init__(self):
        self.payout_calls = []
        self.session_id = "session_123"

    async def verify_transaction(self, provider_reference: str) -> ProviderVerificationResult:
        if provider_reference == "underpaid_ref":
            return ProviderVerificationResult(
                provider_reference=provider_reference,
                status="confirmed",
                session_id=self.session_id,
                amount_minor=500,
                currency="NGN",
                sender_account_number="1234567890",
                sender_bank_code="058",
                sender_account_name="Test User",
            )
        return ProviderVerificationResult(
            provider_reference=provider_reference,
            status="confirmed",
            session_id=self.session_id,
            amount_minor=250000,
            currency="NGN",
        )

    def verify_webhook_signature(self, body, sig, additional_headers=None):
        return True

    def parse_webhook(self, body):
        import json

        payload = json.loads(body.decode("utf-8"))
        return WebhookParseResult(
            event_id=payload.get("event_id", "evt_1"),
            event_type=payload.get("event", "charge.success"),
            provider_reference=payload.get("data", {}).get("reference", "ref_1"),
        )

    async def trigger_payout(
        self, *, amount_minor, account_number, bank_code, account_name, narration
    ):
        self.payout_calls.append(
            {
                "amount_minor": amount_minor,
                "account_number": account_number,
                "bank_code": bank_code,
                "account_name": account_name,
                "narration": narration,
            }
        )
        return "payout_tx_id_123"


@pytest.fixture
def recon_client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
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

    asyncio.run(init_models())
    app.dependency_overrides[get_async_session] = override_get_async_session

    provider = MockNombaProvider()
    monkeypatch.setattr("app.features.payments.service.get_provider", lambda _: provider)
    monkeypatch.setattr("app.features.payments.providers.get_provider", lambda _: provider)

    client = TestClient(app)
    client.provider = provider
    yield client
    app.dependency_overrides.clear()
    asyncio.run(drop_models())


def test_underpayment_reversal_flow(recon_client: TestClient) -> None:
    resp = recon_client.post(
        "/api/sessions",
        json={
            "agentId": "scrapper",
            "channel": "whatsapp",
            "brief": {"task": "monitor"},
            "paymentRef": "underpaid_ref",
            "customerEmail": "underpaid_user@example.com",
        },
    )
    assert resp.status_code == 200
    session_id = resp.json()["sessionId"]
    recon_client.provider.session_id = session_id

    webhook_payload = {
        "event_id": "evt_underpay",
        "event": "charge.success",
        "data": {
            "reference": "underpaid_ref",
            "id": "evt_underpay",
            "transaction": {
                "senderAccountNumber": "1234567890",
                "senderBankCode": "058",
                "senderAccountName": "Test User",
            },
        },
    }
    response = recon_client.post(
        "/api/payments/nomba/webhook", json=webhook_payload, headers={"nomba-signature": "sig"}
    )
    assert response.status_code == 200
    assert response.json() == {"processed": True}

    assert len(recon_client.provider.payout_calls) == 1
    assert recon_client.provider.payout_calls[0]["amount_minor"] == 500
    assert recon_client.provider.payout_calls[0]["account_number"] == "1234567890"

    from app.features.dashboard.auth import generate_token

    auth_token = generate_token(
        "underpaid_user@example.com", exp_minutes=60, scope="dashboard_session"
    )
    headers = {"x-dashboard-token": auth_token}

    statement_resp = recon_client.get("/api/payments/statement", headers=headers)
    assert statement_resp.status_code == 200
    statement_data = statement_resp.json()
    assert len(statement_data["transactions"]) == 2
    types = [t["type"] for t in statement_data["transactions"]]
    assert "credit" in types
    assert "debit" in types


def test_failed_reconciliation_queueing_and_manual_reconstruction(recon_client: TestClient) -> None:
    webhook_payload = {
        "event_id": "evt_unknown",
        "event": "charge.success",
        "data": {"reference": "unknown_ref", "id": "evt_unknown"},
    }
    response = recon_client.post(
        "/api/payments/nomba/webhook", json=webhook_payload, headers={"nomba-signature": "sig"}
    )
    assert response.status_code == 200
    assert response.json() == {"processed": True}

    resp = recon_client.post(
        "/api/sessions",
        json={
            "agentId": "scrapper",
            "channel": "whatsapp",
            "brief": {"task": "monitor"},
            "paymentRef": "unknown_ref",
            "customerEmail": "reconciled_user@example.com",
        },
    )
    assert resp.status_code == 200
    session_id = resp.json()["sessionId"]
    recon_client.provider.session_id = session_id

    recon_resp = recon_client.post(
        "/api/payments/reconciliation/manual",
        json={"provider_reference": "unknown_ref", "session_id": session_id},
    )
    assert recon_resp.status_code == 200
    assert recon_resp.json()["status"] == "resolved"

    status = recon_client.get(
        f"/api/sessions/{session_id}/status",
        headers={"x-session-token": resp.json()["sessionToken"]},
    )
    assert status.status_code == 200
    assert status.json()["status"] == "ready"

    # Authenticate and query statement to verify checkout deposit and hire fee are logged
    from app.features.dashboard.auth import generate_token

    auth_token = generate_token(
        "reconciled_user@example.com", exp_minutes=60, scope="dashboard_session"
    )
    headers = {"x-dashboard-token": auth_token}

    statement_resp = recon_client.get("/api/payments/statement", headers=headers)
    assert statement_resp.status_code == 200
    statement_data = statement_resp.json()
    assert len(statement_data["transactions"]) == 2

    types = [t["type"] for t in statement_data["transactions"]]
    sources = [t["source"] for t in statement_data["transactions"]]
    assert "credit" in types
    assert "debit" in types
    assert all(s == "checkout" for s in sources)


def test_daily_settlement_report(recon_client: TestClient) -> None:
    response = recon_client.get("/api/payments/settlement-report")
    assert response.status_code == 200
    assert "checkouts" in response.json()
    assert "wallet_funding" in response.json()


def test_va_funding_underpayment_reversal_flow(recon_client: TestClient) -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:

        async def setup_va():
            from app.features.payments.models import VirtualAccount
            from app.features.payments.wallet_service import get_or_create_wallet
            from app.features.users.models import User

            dep = app.dependency_overrides[get_async_session]
            async for s in dep():
                user = User(email="va_user@example.com")
                s.add(user)
                await s.flush()
                await get_or_create_wallet(s, user_id=user.id)
                va = VirtualAccount(
                    user_id=user.id,
                    nomba_account_ref="klawva_test_va",
                    bank_account_number="1234567890",
                    bank_name="Wema Bank",
                    bank_account_name="Nomba Klawva test_va",
                )
                s.add(va)
                await s.commit()

        loop.run_until_complete(setup_va())
    finally:
        loop.close()

    webhook_payload = {
        "event_id": "evt_va_underpay",
        "event": "virtual-account.funding",
        "data": {
            "reference": "klawva_test_va",
            "amount": 10.0,
            "transaction": {
                "senderAccountNumber": "1234567890",
                "senderBankCode": "058",
                "senderAccountName": "Test User VA",
            },
        },
    }
    response = recon_client.post(
        "/api/payments/nomba/webhook", json=webhook_payload, headers={"nomba-signature": "sig"}
    )
    assert response.status_code == 200
    assert response.json() == {"processed": True}

    assert len(recon_client.provider.payout_calls) == 1
    assert recon_client.provider.payout_calls[0]["amount_minor"] == 1000
    assert recon_client.provider.payout_calls[0]["account_number"] == "1234567890"

    from app.features.dashboard.auth import generate_token

    auth_token = generate_token("va_user@example.com", exp_minutes=60, scope="dashboard_session")
    headers = {"x-dashboard-token": auth_token}

    statement_resp = recon_client.get("/api/payments/statement", headers=headers)
    assert statement_resp.status_code == 200
    statement_data = statement_resp.json()
    assert len(statement_data["transactions"]) == 2
    types = [t["type"] for t in statement_data["transactions"]]
    descriptions = [t["description"] for t in statement_data["transactions"]]
    assert "credit" in types
    assert "debit" in types
    assert any("Below minimum ₦20.00" in d for d in descriptions)
    assert any("Reversal of below-minimum virtual account funding" in d for d in descriptions)
