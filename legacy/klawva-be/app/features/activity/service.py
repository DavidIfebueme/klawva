from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.activity.models import ActivityEvent
from app.features.sessions.models import Session

EVENT_STATUS_MAP = {
    "provisioning_started": "provisioning",
    "channel_ready": "ready",
    "bootstrap_completed": "active",
    "mission_completed": "completed",
}


async def ingest_activity_event(
    db: AsyncSession,
    *,
    session_id: str,
    event_type: str,
    text: str,
    payload: dict,
) -> ActivityEvent:
    session = await db.get(Session, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session_not_found")

    merged_payload = {"text": text, **payload}
    event = ActivityEvent(
        session_id=session_id,
        event_type=event_type,
        payload=merged_payload,
        occurred_at=datetime.now(UTC),
    )

    projected_status = EVENT_STATUS_MAP.get(event_type)
    if projected_status is not None:
        session.status = projected_status

    db.add(event)
    await db.commit()
    await db.refresh(event)
    return event


async def project_session_status(db: AsyncSession, *, session_id: str) -> tuple[str, bool | None]:
    session = await db.get(Session, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session_not_found")

    statement = (
        select(ActivityEvent)
        .where(ActivityEvent.session_id == session_id)
        .order_by(ActivityEvent.occurred_at.desc())
    )
    result = await db.execute(statement)
    latest = result.scalars().first()

    if latest is not None:
        projected_status = EVENT_STATUS_MAP.get(latest.event_type)
        if projected_status is not None and projected_status != session.status:
            session.status = projected_status
            await db.commit()

    status = session.status
    if status == "provisioning":
        return status, None
    return status, status in {"ready", "active", "completed"}
