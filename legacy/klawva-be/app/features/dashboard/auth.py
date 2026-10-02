import base64
import hashlib
import hmac
import json
import logging
from datetime import UTC, datetime, timedelta

from fastapi import Header, HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.platform.config import settings
from app.features.users.models import User
from app.platform.db.session import get_async_session
from app.platform.email.service import send_transactional_email, EmailServiceError
from app.features.emails.service import _render_template, _record_email_event

logger = logging.getLogger(__name__)


def generate_token(email: str, exp_minutes: int, scope: str) -> str:
    secret = settings.history_magic_link_secret or "fallback-secret"
    exp = int((datetime.now(UTC) + timedelta(minutes=exp_minutes)).timestamp())
    payload = json.dumps({"email": email, "exp": exp, "scope": scope}, separators=(",", ":")).encode("utf-8")
    body = base64.urlsafe_b64encode(payload).decode("utf-8").rstrip("=")
    signature = hmac.new(secret.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{body}.{signature}"


def decode_token(token: str, expected_scope: str) -> str:
    secret = settings.history_magic_link_secret or "fallback-secret"
    try:
        body, signature = token.split(".", 1)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="invalid_token") from exc
    expected = hmac.new(secret.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=401, detail="invalid_token")
    padding = "=" * (-len(body) % 4)
    payload = json.loads(base64.urlsafe_b64decode((body + padding).encode("utf-8")))
    exp = int(payload.get("exp", 0))
    if exp < int(datetime.now(UTC).timestamp()):
        raise HTTPException(status_code=401, detail="token_expired")
    if payload.get("scope") != expected_scope:
        raise HTTPException(status_code=401, detail="invalid_scope")
    email = str(payload.get("email", "")).strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="invalid_token")
    return email


async def send_dashboard_magic_link(db: AsyncSession, email: str) -> None:
    normalized = email.strip().lower()
    token = generate_token(normalized, exp_minutes=30, scope="dashboard_magic_link")
    verify_link = f"{settings.frontend_base_url}/dashboard/auth/verify?token={token}"
    subject = "Your Klawva dashboard login link"
    html = _render_template(
        title="Access your Klawva Dashboard",
        body="Use this secure one-time link to log into your Klawva dashboard.",
        cta_label="Log In",
        cta_href=verify_link,
    )
    text = f"Log into your Klawva dashboard: {verify_link}"
    try:
        message_id = await send_transactional_email(
            to_email=normalized,
            subject=subject,
            text_body=text,
            html_body=html,
        )
    except EmailServiceError as exc:
        await _record_email_event(
            db,
            session_id=None,
            email_type="dashboard_magic_link",
            to_email=normalized,
            subject=subject,
            status="failed",
            error_message=str(exc),
        )
        raise HTTPException(status_code=502, detail="email_send_failed") from exc

    await _record_email_event(
        db,
        session_id=None,
        email_type="dashboard_magic_link",
        to_email=normalized,
        subject=subject,
        status="sent",
        provider_message_id=message_id,
    )


async def get_current_user(
    x_dashboard_token: str | None = Header(default=None, alias="x-dashboard-token"),
    db: AsyncSession = Depends(get_async_session),
) -> User:
    if not x_dashboard_token:
        raise HTTPException(status_code=401, detail="unauthorized_missing_token")
    try:
        email = decode_token(x_dashboard_token, expected_scope="dashboard_session")
    except HTTPException as exc:
        raise exc
    except Exception as exc:
        raise HTTPException(status_code=401, detail="invalid_token") from exc

    stmt = select(User).where(User.email == email)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="user_not_found")
    return user
