from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.activity.contracts import (
    ActivityIngestRequest,
    ActivityIngestResponse,
    SessionProjectionResponse,
)
from app.features.activity.service import ingest_activity_event, project_session_status
from app.platform.db.session import get_async_session

router = APIRouter(prefix="/api/activity", tags=["activity"])


@router.post("/ingest", response_model=ActivityIngestResponse)
async def ingest_activity_endpoint(
    payload: ActivityIngestRequest,
    db: AsyncSession = Depends(get_async_session),
) -> ActivityIngestResponse:
    event = await ingest_activity_event(
        db,
        session_id=payload.session_id,
        event_type=payload.event_type,
        text=payload.text,
        payload=payload.payload,
    )
    return ActivityIngestResponse(eventId=event.id)


@router.get("/sessions/{session_id}/projection", response_model=SessionProjectionResponse)
async def session_projection_endpoint(
    session_id: str,
    db: AsyncSession = Depends(get_async_session),
) -> SessionProjectionResponse:
    status, connected = await project_session_status(db, session_id=session_id)
    return SessionProjectionResponse(status=status, connected=connected)
