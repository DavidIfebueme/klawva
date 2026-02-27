from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.emails.contracts import ContactEmailRequest, SendEmailResponse
from app.features.emails.service import send_contact_and_record
from app.platform.db.session import get_async_session

router = APIRouter(prefix="/api/emails", tags=["emails"])


@router.post("/contact", response_model=SendEmailResponse)
async def send_contact_email_endpoint(
    payload: ContactEmailRequest,
    db: AsyncSession = Depends(get_async_session),
) -> SendEmailResponse:
    await send_contact_and_record(
        db,
        subject=payload.subject,
        body=payload.body,
        reply_to=payload.reply_to,
    )
    return SendEmailResponse(sent=True)
