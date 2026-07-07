from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.payments.billing import resolve_billing_profile_from_headers
from app.features.payments.contracts import (
    BillingProfileResponse,
    InitializePaymentRequest,
    InitializePaymentResponse,
    WebhookResultResponse,
)
from app.features.payments.service import initialize_payment, process_webhook
from app.platform.config import settings
from app.platform.db.session import get_async_session

router = APIRouter(prefix="/api/payments", tags=["payments"])


@router.post("/initialize", response_model=InitializePaymentResponse)
async def initialize_payment_endpoint(
    payload: InitializePaymentRequest,
    request: Request,
    db: AsyncSession = Depends(get_async_session),
) -> InitializePaymentResponse:
    billing = resolve_billing_profile_from_headers(request.headers)
    provider_name = payload.provider or billing.provider
    amount_minor = payload.amount_minor or billing.amount_minor
    currency = payload.currency or billing.currency

    import sys

    is_dev = settings.env == "development" and "pytest" not in sys.modules
    if is_dev and provider_name == "nomba" and currency == "NGN":
        amount_minor = 1000

    payment, init_result = await initialize_payment(
        db,
        session_id=payload.session_id,
        provider_name=provider_name,
        amount_minor=amount_minor,
        currency=currency,
        customer_email=payload.customer_email,
    )

    return InitializePaymentResponse(
        paymentId=payment.id,
        provider=payment.provider,
        providerReference=payment.provider_reference,
        status=payment.status,
        amountMinor=payment.amount_minor,
        currency=payment.currency,
        checkoutUrl=init_result.checkout_url,
        clientSecret=init_result.client_secret,
    )


@router.get("/billing-profile", response_model=BillingProfileResponse)
async def get_billing_profile_endpoint(request: Request) -> BillingProfileResponse:
    billing = resolve_billing_profile_from_headers(request.headers)
    return BillingProfileResponse(
        provider=billing.provider,
        amountMinor=billing.amount_minor,
        currency=billing.currency,
        amountDisplay=billing.amount_display,
        region=billing.region,
        countryCode=billing.country_code,
    )


import logging

logger = logging.getLogger(__name__)


@router.post("/nomba/webhook", response_model=WebhookResultResponse)
async def nomba_webhook_endpoint(
    request: Request,
    db: AsyncSession = Depends(get_async_session),
    nomba_signature: str | None = Header(default=None),
    nomba_timestamp: str | None = Header(default=None),
) -> WebhookResultResponse:
    body_bytes = await request.body()
    logger.debug("Nomba webhook raw headers: %s", dict(request.headers))
    logger.debug("Nomba webhook raw body: %s", body_bytes.decode("utf-8", errors="replace"))
    processed = await process_webhook(
        db,
        provider_name="nomba",
        raw_body=body_bytes,
        signature_header=nomba_signature,
        additional_headers={"nomba-timestamp": nomba_timestamp} if nomba_timestamp else None,
    )
    return WebhookResultResponse(processed=processed)


@router.post("/stripe/webhook", response_model=WebhookResultResponse)
async def stripe_webhook_endpoint(
    request: Request,
    db: AsyncSession = Depends(get_async_session),
    stripe_signature: str | None = Header(default=None),
) -> WebhookResultResponse:
    processed = await process_webhook(
        db,
        provider_name="stripe",
        raw_body=await request.body(),
        signature_header=stripe_signature,
    )
    return WebhookResultResponse(processed=processed)


from fastapi import HTTPException
from pydantic import BaseModel

from app.features.dashboard.auth import get_current_user
from app.features.users.models import User


class ManualReconciliationRequest(BaseModel):
    failed_reconciliation_id: str | None = None
    provider_reference: str | None = None
    session_id: str


