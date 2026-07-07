from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
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
    share_token: str | None = None,
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
    if share_token:
        report_link += f"&shareToken={share_token}"
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
            summary = "Shift complete"
            report_data: dict = {"stats": []}

            pjob_stmt = select(ProvisioningJob).where(ProvisioningJob.session_id == session.id)
            pjob_result = await db.execute(pjob_stmt)
            pjob = pjob_result.scalar_one_or_none()
            if pjob and pjob.agent_id_in_gateway:
                agent_summary = openclaw_gateway.read_agent_summary(pjob.agent_id_in_gateway)
                if agent_summary:
                    summary = agent_summary

            report = MissionReport(
                session_id=session.id,
                summary=summary,
                report_data=report_data,
                report_card_url=None,
                share_token=_generate_share_token(),
                delivered_at=now,
            )
            db.add(report)

        channel_link_stmt = select(ChannelLink).where(ChannelLink.session_id == session.id)
        channel_link_result = await db.execute(channel_link_stmt)
        channel_link = channel_link_result.scalar_one_or_none()

        await _notify_telegram_employer(db, session, channel_link, share_token=report.share_token)

        await destroy_provisioning(db, session_id=session.id)

        if channel_link is not None:
            channel_link.status = "terminated"
            channel_link.terminated_at = now

        session.status = "completed"
        session.completed_at = now
        job.status = "terminated"
        job.executed_at = now

        report_url = f"{settings.frontend_base_url}/report/{session.id}?agent={session.agent_id}"
        if report.share_token:
            report_url += f"&shareToken={report.share_token}"
        await send_shift_ended_email(db, session=session, report_url=report_url)

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


async def check_if_already_warned(db: AsyncSession, session_id: str) -> bool:
    stmt = select(ActivityEvent).where(
        ActivityEvent.session_id == session_id,
        ActivityEvent.event_type == "insufficient_balance_warning",
    )
    res = await db.execute(stmt)
    return res.scalar_one_or_none() is not None


async def record_warning_event(db: AsyncSession, session_id: str) -> None:
    db.add(
        ActivityEvent(
            session_id=session_id,
            event_type="insufficient_balance_warning",
            payload={
                "text": "Warning: Insufficient wallet balance to auto-renew shift. Extension failed."
            },
            occurred_at=datetime.now(UTC),
        )
    )
    await db.flush()


async def process_upcoming_auto_renewals(db: AsyncSession) -> None:
    """Find active sessions expiring in less than 2 hours and extend them if auto_renew is active and funded."""
    now = datetime.now(UTC)
    two_hours_from_now = now + timedelta(hours=2)

    statement = select(Session).where(
        Session.status == "active",
        Session.auto_renew == True,
        Session.expires_at <= two_hours_from_now,
        Session.expires_at > now,
    )
    result = await db.execute(statement)
    sessions = result.scalars().all()

    for session in sessions:
        await _attempt_session_extension(db, session)

    await db.commit()


async def _attempt_session_extension(db: AsyncSession, session: Session) -> None:
    """Checks wallet balance and extends session expires_at and termination job scheduled_for by 24 hours."""
    from app.features.emails.service import _render_template
    from app.features.payments.billing import resolve_billing_profile_from_country
    from app.features.payments.models import Wallet, WalletTransaction
    from app.features.users.models import User
    from app.platform.email.service import send_transactional_email

    if not session.user_id:
        return

    user = await db.get(User, session.user_id)
    if not user:
        return

    stmt = select(Wallet).where(Wallet.user_id == user.id)
    res = await db.execute(stmt)
    wallet = res.scalar_one_or_none()
    if not wallet:
        return

    billing = resolve_billing_profile_from_country("NG")
    agent_cost = billing.amount_minor

    from app.features.payments.wallet_service import debit_wallet, get_wallet_balance

    expiry_window = session.expires_at.strftime("%Y%m%dT%H") if session.expires_at else "unknown"
    debit_ref = f"auto_renew:{session.id}:{expiry_window}"

    if wallet.balance_minor < agent_cost:
        already_warned = await check_if_already_warned(db, session.id)
        if not already_warned:
            subject = f"Action Required: Insufficient balance to auto-renew {session.agent_id.capitalize()} shift"
            body = (
                f"Your Klawva worker (<strong>{session.agent_id.capitalize()}</strong>) is set to expire in 2 hours, "
                f"but your wallet balance (₦{wallet.balance_minor / 100:.2f}) is insufficient to cover the renewal cost "
                f"(₦{agent_cost / 100:.2f}).<br/><br/>"
                "Please fund your virtual account to prevent your worker from terminating."
            )
            html = _render_template(
                title="Insufficient balance to auto-renew shift",
                body=body,
                cta_label="Fund Wallet",
                cta_href=f"{settings.frontend_base_url}/dashboard/wallet",
            )
            text = f"Action Required: Insufficient balance to auto-renew your Klawva worker shift. Please fund your wallet."
            try:
                await send_transactional_email(
                    to_email=user.email,
                    subject=subject,
                    text_body=text,
                    html_body=html,
                )
            except Exception:
                logger = logging.getLogger(__name__)
                logger.error(
                    "Failed to send insufficient balance email to %s", user.email, exc_info=True
                )
            await record_warning_event(db, session.id)
        return

    tx = await debit_wallet(
        db,
        wallet_id=wallet.id,
        amount_minor=agent_cost,
        reference=debit_ref,
        description=f"Auto-renewal extension: {session.agent_id} (24h)",
        source="auto_reprovision",
    )
    if tx is None:
        return

    session.expires_at += timedelta(hours=24)

    term_job_stmt = select(TerminationJob).where(TerminationJob.session_id == session.id)
    term_job_res = await db.execute(term_job_stmt)
    term_job = term_job_res.scalar_one_or_none()
    if term_job:
        term_job.scheduled_for += timedelta(hours=24)

    db.add(
        ActivityEvent(
            session_id=session.id,
            event_type="session_extended",
            payload={"text": "Session extended by 24 hours (Zero Downtime Auto-Renewal)"},
            occurred_at=datetime.now(UTC),
        )
    )

    remaining_balance = await get_wallet_balance(db, wallet_id=wallet.id)
    subject = f"Your Klawva worker shift has been extended"
    expiry_formatted = session.expires_at.astimezone(UTC).strftime("%Y-%m-%d %H:%M UTC")
    body = (
        f"Your Klawva worker (<strong>{session.agent_id.capitalize()}</strong>) shift has been successfully "
        f"extended by 24 hours via auto-renewal.<br/>"
        f"New shift expiration: <strong>{expiry_formatted}</strong><br/>"
        f"Balance remaining: <strong>₦{remaining_balance / 100:.2f}</strong>"
    )
    html = _render_template(
        title="Worker shift extended",
        body=body,
        cta_label="View Dashboard",
        cta_href=f"{settings.frontend_base_url}/dashboard",
    )
    text = f"Your Klawva worker shift has been extended by 24 hours. New expiration: {expiry_formatted}."
    try:
        await send_transactional_email(
            to_email=user.email,
            subject=subject,
            text_body=text,
            html_body=html,
        )
    except Exception:
        logger = logging.getLogger(__name__)
        logger.error("Failed to send auto-renewal extension email to %s", user.email, exc_info=True)
