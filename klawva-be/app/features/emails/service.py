from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.emails.models import EmailEvent
from app.platform.email.service import EmailServiceError, send_contact_email


async def send_contact_and_record(
    db: AsyncSession,
    *,
    subject: str,
    body: str,
    reply_to: str | None,
) -> None:
    try:
        await send_contact_email(subject=subject, body=body, reply_to=reply_to)
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
            provider_message_id=None,
            error_message=None,
            sent_at=datetime.now(UTC),
        )
    )
    await db.commit()
