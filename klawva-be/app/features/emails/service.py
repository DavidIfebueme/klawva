import base64
import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import and_, exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.emails.models import EmailEvent
from app.features.sessions.models import Session
from app.platform.config import settings
from app.platform.email.service import (
    EmailServiceError,
    send_contact_email,
    send_transactional_email,
)


def _render_template(
    *,
    title: str,
    body: str,
    cta_label: str | None = None,
    cta_href: str | None = None,
) -> str:
    cta = ""
    if cta_label and cta_href:
        cta = (
            f'<a href="{cta_href}" style="display:inline-block;padding:12px 20px;'
            "background:#E8FF47;color:#0A0A0A;text-decoration:none;border-radius:8px;"
            'font-family:Inter,system-ui,sans-serif;font-weight:700;">'
            f"{cta_label}</a>"
        )
    return (
        "<div style='background:#0A0A0A;padding:32px;"
        "font-family:Inter,system-ui,sans-serif;color:#EDEDED;'>"
        "<div style='max-width:640px;margin:0 auto;background:#121212;"
        "border:1px solid #2A2A2A;border-radius:12px;padding:28px;'>"
        "<div style='color:#E8FF47;font-weight:800;letter-spacing:0.16em;"
        "font-size:12px;margin-bottom:14px;'>KLAWVA</div>"
        f"<h1 style='font-size:24px;line-height:1.25;margin:0 0 12px 0;"
        f"color:#FFFFFF;'>{title}</h1>"
        f"<div style='font-size:14px;line-height:1.7;color:#BDBDBD;"
        f"margin-bottom:20px;'>{body}</div>"
        f"{cta}"
        "<div style='margin-top:24px;font-size:12px;color:#6B6B6B;'>"
        "Thanks for hiring a Klawva worker.</div>"
        "</div></div>"
    )


def _format_dt(value: datetime | None) -> str:
    if value is None:
        return "Not scheduled"
    return value.astimezone(UTC).strftime("%Y-%m-%d %H:%M UTC")


async def _has_email_event(
    db: AsyncSession,
    *,
    session_id: str,
    email_type: str,
) -> bool:
    stmt = select(
        exists().where(
            and_(
                EmailEvent.session_id == session_id,
                EmailEvent.email_type == email_type,
                EmailEvent.status == "sent",
            )
        )
    )
    result = await db.execute(stmt)
    return bool(result.scalar())


async def _record_email_event(
    db: AsyncSession,
    *,
    session_id: str | None,
    email_type: str,
    to_email: str,
    subject: str,
    status: str,
    provider_message_id: str | None = None,
    error_message: str | None = None,
) -> None:
    db.add(
        EmailEvent(
            session_id=session_id,
            email_type=email_type,
            to_email=to_email,
            subject=subject,
            status=status,
            provider_message_id=provider_message_id,
            error_message=error_message,
            sent_at=datetime.now(UTC) if status == "sent" else None,
        )
    )
    await db.commit()


async def send_contact_and_record(
    db: AsyncSession,
    *,
    name: str,
    email: str,
    employee_type: str | None,
    description: str,
) -> None:
    subject = "Custom Klawva Employee request"
    body_lines = [
        f"Name: {name}",
        f"Email: {email}",
    ]
    if employee_type:
        body_lines.append(f"Employee type: {employee_type}")
    body_lines.append("")
    body_lines.append(description)
    body = "<br/>".join(body_lines)

    try:
        message_id = await send_contact_email(subject=subject, body=body, reply_to=email)
    except EmailServiceError as exc:
        db.add(
            EmailEvent(
                session_id=None,
                email_type="contact",
                to_email="contact_recipient",
                subject=subject,
                status="failed",
                provider_message_id=None,
                error_message=str(exc),
                sent_at=None,
            )
        )
        await db.commit()
        raise HTTPException(status_code=502, detail="email_send_failed") from exc

    db.add(
        EmailEvent(
            session_id=None,
            email_type="contact",
            to_email="contact_recipient",
            subject=subject,
            status="sent",
            provider_message_id=message_id,
            error_message=None,
            sent_at=datetime.now(UTC),
        )
    )
    await db.commit()


