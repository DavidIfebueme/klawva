import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.activity.models import ActivityEvent
from app.features.channels.models import ChannelLink
from app.features.channels.service import (
    _normalize_whatsapp_number,
    assign_klawva_whatsapp_number,
    assign_telegram_bot_token,
    auto_lock_telegram,
    get_vendor_whatsapp_qr,
)
from app.features.emails.service import send_shift_started_email
from app.features.payments.service import require_confirmed_session_payment
from app.features.provisioning.agent_config import _agent_gateway_id
from app.features.provisioning.service import start_provisioning
from app.features.sessions.auth import assert_session_access, get_session_token_header
from app.features.sessions.contracts import (
    ActivateSessionResponse,
    ActivityEntry,
    CreateSessionPayload,
    CreateSessionResponse,
    SessionActivityResponse,
    SessionReportResponse,
    SessionStatusResponse,
    StatEntry,
)
from app.features.sessions.service import (
    create_session,
    ensure_session_window,
    get_connected_flag,
    get_session_activity,
    get_session_report,
    normalize_session_status,
)
from app.features.termination.service import schedule_termination
from app.platform.clients import openclaw_gateway
from app.platform.db.session import get_async_session

logger = logging.getLogger(__name__)


router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.post("", response_model=CreateSessionResponse)
async def create_session_endpoint(
    payload: CreateSessionPayload,
    db: AsyncSession = Depends(get_async_session),
) -> CreateSessionResponse:
    session, session_token = await create_session(
        db,
        agent_id=payload.agent_id,
        channel=payload.channel,
        brief=payload.brief,
        customer_email=payload.customer_email,
        payment_ref=payload.payment_ref,
    )
    return CreateSessionResponse(sessionId=session.id, sessionToken=session_token)


@router.post("/{session_id}/activate", response_model=ActivateSessionResponse)
async def activate_session_endpoint(
    session_id: str,
    session_token: str = Depends(get_session_token_header),
    db: AsyncSession = Depends(get_async_session),
) -> ActivateSessionResponse:
    session = await assert_session_access(
        db,
        session_id=session_id,
        session_token=session_token,
    )
    current_session_id = session.id

    await require_confirmed_session_payment(db, session_id=current_session_id)
    ensure_session_window(session)

    qr: str | None = None
    expires_in: int | None = None
    telegram_deep_link: str | None = None
    whatsapp_number: str | None = None
    wa_me_link: str | None = None

    if session.channel == "whatsapp":
        if session.agent_id == "vendor":
            qr, expires_in = await get_vendor_whatsapp_qr(
                db, session_id=current_session_id
            )
            vendor_number = _normalize_whatsapp_number(
                session.brief.get("whatsapp_number")
            )
            if vendor_number:
                stmt = select(ChannelLink).where(
                    ChannelLink.session_id == current_session_id
                )
                vendor_link = (await db.execute(stmt)).scalar_one_or_none()
                if vendor_link:
                    vendor_link.link_target = vendor_number
                    await db.commit()
        else:
            whatsapp_number, wa_me_link = await assign_klawva_whatsapp_number(
                db, session_id=current_session_id
            )
    else:
        _, telegram_deep_link = await assign_telegram_bot_token(
            db,
            session_id=current_session_id,
        )

    stmt = select(ChannelLink).where(ChannelLink.session_id == current_session_id)
    channel_link = (await db.execute(stmt)).scalar_one_or_none()

    await start_provisioning(
        db,
        session_id=current_session_id,
        channel_link=channel_link,
        whatsapp_account=channel_link.external_id if channel_link else None,
    )

    db.add(
        ActivityEvent(
            session_id=current_session_id,
            event_type="bootstrap_completed",
            payload={
                "text": "Session bootstrapped via OpenClaw Gateway",
                "details": {"session_id": current_session_id},
            },
            occurred_at=datetime.now(UTC),
        )
    )

    session.status = "provisioning"
    await db.commit()
    await schedule_termination(db, session_id=current_session_id)

    if session.customer_email:
        await send_shift_started_email(db, session=session)

    return ActivateSessionResponse(
        status=session.status,
        startedAt=session.started_at.isoformat() if session.started_at else None,
        endsAt=session.expires_at.isoformat() if session.expires_at else None,
        qr=qr,
        expiresIn=expires_in,
        telegramToken=None,
        telegramDeepLink=telegram_deep_link,
        whatsappNumber=whatsapp_number,
        waMeLink=wa_me_link,
    )


