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

_COUNTRY_HINT_HEADERS = (
    "x-klawva-country-hint",
    "x-country-hint",
)

_TIMEZONE_HEADERS = (
    "x-klawva-timezone",
    "x-timezone",
)

_LANGUAGE_HEADERS = (
    "x-klawva-languages",
    "accept-language",
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

    language_value = _first_header_value(headers, _LANGUAGE_HEADERS)
    timezone_value = _first_header_value(headers, _TIMEZONE_HEADERS)

    hint_code = _extract_country_hint(headers)
    if hint_code:
        if hint_code != "NG":
            return hint_code
        if _is_nigeria_language(language_value) or _is_nigeria_timezone(timezone_value):
            return "NG"

    if _is_nigeria_timezone(timezone_value) or _is_nigeria_language(language_value):
        return "NG"

    return None


def _first_header_value(headers: Mapping[str, str], names: tuple[str, ...]) -> str | None:
    for name in names:
        value = headers.get(name)
        if value:
            return value
    return None


def _extract_country_hint(headers: Mapping[str, str]) -> str | None:
    for header in _COUNTRY_HINT_HEADERS:
        code = _normalize_country_code(headers.get(header))
        if code:
            return code
    return None


def _is_nigeria_timezone(value: str | None) -> bool:
    if not value:
        return False
    timezone = value.strip().lower()
    return timezone in {"africa/lagos"}


def _is_nigeria_language(value: str | None) -> bool:
    if not value:
        return False
    normalized = value.strip().lower()
    return "-ng" in normalized


def resolve_billing_profile_from_country(country_code: str | None) -> BillingProfile:
    if country_code == "NG":
        return BillingProfile(
            provider="nomba",
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
