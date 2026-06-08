import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.features.payments.providers import (
    ProviderInitResult,
    ProviderVerificationResult,
    WebhookParseResult,
)
from app.main import app
from app.platform.db.base import Base
from app.platform.db.registry import load_model_registry
from app.platform.db.session import get_async_session


class FakeProvider:
    def __init__(self, provider: str) -> None:
        self.provider = provider

    async def initialize_payment(
        self,
        *,
        amount_minor: int,
        currency: str,
        session_id: str,
        customer_email: str | None,
    ) -> ProviderInitResult:
        _ = amount_minor, currency, session_id, customer_email
        if self.provider == "paystack":
            return ProviderInitResult(
                provider_reference="pay_ref_123",
                status="pending",
                checkout_url="https://paystack.local/checkout",
            )
        return ProviderInitResult(
            provider_reference="pi_123",
            status="pending",
            client_secret="cs_test_123",
        )

    async def verify_transaction(self, provider_reference: str) -> ProviderVerificationResult:
        return ProviderVerificationResult(
            provider_reference=provider_reference,
            status="confirmed",
            session_id=self.session_id,
            amount_minor=2500,
            currency="NGN",
        )

    def verify_webhook_signature(self, body: bytes, signature_header: str | None) -> bool:
        _ = body
        return signature_header == "sig"

    def parse_webhook(self, body: bytes) -> WebhookParseResult:
        _ = body
        return WebhookParseResult(
            event_id="evt_1",
            event_type="charge.success",
            provider_reference="pay_ref_123",
        )


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

    fake_paystack = FakeProvider("paystack")
    fake_stripe = FakeProvider("stripe")

    def fake_get_provider(name: str):
        if name == "paystack":
            return fake_paystack
        return fake_stripe

    monkeypatch.setattr("app.features.payments.service.get_provider", fake_get_provider)

    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()
    asyncio.run(drop_models())


def _create_session(client: TestClient, channel: str = "whatsapp") -> tuple[str, str]:
    response = client.post(
        "/api/sessions",
        json={
            "agentId": "scrapper",
            "channel": channel,
            "brief": {"task": "monitor"},
            "paymentRef": "pre_ref",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    return payload["sessionId"], payload["sessionToken"]


def test_initialize_payment_paystack(test_client: TestClient) -> None:
    session_id, _ = _create_session(test_client)

    response = test_client.post(
        "/api/payments/initialize",
        json={
            "sessionId": session_id,
            "provider": "paystack",
            "amountMinor": 2500,
            "currency": "NGN",
            "customerEmail": "owner@example.com",
        },
        headers={"cf-ipcountry": "NG"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["provider"] == "paystack"
    assert payload["providerReference"] == "pay_ref_123"
    assert payload["checkoutUrl"] == "https://paystack.local/checkout"
    assert payload["amountMinor"] == 250000
    assert payload["currency"] == "NGN"


def test_initialize_payment_stripe(test_client: TestClient) -> None:
    session_id, _ = _create_session(test_client)

    response = test_client.post(
        "/api/payments/initialize",
        json={
            "sessionId": session_id,
            "provider": "stripe",
            "amountMinor": 199,
            "currency": "USD",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["provider"] == "stripe"
    assert payload["providerReference"] == "pi_123"
    assert payload["clientSecret"] == "cs_test_123"
    assert payload["amountMinor"] == 199
    assert payload["currency"] == "USD"


def test_get_billing_profile_nigeria(test_client: TestClient) -> None:
    response = test_client.get("/api/payments/billing-profile", headers={"cf-ipcountry": "NG"})
    assert response.status_code == 200
    assert response.json() == {
        "provider": "paystack",
        "amountMinor": 250000,
        "currency": "NGN",
        "amountDisplay": "₦2,500",
        "region": "nigeria",
        "countryCode": "NG",
    }


def test_get_billing_profile_global_default(test_client: TestClient) -> None:
    response = test_client.get("/api/payments/billing-profile")
    assert response.status_code == 200
    assert response.json() == {
        "provider": "stripe",
        "amountMinor": 199,
        "currency": "USD",
        "amountDisplay": "$1.99",
        "region": "global",
        "countryCode": None,
    }


def test_get_billing_profile_nigeria_from_timezone_fallback(test_client: TestClient) -> None:
    response = test_client.get(
        "/api/payments/billing-profile",
        headers={"x-klawva-timezone": "Africa/Lagos"},
    )
    assert response.status_code == 200
    assert response.json() == {
        "provider": "paystack",
        "amountMinor": 250000,
        "currency": "NGN",
        "amountDisplay": "₦2,500",
        "region": "nigeria",
        "countryCode": "NG",
    }


def test_get_billing_profile_nigeria_from_hint_and_language(test_client: TestClient) -> None:
    response = test_client.get(
        "/api/payments/billing-profile",
        headers={
            "x-klawva-country-hint": "NG",
            "x-klawva-languages": "en-NG,en;q=0.9",
        },
    )
    assert response.status_code == 200
    assert response.json() == {
        "provider": "paystack",
        "amountMinor": 250000,
        "currency": "NGN",
        "amountDisplay": "₦2,500",
        "region": "nigeria",
        "countryCode": "NG",
    }


def test_webhook_idempotent_and_unlock_session(
    test_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    session_id, session_token = _create_session(test_client)

    class SessionAwareFakeProvider(FakeProvider):
        async def verify_transaction(self, provider_reference: str) -> ProviderVerificationResult:
            return ProviderVerificationResult(
                provider_reference=provider_reference,
                status="confirmed",
                session_id=session_id,
                amount_minor=2500,
                currency="NGN",
            )

    provider = SessionAwareFakeProvider("paystack")
    monkeypatch.setattr("app.features.payments.service.get_provider", lambda _: provider)

    body = {"event": "charge.success", "data": {"reference": "pay_ref_123", "id": "evt_1"}}

    first = test_client.post(
        "/api/payments/paystack/webhook",
        json=body,
        headers={"x-paystack-signature": "sig"},
    )
    assert first.status_code == 200
    assert first.json() == {"processed": True}

    second = test_client.post(
        "/api/payments/paystack/webhook",
        json=body,
        headers={"x-paystack-signature": "sig"},
    )
    assert second.status_code == 200
    assert second.json() == {"processed": False}

    status = test_client.get(
        f"/api/sessions/{session_id}/status",
        headers={"x-session-token": session_token},
    )
    assert status.status_code == 200
    assert status.json()["status"] == "ready"
    assert status.json()["connected"] is True


def test_webhook_invalid_signature(
    test_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _create_session(test_client)

    class InvalidSignatureProvider(FakeProvider):
        def verify_webhook_signature(self, body: bytes, signature_header: str | None) -> bool:
            _ = body, signature_header
            return False

    provider = InvalidSignatureProvider("stripe")
    monkeypatch.setattr("app.features.payments.service.get_provider", lambda _: provider)

    response = test_client.post(
        "/api/payments/stripe/webhook",
        json={"id": "evt_bad", "type": "payment_intent.succeeded"},
        headers={"stripe-signature": "bad"},
    )

    assert response.status_code == 400
    assert response.json() == {
        "error": {"code": "http_error", "message": "invalid_webhook_signature"}
    }
