from __future__ import annotations

import httpx

from app.platform.config import settings

_BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"


class EmailServiceError(RuntimeError):
    pass


def _require_brevo_settings() -> None:
    if not settings.brevo_api_key:
        raise EmailServiceError("BREVO_API_KEY is not configured")
    if not settings.brevo_sender_email:
        raise EmailServiceError("BREVO_SENDER_EMAIL is not configured")
    if not settings.contact_recipient_email:
        raise EmailServiceError("CONTACT_RECIPIENT_EMAIL is not configured")


async def send_transactional_email(
    *,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str | None = None,
    reply_to: str | None = None,
) -> None:

    print("yeah")
    _require_brevo_settings()

    payload: dict = {
        "sender": {
            "name": settings.brevo_sender_name,
            "email": settings.brevo_sender_email,
        },
        "to": [{"email": to_email}],
        "subject": subject,
        "textContent": text_body,
    }

    if html_body:
        payload["htmlContent"] = html_body

    if reply_to:
        payload["replyTo"] = {"email": reply_to}

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            _BREVO_API_URL,
            headers={
                "api-key": settings.brevo_api_key or "",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            json=payload,
        )

    if resp.status_code >= 400:
        detail = resp.text
        raise EmailServiceError(f"Brevo API error {resp.status_code}: {detail}")


async def send_contact_email(*, subject: str, body: str, reply_to: str | None = None) -> None:
    await send_transactional_email(
        to_email=settings.contact_recipient_email or "",
        subject=subject,
        text_body=body,
        reply_to=reply_to,
    )
