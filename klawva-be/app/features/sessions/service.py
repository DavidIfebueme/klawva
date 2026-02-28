from datetime import UTC, datetime, timedelta
from typing import Literal, cast

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.activity.models import ActivityEvent
from app.features.reports.models import MissionReport
from app.features.sessions.auth import generate_session_token, hash_session_token
from app.features.sessions.models import Session

SessionState = Literal["provisioning", "ready", "active", "completed"]


def normalize_session_status(status: str) -> SessionState:
    allowed = {"provisioning", "ready", "active", "completed"}
    if status not in allowed:
        return "provisioning"
    return cast(SessionState, status)


async def create_session(
    db: AsyncSession,
    *,
    agent_id: str,
    channel: str,
    brief: dict[str, str],
    payment_ref: str,
) -> tuple[Session, str]:
    session_token = generate_session_token()
    session = Session(
        agent_id=agent_id,
        channel=channel,
        brief=brief,
        payment_ref=payment_ref,
        session_token_hash=hash_session_token(session_token),
        status="provisioning",
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session, session_token


def ensure_session_window(session: Session) -> None:
    now = datetime.now(UTC)
    if session.started_at is None:
        session.started_at = now
    if session.expires_at is None:
        session.expires_at = session.started_at + timedelta(hours=24)


async def get_session_or_404(db: AsyncSession, session_id: str) -> Session:
    statement = select(Session).where(Session.id == session_id)
    result = await db.execute(statement)
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="session_not_found")
    return session


async def get_session_activity(db: AsyncSession, session_id: str) -> list[ActivityEvent]:
    await get_session_or_404(db, session_id)
    statement = (
        select(ActivityEvent)
        .where(ActivityEvent.session_id == session_id)
        .order_by(ActivityEvent.occurred_at.asc())
    )
    result = await db.execute(statement)
    return list(result.scalars().all())


async def get_session_report(
    db: AsyncSession, session_id: str
) -> tuple[str, list[dict[str, str]], str]:
    session = await get_session_or_404(db, session_id)
    statement = select(MissionReport).where(MissionReport.session_id == session_id)
    result = await db.execute(statement)
    report = result.scalar_one_or_none()

    if report is None:
        started = session.created_at
        ended = datetime.now(UTC)
        date_range = f"{started.date().isoformat()} - {ended.date().isoformat()}"
        return date_range, [], "Mission report is not ready yet."

    stats_value = (
        report.report_data.get("stats", []) if isinstance(report.report_data, dict) else []
    )
    stats: list[dict[str, str]] = []
    for item in stats_value:
        if isinstance(item, dict) and "label" in item and "value" in item:
            stats.append({"label": str(item["label"]), "value": str(item["value"])})

    started = session.created_at
    ended = report.delivered_at or report.updated_at
    date_range = f"{started.date().isoformat()} - {ended.date().isoformat()}"
    return date_range, stats, report.summary


def get_connected_flag(status: str) -> bool | None:
    normalized = normalize_session_status(status)
    if normalized == "provisioning":
        return None
    return normalized in {"ready", "active", "completed"}