async def send_shift_started_email(db: AsyncSession, *, session: Session) -> None:
    if not session.customer_email:
        return
    if await _has_email_event(db, session_id=session.id, email_type="hire_confirmation"):
        return

    subject = "Your Klawva worker is now active"
    body = (
        "Thanks for hiring with Klawva.<br/>"
        f"Shift start: <strong>{_format_dt(session.started_at)}</strong><br/>"
        f"Shift end: <strong>{_format_dt(session.expires_at)}</strong>"
    )
    html = _render_template(
        title="Your worker shift has started",
        body=body,
        cta_label="View Session",
        cta_href=f"{settings.frontend_base_url}/session/{session.id}/status",
    )
    text = (
        "Your worker shift has started. "
        f"Start: {_format_dt(session.started_at)}. End: {_format_dt(session.expires_at)}."
    )
    try:
        message_id = await send_transactional_email(
            to_email=session.customer_email,
            subject=subject,
            text_body=text,
            html_body=html,
        )
    except EmailServiceError as exc:
        await _record_email_event(
            db,
            session_id=session.id,
            email_type="hire_confirmation",
            to_email=session.customer_email,
            subject=subject,
            status="failed",
            error_message=str(exc),
        )
        return

    await _record_email_event(
        db,
        session_id=session.id,
        email_type="hire_confirmation",
        to_email=session.customer_email,
        subject=subject,
        status="sent",
        provider_message_id=message_id,
    )


async def send_shift_ending_soon_email(db: AsyncSession, *, session: Session) -> None:
    if not session.customer_email:
        return
    if await _has_email_event(db, session_id=session.id, email_type="shift_ending_soon"):
        return

    subject = "Your Klawva worker shift ends in 1 hour"
    body = (
        "Your worker is still active and will wrap up soon.<br/>"
        f"Shift start: <strong>{_format_dt(session.started_at)}</strong><br/>"
        f"Shift end: <strong>{_format_dt(session.expires_at)}</strong>"
    )
    html = _render_template(
        title="One hour left in your worker shift",
        body=body,
        cta_label="Open Live Session",
        cta_href=f"{settings.frontend_base_url}/session/{session.id}/status",
    )
    text = (
        "Your worker shift ends in 1 hour. "
        f"Start: {_format_dt(session.started_at)}. End: {_format_dt(session.expires_at)}."
    )
    try:
        message_id = await send_transactional_email(
            to_email=session.customer_email,
            subject=subject,
            text_body=text,
            html_body=html,
        )
    except EmailServiceError as exc:
        await _record_email_event(
            db,
            session_id=session.id,
            email_type="shift_ending_soon",
            to_email=session.customer_email,
            subject=subject,
            status="failed",
            error_message=str(exc),
        )
        return

    await _record_email_event(
        db,
        session_id=session.id,
        email_type="shift_ending_soon",
        to_email=session.customer_email,
        subject=subject,
        status="sent",
        provider_message_id=message_id,
    )


async def send_shift_ended_email(db: AsyncSession, *, session: Session) -> None:
    if not session.customer_email:
        return
    if await _has_email_event(db, session_id=session.id, email_type="shift_ended"):
        return

    subject = "Your Klawva worker shift has ended"
    body = (
        "Your worker's shift is now complete.<br/>"
        f"Shift start: <strong>{_format_dt(session.started_at)}</strong><br/>"
        f"Shift end: <strong>{_format_dt(session.expires_at or session.completed_at)}</strong>"
    )
    html = _render_template(
        title="Shift complete",
        body=body,
        cta_label="Hire Again",
        cta_href=f"{settings.frontend_base_url}/",
    )
    text = (
        "Your worker shift has ended. "
        "Start: "
        f"{_format_dt(session.started_at)}. "
        "End: "
        f"{_format_dt(session.expires_at or session.completed_at)}."
    )
    try:
        message_id = await send_transactional_email(
            to_email=session.customer_email,
            subject=subject,
            text_body=text,
            html_body=html,
        )
    except EmailServiceError as exc:
        await _record_email_event(
            db,
            session_id=session.id,
            email_type="shift_ended",
            to_email=session.customer_email,
            subject=subject,
            status="failed",
            error_message=str(exc),
        )
        return

    await _record_email_event(
        db,
        session_id=session.id,
        email_type="shift_ended",
        to_email=session.customer_email,
        subject=subject,
        status="sent",
        provider_message_id=message_id,
    )


