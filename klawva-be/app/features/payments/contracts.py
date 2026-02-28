from typing import Literal

from pydantic import BaseModel, Field

PaymentProviderName = Literal["paystack", "stripe"]


class InitializePaymentRequest(BaseModel):
    session_id: str = Field(alias="sessionId")
    provider: PaymentProviderName | None = None
    amount_minor: int | None = Field(default=None, alias="amountMinor", gt=0)
    currency: str | None = None
    customer_email: str | None = Field(default=None, alias="customerEmail")


class InitializePaymentResponse(BaseModel):
    payment_id: str = Field(alias="paymentId")
    provider: PaymentProviderName
    provider_reference: str = Field(alias="providerReference")
    status: str
    amount_minor: int = Field(alias="amountMinor")
    currency: str
    checkout_url: str | None = Field(default=None, alias="checkoutUrl")
    client_secret: str | None = Field(default=None, alias="clientSecret")


class WebhookResultResponse(BaseModel):
    processed: bool


class BillingProfileResponse(BaseModel):
    provider: PaymentProviderName
    amount_minor: int = Field(alias="amountMinor")
    currency: str
    amount_display: str = Field(alias="amountDisplay")
    region: str
    country_code: str | None = Field(default=None, alias="countryCode")
