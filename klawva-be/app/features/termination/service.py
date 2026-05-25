from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.activity.models import ActivityEvent
from app.features.channels.models import ChannelLink
from app.features.emails.service import send_shift_ended_email
from app.features.provisioning.models import ProvisioningJob
from app.features.provisioning.service import _load_telegram_accounts_map, destroy_provisioning
from app.features.reports.models import MissionReport
from app.features.reports.service import _generate_share_token
from app.features.sessions.models import Session
from app.features.termination.models import TerminationJob
from app.platform.clients import openclaw_gateway
from app.platform.config import settings


async def _notify_telegram_employer(
    db: AsyncSession,
    session: Session,
    channel_link: ChannelLink | None,
) -> None:
    if session.channel != "telegram" or channel_link is None or not channel_link.external_id:
        return

    bot_token = channel_link.external_id

    pjob_stmt = select(ProvisioningJob).where(ProvisioningJob.session_id == session.id)
    result = await db.execute(pjob_stmt)
    pjob = result.scalar_one_or_none()
    if not pjob or not pjob.agent_id_in_gateway:
        return

    peer_id = openclaw_gateway.read_telegram_peer_id(pjob.agent_id_in_gateway)
    if not peer_id:
        return

    report_link = f"{settings.frontend_base_url}/report/{session.id}?agent={session.agent_id}"
    text = (
        "Your Klawva shift has ended. Thanks for hiring!\n\n"
        f"View your mission report: {report_link}"
    )
    await openclaw_gateway.send_telegram_message(bot_token, peer_id, text)


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
                share_token=_generate_share_token(),
                delivered_at=now,
            )
            db.add(report)

        channel_link_stmt = select(ChannelLink).where(ChannelLink.session_id == session.id)
        channel_link_result = await db.execute(channel_link_stmt)
        channel_link = channel_link_result.scalar_one_or_none()

        await _notify_telegram_employer(db, session, channel_link)

        await destroy_provisioning(db, session_id=session.id)

        if channel_link is not None:
            channel_link.status = "terminated"
            channel_link.terminated_at = now

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