@router.get(
    "/{session_id}/status",
    response_model=SessionStatusResponse,
    response_model_exclude_none=True,
)
async def get_session_status_endpoint(
    session_id: str,
    session_token: str = Depends(get_session_token_header),
    db: AsyncSession = Depends(get_async_session),
) -> SessionStatusResponse:
    session = await assert_session_access(
        db,
        session_id=session_id,
        session_token=session_token,
    )
    normalized_status = normalize_session_status(session.status)

    if normalized_status == "provisioning":
        agent_id = _agent_gateway_id(session_id)

        try:
            agent_state = openclaw_gateway.check_agent_sessions(agent_id)
        except Exception:
            agent_state = {
                "channel_connected": False,
                "intro_sent": False,
                "peer_id": None,
                "provider": None,
            }

        if agent_state["channel_connected"]:
            session.status = "active"
            db.add(ActivityEvent(
                session_id=session_id,
                event_type="channel_connected",
                payload={"text": "channel connected", "provider": agent_state.get("provider", "")},
                occurred_at=datetime.now(UTC),
            ))
            if agent_state["intro_sent"]:
                db.add(ActivityEvent(
                    session_id=session_id,
                    event_type="intro_sent",
                    payload={"text": "intro message sent"},
                    occurred_at=datetime.now(UTC),
                ))

            if agent_state["provider"] == "telegram" and agent_state.get("peer_id"):
                try:
                    await auto_lock_telegram(db, session_id, agent_state["peer_id"])
                except Exception:
                    logger.warning(
                        "auto-lock telegram failed for session %s", session_id, exc_info=True
                    )

            await db.commit()
            normalized_status = "active"

    connected = get_connected_flag(normalized_status)
    return SessionStatusResponse(status=normalized_status, connected=connected)


@router.get("/{session_id}/activity", response_model=SessionActivityResponse)
async def get_session_activity_endpoint(
    session_id: str,
    session_token: str = Depends(get_session_token_header),
    db: AsyncSession = Depends(get_async_session),
) -> SessionActivityResponse:
    await assert_session_access(
        db,
        session_id=session_id,
        session_token=session_token,
    )
    events = await get_session_activity(db, session_id)
    activities = [
        ActivityEntry(
            id=event.id,
            timestamp=event.occurred_at.isoformat(),
            text=str(event.payload.get("text", event.event_type)),
        )
        for event in events
    ]
    return SessionActivityResponse(activities=activities)


@router.get("/{session_id}/report", response_model=SessionReportResponse)
async def get_session_report_endpoint(
    session_id: str,
    session_token: str = Depends(get_session_token_header),
    db: AsyncSession = Depends(get_async_session),
) -> SessionReportResponse:
    await assert_session_access(
        db,
        session_id=session_id,
        session_token=session_token,
    )
    date_range, stats, summary, share_token = await get_session_report(db, session_id)
    return SessionReportResponse(
        date_range=date_range,
        stats=[StatEntry(label=item["label"], value=item["value"]) for item in stats],
        summary=summary,
        share_token=share_token,
    )


@router.post("/{session_id}/upload-cv")
async def upload_cv_endpoint(
    session_id: str,
    file: UploadFile = File(...),
    session_token: str = Depends(get_session_token_header),
    db: AsyncSession = Depends(get_async_session),
) -> dict:
    session = await assert_session_access(
        db,
        session_id=session_id,
        session_token=session_token,
    )

    if session.agent_id not in ("jobseeker", "leadscout"):
        raise HTTPException(status_code=400, detail="cv_upload_not_supported")

    if not file.filename or not file.filename.lower().endswith(".docx"):
        raise HTTPException(status_code=400, detail="only_docx_files_allowed")

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="file_too_large_max_5mb")

    try:
        import io

        import docx

        doc = docx.Document(io.BytesIO(content))
        cv_text = "\n".join(para.text for para in doc.paragraphs if para.text.strip())
    except Exception as exc:
        raise HTTPException(status_code=400, detail="failed_to_parse_docx") from exc

    if not cv_text.strip():
        raise HTTPException(status_code=400, detail="document_contains_no_text")

    brief = dict(session.brief) if isinstance(session.brief, dict) else {}
    brief["cv_text"] = cv_text
    session.brief = brief
    await db.commit()

    return {"success": True, "message": "CV uploaded and parsed successfully"}
