import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.activity.models import ActivityEvent
from app.features.channels.models import ChannelLink
from app.features.channels.service import (
    assign_klawva_whatsapp_number,
    assign_telegram_bot_token,
    auto_lock_telegram,
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
            pending = openclaw_gateway.read_pending_telegram_pairings()
            for pairing in pending:
                code = pairing.get("code", "")
                if code:
                    openclaw_gateway.approve_telegram_pairing(code)
                    logger.info("auto-approved pairing %s", code)
        except Exception:
            logger.warning("pairing approval failed for session %s", session_id, exc_info=True)

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
        dateRange=date_range,
        stats=[StatEntry(label=item["label"], value=item["value"]) for item in stats],
        summary=summary,
        shareToken=share_token,
    )