async def dispatch_due_shift_emails(db: AsyncSession) -> int:
    now = datetime.now(UTC)
    warning_cutoff = now + timedelta(hours=1)
    stmt = select(Session).where(
        Session.customer_email.is_not(None),
        Session.expires_at.is_not(None),
    )
    result = await db.execute(stmt)
    sessions = list(result.scalars().all())
    sent_count = 0
    for session in sessions:
        if not session.expires_at:
            continue
        if now <= session.expires_at <= warning_cutoff:
            was_sent = await _has_email_event(
                db,
                session_id=session.id,
                email_type="shift_ending_soon",
            )
            if not was_sent:
                await send_shift_ending_soon_email(db, session=session)
                sent_count += 1
        if session.expires_at <= now:
            was_sent = await _has_email_event(
                db,
                session_id=session.id,
                email_type="shift_ended",
            )
            if not was_sent:
                await send_shift_ended_email(db, session=session)
                sent_count += 1
    return sent_count


def _encode_history_token(email: str) -> str:
    secret = settings.history_magic_link_secret
    if not secret:
        raise HTTPException(status_code=503, detail="history_magic_link_secret_not_configured")
    exp = int(
        (datetime.now(UTC) + timedelta(minutes=settings.history_magic_link_ttl_minutes)).timestamp()
    )
    payload = json.dumps({"email": email, "exp": exp}, separators=(",", ":")).encode("utf-8")
    body = base64.urlsafe_b64encode(payload).decode("utf-8").rstrip("=")
    signature = hmac.new(secret.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{body}.{signature}"


def decode_history_token(token: str) -> str:
    secret = settings.history_magic_link_secret
    if not secret:
        raise HTTPException(status_code=503, detail="history_magic_link_secret_not_configured")
    try:
        body, signature = token.split(".", 1)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="invalid_history_token") from exc
    expected = hmac.new(secret.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=401, detail="invalid_history_token")
    padding = "=" * (-len(body) % 4)
    payload = json.loads(base64.urlsafe_b64decode((body + padding).encode("utf-8")))
    exp = int(payload.get("exp", 0))
    if exp < int(datetime.now(UTC).timestamp()):
        raise HTTPException(status_code=401, detail="history_token_expired")
    email = str(payload.get("email", "")).strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="invalid_history_token")
    return email


async def send_history_magic_link(db: AsyncSession, *, email: str) -> None:
    normalized = email.strip().lower()
    token = _encode_history_token(normalized)
    history_link = f"{settings.frontend_base_url}/history?token={token}"
    subject = "Your Klawva session history link"
    html = _render_template(
        title="Access your Klawva history",
        body="Use this secure one-time link to view your Klawva worker history.",
        cta_label="View History",
        cta_href=history_link,
    )
    text = f"Open your Klawva history: {history_link}"
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
            email_type="history_magic_link",
            to_email=normalized,
            subject=subject,
            status="failed",
            error_message=str(exc),
        )
        raise HTTPException(status_code=502, detail="email_send_failed") from exc

    await _record_email_event(
        db,
        session_id=None,
        email_type="history_magic_link",
        to_email=normalized,
        subject=subject,
        status="sent",
        provider_message_id=message_id,
    )
