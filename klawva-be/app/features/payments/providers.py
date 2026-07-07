import hashlib
import hmac
import json
import logging
import time

logger = logging.getLogger(__name__)
from dataclasses import dataclass
from datetime import datetime
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
        callback_url: str | None = None,
    ) -> ProviderInitResult: ...

    async def verify_transaction(self, provider_reference: str) -> ProviderVerificationResult: ...

    def verify_webhook_signature(
        self, body: bytes, signature_header: str | None, additional_headers: dict[str, str] | None = None
    ) -> bool: ...

    def parse_webhook(self, body: bytes) -> WebhookParseResult: ...


class NombaProvider:
    name: PaymentProviderName = "nomba"
    _token: str | None = None
    _token_expires_at: float = 0.0

    def __init__(self) -> None:
        self._base_url = settings.nomba_base_url.rstrip("/")
        self._client_id = settings.nomba_client_id
        self._client_secret = settings.nomba_client_secret
        self._account_id = settings.nomba_account_id
        self._webhook_secret = settings.nomba_webhook_secret

    async def _get_access_token(self) -> str:
        if self._token and time.time() < self._token_expires_at - 60:
            return self._token

        if not self._client_id or not self._client_secret or not self._account_id:
            raise PaymentProviderError("Nomba API keys are not configured")

        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                f"{self._base_url}/v1/auth/token/issue",
                headers={"accountId": self._account_id},
                json={
                    "grant_type": "client_credentials",
                    "client_id": self._client_id,
                    "client_secret": self._client_secret,
                }
            )

        if response.status_code >= 400:
            raise PaymentProviderError(f"nomba_auth_failed:{response.status_code}")

        res_json = response.json()
        if res_json.get("code") != "00":
            raise PaymentProviderError(f"nomba_auth_failed_code:{res_json.get('code')}:{res_json.get('description')}")

        data = res_json.get("data", {})
        self._token = str(data.get("access_token"))
        expires_at_str = data.get("expiresAt")
        if expires_at_str:
            try:
                dt = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
                self._token_expires_at = dt.timestamp()
            except Exception:
                self._token_expires_at = time.time() + 1500
        else:
            self._token_expires_at = time.time() + 1500

        return self._token

    async def initialize_payment(
        self,
        *,
        amount_minor: int,
        currency: str,
        session_id: str,
        customer_email: str | None,
        callback_url: str | None = None,
    ) -> ProviderInitResult:
        token = await self._get_access_token()
        hex_time = hex(int(time.time()))[2:]
        order_reference = f"ord_{session_id}_{hex_time}"
        amount_major_str = f"{amount_minor / 100:.2f}"

        payload = {
            "order": {
                "orderReference": order_reference,
                "amount": amount_major_str,
                "currency": currency.upper(),
                "callbackUrl": callback_url or f"{settings.frontend_base_url}/session/{session_id}",
                "customerId": customer_email or "customer@klawva.local",
                "customerEmail": customer_email or "customer@klawva.local",
            }
        }

        if settings.nomba_subaccount_id:
            payload["order"]["accountId"] = settings.nomba_subaccount_id

        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                f"{self._base_url}/v1/checkout/order",
                headers={
                    "Authorization": f"Bearer {token}",
                    "accountId": self._account_id,
                    "Content-Type": "application/json",
                },
                json=payload,
            )

        if response.status_code >= 400:
            logger.error("Nomba checkout initialize failed: %s, body: %s", response.status_code, response.text)
            raise PaymentProviderError(f"nomba_initialize_failed:{response.status_code}:{response.text}")

        res_json = response.json()
        if res_json.get("code") != "00":
            raise PaymentProviderError(f"nomba_initialize_failed_code:{res_json.get('code')}:{res_json.get('description')}")

        data = res_json.get("data", {})
        checkout_link = data.get("checkoutLink")
        if not checkout_link:
            raise PaymentProviderError("nomba_checkout_link_missing")

        returned_ref = data.get("orderReference") or order_reference

        return ProviderInitResult(
            provider_reference=returned_ref,
            status="pending",
            checkout_url=checkout_link,
        )

    async def verify_transaction(self, provider_reference: str) -> ProviderVerificationResult:
        token = await self._get_access_token()

        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(
                f"{self._base_url}/v1/transactions/accounts/single?orderReference={provider_reference}",
                headers={
                    "Authorization": f"Bearer {token}",
                    "accountId": self._account_id,
                },
            )

        if response.status_code >= 400:
            raise PaymentProviderError(f"nomba_verify_failed:{response.status_code}")

        res_json = response.json()
        if res_json.get("code") != "00":
            raise PaymentProviderError(f"nomba_verify_failed_code:{res_json.get('code')}:{res_json.get('description')}")

        data = res_json.get("data", {})
        status_raw = data.get("status")
        status = "confirmed" if status_raw == "SUCCESS" else "failed" if status_raw == "EXPIRED" else "pending"

        amount_major = float(data.get("amount", 0.0))
        amount_minor = int(round(amount_major * 100))
        currency = str(data.get("currency") or "NGN").upper()

        session_id = None
        if provider_reference.startswith("order_") or provider_reference.startswith("ord_"):
            parts = provider_reference.split("_")
            if len(parts) >= 3:
                session_id = parts[1]

        return ProviderVerificationResult(
            provider_reference=provider_reference,
            status=status,
            session_id=session_id,
            amount_minor=amount_minor,
            currency=currency,
        )

    def verify_webhook_signature(
        self, body: bytes, signature_header: str | None, additional_headers: dict[str, str] | None = None
    ) -> bool:
        logger.warning(
            "Nomba webhook signature verification - secret configured: %s, received header: %s",
            bool(self._webhook_secret),
            signature_header,
        )
        if not self._webhook_secret or not signature_header:
            return False

        import base64
        import json
        import hashlib

        try:
            payload = json.loads(body.decode("utf-8"))
            data = payload.get("data", {}) if isinstance(payload.get("data"), dict) else {}
            merchant = data.get("merchant", {}) if isinstance(data.get("merchant"), dict) else {}
            transaction = data.get("transaction", {}) if isinstance(data.get("transaction"), dict) else {}

            event_type = payload.get("event_type") or payload.get("event", "")
            request_id = payload.get("requestId", "")
            user_id = merchant.get("userId", "")
            wallet_id = merchant.get("walletId", "")
            transaction_id = transaction.get("transactionId", "")
            transaction_type = transaction.get("type", "")
            transaction_time = transaction.get("time", "")

            transaction_response_code = transaction.get("responseCode", "")
            if transaction_response_code is None or transaction_response_code == "null":
                transaction_response_code = ""

            timestamp = (additional_headers or {}).get("nomba-timestamp") or ""

            hashing_payload = f"{event_type}:{request_id}:{user_id}:{wallet_id}:{transaction_id}:{transaction_type}:{transaction_time}:{transaction_response_code}:{timestamp}"

            expected_bytes = hmac.new(
                self._webhook_secret.encode("utf-8"), hashing_payload.encode("utf-8"), hashlib.sha256
            ).digest()

            expected_hex = expected_bytes.hex()
            expected_b64 = base64.b64encode(expected_bytes).decode("utf-8")

            logger.debug("Nomba expected hex: %s", expected_hex)
            logger.debug("Nomba expected base64: %s", expected_b64)

            return hmac.compare_digest(expected_hex, signature_header) or hmac.compare_digest(expected_b64, signature_header)
        except Exception as e:
            logger.error("Error verifying Nomba webhook signature: %s", str(e))
            return False

    def parse_webhook(self, body: bytes) -> WebhookParseResult:
        payload = json.loads(body.decode("utf-8"))
        event_type = str(payload.get("event") or payload.get("event_type") or "unknown")
        data = payload.get("data", {}) if isinstance(payload.get("data"), dict) else {}
        
        order_data = data.get("order", {}) if isinstance(data.get("order"), dict) else {}
        transaction_data = data.get("transaction", {}) if isinstance(data.get("transaction"), dict) else {}
        
        reference = (
            order_data.get("orderReference")
            or data.get("reference")
            or transaction_data.get("aliasAccountReference")
        )

        event_id = str(data.get("id") or reference or hashlib.sha256(body).hexdigest())
        return WebhookParseResult(
            event_id=event_id,
            event_type=event_type,
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
        callback_url: str | None = None,
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

    def verify_webhook_signature(
        self, body: bytes, signature_header: str | None, additional_headers: dict[str, str] | None = None
    ) -> bool:
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


_provider_instances: dict[PaymentProviderName, PaymentProvider] = {}


def get_provider(name: PaymentProviderName) -> PaymentProvider:
    if name not in _provider_instances:
        if name == "nomba":
            _provider_instances[name] = NombaProvider()
        else:
            _provider_instances[name] = StripeProvider()
    return _provider_instances[name]
