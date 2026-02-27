import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from typing import Protocol

import httpx

from app.features.payments.contracts import PaymentProviderName
from app.platform.config import settings


class PaymentProviderError(RuntimeError):
    pass


@dataclass
class ProviderInitResult:
    provider_reference: str
    status: str
    checkout_url: str | None = None
    client_secret: str | None = None


@dataclass
class ProviderVerificationResult:
    provider_reference: str
    status: str
    session_id: str | None
    amount_minor: int
    currency: str


@dataclass
class WebhookParseResult:
    event_id: str
    event_type: str
    provider_reference: str | None


class PaymentProvider(Protocol):
    name: PaymentProviderName

    async def initialize_payment(
        self,
        *,
        amount_minor: int,
        currency: str,
        session_id: str,
        customer_email: str | None,
    ) -> ProviderInitResult: ...

    async def verify_transaction(self, provider_reference: str) -> ProviderVerificationResult: ...

    def verify_webhook_signature(self, body: bytes, signature_header: str | None) -> bool: ...

    def parse_webhook(self, body: bytes) -> WebhookParseResult: ...


class PaystackProvider:
    name: PaymentProviderName = "paystack"

    def __init__(self) -> None:
        self._base_url = settings.paystack_base_url.rstrip("/")
        self._secret_key = settings.paystack_secret_key
        self._webhook_secret = settings.paystack_webhook_secret

    async def initialize_payment(
        self,
        *,
        amount_minor: int,
        currency: str,
        session_id: str,
        customer_email: str | None,
    ) -> ProviderInitResult:
        if not self._secret_key:
            raise PaymentProviderError("PAYSTACK_SECRET_KEY is not configured")

        payload = {
            "amount": amount_minor,
            "currency": currency.upper(),
            "email": customer_email or "customer@klawva.local",
            "metadata": {"session_id": session_id},
        }

        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                f"{self._base_url}/transaction/initialize",
                headers={"Authorization": f"Bearer {self._secret_key}"},
                json=payload,
            )

        if response.status_code >= 400:
            raise PaymentProviderError(f"paystack_initialize_failed:{response.status_code}")

        data = response.json().get("data", {})
        reference = str(data.get("reference"))
        if not reference:
            raise PaymentProviderError("paystack_reference_missing")

        return ProviderInitResult(
            provider_reference=reference,
            status="pending",
            checkout_url=data.get("authorization_url"),
        )

    async def verify_transaction(self, provider_reference: str) -> ProviderVerificationResult:
        if not self._secret_key:
            raise PaymentProviderError("PAYSTACK_SECRET_KEY is not configured")

        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(
                f"{self._base_url}/transaction/verify/{provider_reference}",
                headers={"Authorization": f"Bearer {self._secret_key}"},
            )

        if response.status_code >= 400:
            raise PaymentProviderError(f"paystack_verify_failed:{response.status_code}")

        data = response.json().get("data", {})
        status = "confirmed" if data.get("status") == "success" else "failed"
        metadata = data.get("metadata", {}) if isinstance(data.get("metadata"), dict) else {}
        amount = int(data.get("amount", 0) or 0)
        currency = str(data.get("currency", "")).upper()
        return ProviderVerificationResult(
            provider_reference=str(data.get("reference", provider_reference)),
            status=status,
            session_id=metadata.get("session_id"),
            amount_minor=amount,
            currency=currency,
        )

    def verify_webhook_signature(self, body: bytes, signature_header: str | None) -> bool:
        if not self._webhook_secret or not signature_header:
            return False
        digest = hmac.new(
            self._webhook_secret.encode("utf-8"), body, hashlib.sha512
        ).hexdigest()
        return hmac.compare_digest(digest, signature_header)

    def parse_webhook(self, body: bytes) -> WebhookParseResult:
        payload = json.loads(body.decode("utf-8"))
        data = payload.get("data", {}) if isinstance(payload.get("data"), dict) else {}
        event = str(payload.get("event", "unknown"))
        reference = data.get("reference")
        event_id = str(data.get("id") or reference or hashlib.sha256(body).hexdigest())
        return WebhookParseResult(
            event_id=event_id,
            event_type=event,
            provider_reference=str(reference) if reference else None,
        )


