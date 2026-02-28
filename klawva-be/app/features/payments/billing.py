from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

from app.features.payments.contracts import PaymentProviderName

_COUNTRY_HEADERS = (
    "cf-ipcountry",
    "x-vercel-ip-country",
    "cloudfront-viewer-country",
    "x-country-code",
)


@dataclass(frozen=True)
class BillingProfile:
    provider: PaymentProviderName
    amount_minor: int
    currency: str
    amount_display: str
    region: str
    country_code: str | None


def _normalize_country_code(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.split(",", 1)[0].strip().upper()
    if len(normalized) < 2:
        return None
    code = normalized[:2]
    if not code.isalpha():
        return None
    return code


def extract_country_code(headers: Mapping[str, str]) -> str | None:
    for header in _COUNTRY_HEADERS:
        value = headers.get(header)
        code = _normalize_country_code(value)
        if code:
            return code
    return None


def resolve_billing_profile_from_country(country_code: str | None) -> BillingProfile:
    if country_code == "NG":
        return BillingProfile(
            provider="paystack",
            amount_minor=250000,
            currency="NGN",
            amount_display="₦2,500",
            region="nigeria",
            country_code=country_code,
        )
    return BillingProfile(
        provider="stripe",
        amount_minor=199,
        currency="USD",
        amount_display="$1.99",
        region="global",
        country_code=country_code,
    )


def resolve_billing_profile_from_headers(headers: Mapping[str, str]) -> BillingProfile:
    return resolve_billing_profile_from_country(extract_country_code(headers))