@router.post("/reconciliation/manual")
async def manual_reconciliation_endpoint(
    payload: ManualReconciliationRequest,
    db: AsyncSession = Depends(get_async_session),
) -> dict:
    from datetime import UTC, datetime

    from sqlalchemy import select

    from app.features.payments.models import FailedReconciliation, Payment
    from app.features.payments.providers import get_provider
    from app.features.sessions.models import Session

    session = await db.get(Session, payload.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session_not_found")

    provider_ref = payload.provider_reference
    failed_rec = None
    if payload.failed_reconciliation_id:
        failed_rec = await db.get(FailedReconciliation, payload.failed_reconciliation_id)
        if not failed_rec:
            raise HTTPException(status_code=404, detail="failed_reconciliation_record_not_found")
        provider_ref = failed_rec.provider_reference

    if not provider_ref:
        raise HTTPException(status_code=400, detail="provider_reference_missing")

    provider_name = failed_rec.provider_name if failed_rec else "nomba"
    provider = get_provider(provider_name)
    try:
        verification = await provider.verify_transaction(provider_ref)
    except Exception as e:
        logger.error("Manual reconciliation failed to verify transaction %s: %s", provider_ref, e)
        raise HTTPException(status_code=502, detail="transaction_verification_failed")

    payment_stmt = select(Payment).where(Payment.provider_reference == provider_ref)
    payment_res = await db.execute(payment_stmt)
    payment = payment_res.scalar_one_or_none()

    if payment:
        payment.session_id = payload.session_id
        payment.status = verification.status
        payment.amount_minor = verification.amount_minor
        payment.currency = verification.currency
        if verification.status == "confirmed":
            payment.confirmed_at = datetime.now(UTC)
    else:
        payment = Payment(
            session_id=payload.session_id,
            provider=provider_name,
            provider_reference=provider_ref,
            amount_minor=verification.amount_minor,
            currency=verification.currency,
            status=verification.status,
            confirmed_at=datetime.now(UTC) if verification.status == "confirmed" else None,
        )
        db.add(payment)

    session.status = "ready"

    from app.features.payments.service import record_checkout_wallet_transactions
    await record_checkout_wallet_transactions(
        db,
        session=session,
        provider_reference=payment.provider_reference,
        amount_minor=payment.amount_minor,
    )

    if failed_rec:
        failed_rec.status = "resolved"

    await db.commit()
    return {"status": "resolved", "payment_id": payment.id}


@router.get("/settlement-report")
async def get_settlement_report(
    date: str | None = None,
    db: AsyncSession = Depends(get_async_session),
) -> dict:
    from datetime import UTC, datetime

    from sqlalchemy import select

    if date:
        try:
            report_date = datetime.strptime(date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="invalid_date_format_expected_yyyy_mm_dd")
    else:
        report_date = datetime.now(UTC).date()

    from app.features.payments.models import Payment, WalletTransaction

    start_dt = datetime.combine(report_date, datetime.min.time()).replace(tzinfo=UTC)
    end_dt = datetime.combine(report_date, datetime.max.time()).replace(tzinfo=UTC)

    stmt_checkouts = select(Payment).where(
        Payment.created_at >= start_dt,
        Payment.created_at <= end_dt,
    )
    res_checkouts = await db.execute(stmt_checkouts)
    payments = res_checkouts.scalars().all()

    checkout_confirmed_count = 0
    checkout_confirmed_amount = 0
    checkout_reversed_count = 0
    checkout_reversed_amount = 0

    for p in payments:
        if p.status == "confirmed":
            checkout_confirmed_count += 1
            checkout_confirmed_amount += p.amount_minor
        elif p.status == "reversed":
            checkout_reversed_count += 1
            checkout_reversed_amount += p.amount_minor

    stmt_wallet = select(WalletTransaction).where(
        WalletTransaction.created_at >= start_dt,
        WalletTransaction.created_at <= end_dt,
        WalletTransaction.source == "virtual_account",
    )
    res_wallet = await db.execute(stmt_wallet)
    wallet_txs = res_wallet.scalars().all()

    wallet_funding_count = 0
    wallet_funding_amount = 0
    wallet_reversal_count = 0
    wallet_reversal_amount = 0

    for w in wallet_txs:
        if w.type == "credit":
            wallet_funding_count += 1
            wallet_funding_amount += w.amount_minor
        elif w.type == "debit":
            wallet_reversal_count += 1
            wallet_reversal_amount += w.amount_minor

    net_settled_amount = (checkout_confirmed_amount + wallet_funding_amount) - (
        checkout_reversed_amount + wallet_reversal_amount
    )

    return {
        "date": report_date.isoformat(),
        "checkouts": {
            "confirmed_count": checkout_confirmed_count,
            "confirmed_amount_minor": checkout_confirmed_amount,
            "reversed_count": checkout_reversed_count,
            "reversed_amount_minor": checkout_reversed_amount,
        },
        "wallet_funding": {
            "credit_count": wallet_funding_count,
            "credit_amount_minor": wallet_funding_amount,
            "debit_reversal_count": wallet_reversal_count,
            "debit_reversal_amount_minor": wallet_reversal_amount,
        },
        "net_settled_amount_minor": net_settled_amount,
    }


@router.get("/statement")
async def get_statement_endpoint(
    db: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    from sqlalchemy import select

    from app.features.payments.models import Wallet, WalletTransaction

    wallet_stmt = select(Wallet).where(Wallet.user_id == current_user.id)
    wallet_res = await db.execute(wallet_stmt)
    wallet = wallet_res.scalar_one_or_none()
    if not wallet:
        return {
            "user": {"email": current_user.email, "id": current_user.id},
            "wallet": None,
            "transactions": [],
        }

    tx_stmt = (
        select(WalletTransaction)
        .where(WalletTransaction.wallet_id == wallet.id)
        .order_by(WalletTransaction.created_at.desc())
    )
    tx_res = await db.execute(tx_stmt)
    transactions = tx_res.scalars().all()

    return {
        "user": {
            "id": current_user.id,
            "email": current_user.email,
        },
        "wallet": {
            "id": wallet.id,
            "balance_minor": wallet.balance_minor,
            "currency": wallet.currency,
        },
        "transactions": [
            {
                "id": t.id,
                "type": t.type,
                "amount_minor": t.amount_minor,
                "reference": t.reference,
                "description": t.description,
                "balance_after": t.balance_after,
                "source": t.source,
                "created_at": t.created_at.isoformat(),
            }
            for t in transactions
        ],
    }