class StripeProvider:
    name: PaymentProviderName = "stripe"

    def __init__(self) -> None:
        self._base_url = settings.stripe_base_url.rstrip("/")
        self._secret_key = settings.stripe_secret_key
        self._webhook_secret = settings.stripe_webhook_secret
        self._tolerance = settings.stripe_webhook_tolerance_seconds

    async def initialize_payment(
        self,
        *,
        amount_minor: int,
        currency: str,
        session_id: str,
        customer_email: str | None,
    ) -> ProviderInitResult:
        if not self._secret_key:
            raise PaymentProviderError("STRIPE_SECRET_KEY is not configured")

        data = {
            "amount": str(amount_minor),
            "currency": currency.lower(),
            "automatic_payment_methods[enabled]": "true",
            "metadata[session_id]": session_id,
        }
        if customer_email:
            data["receipt_email"] = customer_email

        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                f"{self._base_url}/v1/payment_intents",
                headers={"Authorization": f"Bearer {self._secret_key}"},
                data=data,
            )

        if response.status_code >= 400:
            raise PaymentProviderError(f"stripe_initialize_failed:{response.status_code}")

        payload = response.json()
        intent_id = str(payload.get("id"))
        if not intent_id:
            raise PaymentProviderError("stripe_intent_id_missing")

        status = "confirmed" if payload.get("status") == "succeeded" else "pending"
        return ProviderInitResult(
            provider_reference=intent_id,
            status=status,
            client_secret=payload.get("client_secret"),
        )

    async def verify_transaction(self, provider_reference: str) -> ProviderVerificationResult:
        if not self._secret_key:
            raise PaymentProviderError("STRIPE_SECRET_KEY is not configured")

        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(
                f"{self._base_url}/v1/payment_intents/{provider_reference}",
                headers={"Authorization": f"Bearer {self._secret_key}"},
            )

        if response.status_code >= 400:
            raise PaymentProviderError(f"stripe_verify_failed:{response.status_code}")

        payload = response.json()
        metadata = payload.get("metadata", {}) if isinstance(payload.get("metadata"), dict) else {}
        status = "confirmed" if payload.get("status") == "succeeded" else "failed"
        amount = int(payload.get("amount", 0) or 0)
        currency = str(payload.get("currency", "")).upper()

        return ProviderVerificationResult(
            provider_reference=str(payload.get("id", provider_reference)),
            status=status,
            session_id=metadata.get("session_id"),
            amount_minor=amount,
            currency=currency,
        )

    def verify_webhook_signature(self, body: bytes, signature_header: str | None) -> bool:
        if not self._webhook_secret or not signature_header:
            return False

        pairs = {}
        for item in signature_header.split(","):
            if "=" in item:
                key, value = item.split("=", 1)
                pairs[key.strip()] = value.strip()

        timestamp_raw = pairs.get("t")
        signature_v1 = pairs.get("v1")
        if not timestamp_raw or not signature_v1:
            return False

        try:
            timestamp = int(timestamp_raw)
        except ValueError:
            return False

        now = int(time.time())
        if abs(now - timestamp) > self._tolerance:
            return False

        signed_payload = f"{timestamp}.{body.decode('utf-8')}".encode()
        expected = hmac.new(
            self._webhook_secret.encode("utf-8"), signed_payload, hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(expected, signature_v1)

    def parse_webhook(self, body: bytes) -> WebhookParseResult:
        payload = json.loads(body.decode("utf-8"))
        event_id = str(payload.get("id") or hashlib.sha256(body).hexdigest())
        event_type = str(payload.get("type") or "unknown")

        object_data = {}
        data = payload.get("data")
        if isinstance(data, dict):
            object_value = data.get("object")
            if isinstance(object_value, dict):
                object_data = object_value

        provider_reference = object_data.get("id")
        return WebhookParseResult(
            event_id=event_id,
            event_type=event_type,
            provider_reference=str(provider_reference) if provider_reference else None,
        )


def get_provider(name: PaymentProviderName) -> PaymentProvider:
    if name == "paystack":
        return PaystackProvider()
    return StripeProvider()
