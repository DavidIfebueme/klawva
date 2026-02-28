from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.history.contracts import (
    HistorySessionItem,
    HistorySessionsResponse,
    RequestHistoryLinkPayload,
    RequestHistoryLinkResponse,
)
from app.features.history.service import get_history_sessions, request_history_link
from app.platform.db.session import get_async_session

router = APIRouter(prefix="/api/history", tags=["history"])


@router.post("/request-link", response_model=RequestHistoryLinkResponse)
async def request_history_link_endpoint(
    payload: RequestHistoryLinkPayload,
    db: AsyncSession = Depends(get_async_session),
) -> RequestHistoryLinkResponse:
    await request_history_link(db, email=payload.email)
    return RequestHistoryLinkResponse(sent=True)


@router.get("/sessions", response_model=HistorySessionsResponse)
async def get_history_sessions_endpoint(
    token: str = Query(...),
    db: AsyncSession = Depends(get_async_session),
) -> HistorySessionsResponse:
    sessions = await get_history_sessions(db, token=token)
    return HistorySessionsResponse(
        sessions=[
            HistorySessionItem(
                sessionId=session.id,
                agentId=session.agent_id,
                channel=session.channel,
                status=session.status,
                startedAt=session.started_at,
                endsAt=session.expires_at,
                completedAt=session.completed_at,
            )
            for session in sessions
        ]
    )
