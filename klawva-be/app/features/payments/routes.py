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

router = APIRouter(prefix="/api/payments", tags=["payments"])


@router.post("/initialize", response_model=InitializePaymentResponse)
async def initialize_payment_endpoint(
    payload: InitializePaymentRequest,
    request: Request,
    db: AsyncSession = Depends(get_async_session),
) -> InitializePaymentResponse:
    billing = resolve_billing_profile_from_headers(request.headers)
    payment, init_result = await initialize_payment(
        db,
        session_id=payload.session_id,
        provider_name=billing.provider,
        amount_minor=billing.amount_minor,
        currency=billing.currency,
        customer_email=payload.customer_email,
    )

    return InitializePaymentResponse(
        paymentId=payment.id,
        provider=billing.provider,
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


@router.post("/paystack/webhook", response_model=WebhookResultResponse)
async def paystack_webhook_endpoint(
    request: Request,
    db: AsyncSession = Depends(get_async_session),
    x_paystack_signature: str | None = Header(default=None),
) -> WebhookResultResponse:
    processed = await process_webhook(
        db,
        provider_name="paystack",
        raw_body=await request.body(),
        signature_header=x_paystack_signature,
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
