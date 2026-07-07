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
from app.platform.db.session import get_async_session

from app.platform.config import settings

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
