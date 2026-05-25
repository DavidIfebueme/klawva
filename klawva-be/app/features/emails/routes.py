from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.emails.contracts import (
    ContactEmailRequest,
    DispatchDueEmailsResponse,
    SendEmailResponse,
)
from app.features.emails.service import dispatch_due_shift_emails, send_contact_and_record
from app.platform.db.session import get_async_session

router = APIRouter(prefix="/api/emails", tags=["emails"])


@router.post("/contact", response_model=SendEmailResponse)
async def send_contact_email_endpoint(
    payload: ContactEmailRequest,
    db: AsyncSession = Depends(get_async_session),
) -> SendEmailResponse:
    await send_contact_and_record(
        db,
        name=payload.name,
        email=payload.email,
        employee_type=payload.employee_type,
        description=payload.description,
    )
    return SendEmailResponse(sent=True)


@router.post("/dispatch-due", response_model=DispatchDueEmailsResponse)
async def dispatch_due_shift_emails_endpoint(
    db: AsyncSession = Depends(get_async_session),
) -> DispatchDueEmailsResponse:
    sent_count = await dispatch_due_shift_emails(db)
    return DispatchDueEmailsResponse(sentCount=sent_count)
