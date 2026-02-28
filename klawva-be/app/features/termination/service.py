from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.activity.models import ActivityEvent
from app.features.emails.service import send_shift_ended_email
from app.features.provisioning.service import destroy_provisioning
from app.features.reports.models import MissionReport
from app.features.sessions.models import Session
from app.features.termination.models import TerminationJob


async def schedule_termination(db: AsyncSession, *, session_id: str) -> TerminationJob:
    session = await db.get(Session, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session_not_found")

    statement = select(TerminationJob).where(TerminationJob.session_id == session_id)
    result = await db.execute(statement)
    job = result.scalar_one_or_none()
    if job is not None:
        return job

    scheduled_for = datetime.now(UTC) + timedelta(hours=24)
    job = TerminationJob(session_id=session_id, status="scheduled", scheduled_for=scheduled_for)
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job


async def execute_due_terminations(db: AsyncSession) -> int:
    now = datetime.now(UTC)
    statement = select(TerminationJob).where(
        TerminationJob.status == "scheduled",
        TerminationJob.scheduled_for <= now,
    )
    result = await db.execute(statement)
    jobs = list(result.scalars().all())

    terminated_count = 0
    for job in jobs:
        session = await db.get(Session, job.session_id)
        if session is None:
            job.status = "missing_session"
            job.executed_at = now
            continue

        report_statement = select(MissionReport).where(MissionReport.session_id == session.id)
        report_result = await db.execute(report_statement)
        report = report_result.scalar_one_or_none()
        if report is None:
            report = MissionReport(
                session_id=session.id,
                summary="Shift complete",
                report_data={"stats": []},
                report_card_url=None,
                delivered_at=now,
            )
            db.add(report)

        await destroy_provisioning(db, session_id=session.id)

        session.status = "completed"
        session.completed_at = now
        job.status = "terminated"
        job.executed_at = now

        await send_shift_ended_email(db, session=session)

        db.add(
            ActivityEvent(
                session_id=session.id,
                event_type="mission_completed",
                payload={"text": "Session terminated and report dispatched"},
                occurred_at=now,
            )
        )
        terminated_count += 1

    await db.commit()
    return terminated_count
