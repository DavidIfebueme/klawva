from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.payments.contracts import (
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
    db: AsyncSession = Depends(get_async_session),
) -> InitializePaymentResponse:
    payment, init_result = await initialize_payment(
        db,
        session_id=payload.session_id,
        provider_name=payload.provider,
        amount_minor=payload.amount_minor,
        currency=payload.currency,
        customer_email=payload.customer_email,
    )

    return InitializePaymentResponse(
        paymentId=payment.id,
        provider=payload.provider,
        providerReference=payment.provider_reference,
        status=payment.status,
        checkoutUrl=init_result.checkout_url,
        clientSecret=init_result.client_secret,
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
