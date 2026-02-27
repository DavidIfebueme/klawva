from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.sessions.contracts import (
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
    get_connected_flag,
    get_session_activity,
    get_session_or_404,
    get_session_report,
    normalize_session_status,
)
from app.platform.db.session import get_async_session

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.post("", response_model=CreateSessionResponse)
async def create_session_endpoint(
    payload: CreateSessionPayload,
    db: AsyncSession = Depends(get_async_session),
) -> CreateSessionResponse:
    session = await create_session(
        db,
        agent_id=payload.agent_id,
        channel=payload.channel,
        brief=payload.brief,
        payment_ref=payload.payment_ref,
    )
    return CreateSessionResponse(sessionId=session.id)


@router.get("/{session_id}/status", response_model=SessionStatusResponse)
async def get_session_status_endpoint(
    session_id: str,
    db: AsyncSession = Depends(get_async_session),
) -> SessionStatusResponse:
    session = await get_session_or_404(db, session_id)
    normalized_status = normalize_session_status(session.status)
    connected = get_connected_flag(normalized_status)
    return SessionStatusResponse(status=normalized_status, connected=connected)


@router.get("/{session_id}/activity", response_model=SessionActivityResponse)
async def get_session_activity_endpoint(
    session_id: str,
    db: AsyncSession = Depends(get_async_session),
) -> SessionActivityResponse:
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
    db: AsyncSession = Depends(get_async_session),
) -> SessionReportResponse:
    date_range, stats, summary = await get_session_report(db, session_id)
    return SessionReportResponse(
        dateRange=date_range,
        stats=[StatEntry(label=item["label"], value=item["value"]) for item in stats],
        summary=summary,
    )
