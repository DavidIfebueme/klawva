import hashlib
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.payments.contracts import PaymentProviderName
from app.features.payments.models import Payment
from app.features.payments.providers import (
    PaymentProviderError,
    ProviderInitResult,
    get_provider,
)
from app.features.sessions.models import Session
from app.platform.db.models.idempotency_key import IdempotencyKey


def _hash_body(raw_body: bytes) -> str:
    return hashlib.sha256(raw_body).hexdigest()


def _idempotency_key(scope: str, event_id: str) -> str:
    return f"{scope}:{event_id}"


async def initialize_payment(
    db: AsyncSession,
    *,
    session_id: str,
    provider_name: PaymentProviderName,
    amount_minor: int,
    currency: str,
    customer_email: str | None,
) -> tuple[Payment, ProviderInitResult]:
    session = await db.get(Session, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session_not_found")

    from app.platform.config import settings
    import urllib.parse

    ends_at_str = ""
    if session.expires_at:
        ends_at_str = session.expires_at.isoformat()
    elif session.started_at:
        ends_at_str = (session.started_at + timedelta(hours=24)).isoformat()
    else:
        ends_at_str = (datetime.now(UTC) + timedelta(hours=24)).isoformat()

    params = {
        "channel": session.channel,
        "agent": session.agent_id,
        "endsAt": ends_at_str,
    }
    callback_url = f"{settings.frontend_base_url}/session/{session_id}?{urllib.parse.urlencode(params)}"

    provider = get_provider(provider_name)
    try:
        init_result = await provider.initialize_payment(
            amount_minor=amount_minor,
            currency=currency,
            session_id=session_id,
            customer_email=customer_email,
            callback_url=callback_url,
        )
    except PaymentProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    payment = Payment(
        session_id=session_id,
        provider=provider_name,
        provider_reference=init_result.provider_reference,
        amount_minor=amount_minor,
        currency=currency.upper(),
        status=init_result.status,
        confirmed_at=datetime.now(UTC) if init_result.status == "confirmed" else None,
    )

    db.add(payment)
    if customer_email:
        session.customer_email = customer_email.strip().lower()
    if init_result.status == "confirmed":
        session.status = "ready"

    await db.commit()
    await db.refresh(payment)
    return payment, init_result


async def process_webhook(
    db: AsyncSession,
    *,
    provider_name: PaymentProviderName,
    raw_body: bytes,
    signature_header: str | None,
    additional_headers: dict[str, str] | None = None,
) -> bool:
    provider = get_provider(provider_name)
    if not provider.verify_webhook_signature(raw_body, signature_header, additional_headers=additional_headers):
        raise HTTPException(status_code=400, detail="invalid_webhook_signature")

    parsed = provider.parse_webhook(raw_body)
    scope = f"payments:{provider_name}:webhook"
    key = _idempotency_key(scope, parsed.event_id)

    existing_statement = select(IdempotencyKey).where(IdempotencyKey.key == key)
    existing_result = await db.execute(existing_statement)
    existing = existing_result.scalar_one_or_none()
    if existing is not None:
        return False

    if provider_name == "nomba" and parsed.provider_reference and parsed.provider_reference.startswith("klawva_"):
        import json
        from app.features.payments.models import Wallet, WalletTransaction, VirtualAccount
        
        payload = json.loads(raw_body.decode("utf-8"))
        data = payload.get("data", {}) if isinstance(payload.get("data"), dict) else {}
        
        va_stmt = select(VirtualAccount).where(VirtualAccount.nomba_account_ref == parsed.provider_reference)
        va_res = await db.execute(va_stmt)
        va = va_res.scalar_one_or_none()
        if not va:
            raise HTTPException(status_code=404, detail="virtual_account_not_found")
            
        wallet_stmt = select(Wallet).where(Wallet.user_id == va.user_id)
        wallet_res = await db.execute(wallet_stmt)
        wallet = wallet_res.scalar_one_or_none()
        if not wallet:
            wallet = Wallet(user_id=va.user_id, balance_minor=0)
            db.add(wallet)
            await db.flush()

        amount_major = float(data.get("amount", 0.0))
        amount_minor = int(round(amount_major * 100))
        
        wallet.balance_minor += amount_minor
        
        tx = WalletTransaction(
            wallet_id=wallet.id,
            type="credit",
            amount_minor=amount_minor,
            reference=parsed.event_id,
            description="Virtual account funding",
            balance_after=wallet.balance_minor,
            source="virtual_account",
        )
        db.add(tx)
        
        expires_at = datetime.now(UTC) + timedelta(days=30)
        db.add(
            IdempotencyKey(
                scope=scope,
                key=key,
                request_hash=_hash_body(raw_body),
                response_json={"processed": True, "wallet_funded": True},
                status_code=200,
                expires_at=expires_at,
            )
        )
        await db.commit()
        return True

    if parsed.provider_reference is None:
        expires_at = datetime.now(UTC) + timedelta(days=30)
        db.add(
            IdempotencyKey(
                scope=scope,
                key=key,
                request_hash=_hash_body(raw_body),
                response_json={"processed": False, "reason": "missing_reference"},
                status_code=200,
                expires_at=expires_at,
            )
        )
        await db.commit()
        return False

    try:
        verification = await provider.verify_transaction(parsed.provider_reference)
    except PaymentProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    payment_statement = select(Payment).where(
        Payment.provider == provider_name,
        Payment.provider_reference == verification.provider_reference,
    )
    payment_result = await db.execute(payment_statement)
    payment = payment_result.scalar_one_or_none()

    if payment:
        session_id = payment.session_id
    else:
        session_id = verification.session_id

    if not session_id:
        raise HTTPException(status_code=422, detail="session_mapping_missing")

    session = await db.get(Session, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session_not_found")

    if payment is None:
        payment = Payment(
            session_id=session_id,
            provider=provider_name,
            provider_reference=verification.provider_reference,
            amount_minor=verification.amount_minor,
            currency=verification.currency,
            status=verification.status,
            confirmed_at=datetime.now(UTC) if verification.status == "confirmed" else None,
        )
        db.add(payment)
    else:
        payment.status = verification.status
        if verification.status == "confirmed":
            payment.confirmed_at = datetime.now(UTC)

    if verification.status == "confirmed":
        session.status = "ready"

    expires_at = datetime.now(UTC) + timedelta(days=30)
    db.add(
        IdempotencyKey(
            scope=scope,
            key=key,
            request_hash=_hash_body(raw_body),
            response_json={
                "processed": True,
                "provider_reference": verification.provider_reference,
            },
            status_code=200,
            expires_at=expires_at,
        )
    )

    await db.commit()
    return True


async def require_confirmed_session_payment(db: AsyncSession, *, session_id: str) -> Payment:
    payment_statement = select(Payment).where(Payment.session_id == session_id)
    payment_result = await db.execute(payment_statement)
    payments = list(payment_result.scalars().all())

    if not payments:
        raise HTTPException(status_code=422, detail="payment_not_initialized")

    for payment in payments:
        if payment.status == "confirmed":
            return payment

    raise HTTPException(status_code=409, detail="payment_not_confirmed")
