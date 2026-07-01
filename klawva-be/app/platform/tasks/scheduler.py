import asyncio
import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.platform.db.session import SessionLocal

log = logging.getLogger(__name__)

_INTERVAL_SECONDS = 300


async def _process_pending_telegram_pairings(db: AsyncSession) -> int:
    from app.features.channels.models import ChannelLink
    from app.features.provisioning.service import _load_telegram_accounts_map
    from app.features.sessions.models import Session
    from app.platform.clients import openclaw_gateway

    stmt = (
        select(Session, ChannelLink)
        .join(ChannelLink, ChannelLink.session_id == Session.id)
        .where(Session.status == "provisioning")
        .where(ChannelLink.channel == "telegram")
        .where(ChannelLink.peer_id.is_(None))
    )
    result = await db.execute(stmt)
    rows = result.all()
    approved = 0
    accounts_map = _load_telegram_accounts_map()
    for _session, link in rows:
        if not link.external_id:
            continue
        account_id = accounts_map.get(link.external_id, "")
        if not account_id:
            continue
        pending = openclaw_gateway.read_pending_telegram_pairings(account_id=account_id)
        for pairing in pending:
            code = pairing.get("code", "")
            if not code:
                continue
            ok = openclaw_gateway.approve_telegram_pairing(code)
            if ok:
                approved += 1
            log.info(
                "auto-approved pairing %s for account %s: %s",
                code,
                account_id,
                ok,
            )
    return approved


async def _process_pending_telegram_locks(db: AsyncSession) -> int:
    from app.features.activity.models import ActivityEvent
    from app.features.channels.models import ChannelLink
    from app.features.channels.service import auto_lock_telegram
    from app.features.provisioning.agent_config import _agent_gateway_id
    from app.features.sessions.models import Session
    from app.platform.clients import openclaw_gateway

    stmt = (
        select(Session, ChannelLink)
        .join(ChannelLink, ChannelLink.session_id == Session.id)
        .where(Session.status == "provisioning")
        .where(ChannelLink.channel == "telegram")
        .where(ChannelLink.peer_id.is_(None))
    )
    result = await db.execute(stmt)
    rows = result.all()
    locked = 0
    for session, _link in rows:
        agent_id = _agent_gateway_id(session.id)
        try:
            agent_state = openclaw_gateway.check_agent_sessions(
                agent_id, expected_session_id=session.id
            )
        except Exception:
            continue
        if not agent_state.get("channel_connected") or not agent_state.get("peer_id"):
            continue
        try:
            await auto_lock_telegram(db, session.id, agent_state["peer_id"])
            session.status = "active"
            db.add(
                ActivityEvent(
                    session_id=session.id,
                    event_type="channel_connected",
                    payload={
                        "text": "channel connected",
                        "provider": agent_state.get("provider", ""),
                    },
                    occurred_at=datetime.now(UTC),
                )
            )
            if agent_state.get("intro_sent"):
                db.add(
                    ActivityEvent(
                        session_id=session.id,
                        event_type="intro_sent",
                        payload={"text": "intro message sent"},
                        occurred_at=datetime.now(UTC),
                    )
                )
            await db.commit()
            locked += 1
        except Exception:
            log.exception("telegram auto-lock failed for session %s", session.id)
            await db.rollback()
    return locked


async def _scheduler_loop() -> None:
    while True:
        await asyncio.sleep(_INTERVAL_SECONDS)
        try:
            from app.features.emails.service import dispatch_due_shift_emails
            from app.features.termination.service import (
                execute_due_terminations,
                process_upcoming_auto_renewals,
            )

            async with SessionLocal() as db:
                await process_upcoming_auto_renewals(db)
                await execute_due_terminations(db)
                sent = await dispatch_due_shift_emails(db)
                pairings_approved = await _process_pending_telegram_pairings(db)
                telegram_locked = await _process_pending_telegram_locks(db)
                log.info(
                    "Scheduler tick: auto-renewals + terminations processed, "
                    "%d shift emails sent, %d pairings approved, %d telegram sessions locked",
                    sent,
                    pairings_approved,
                    telegram_locked,
                )
        except Exception:
            log.exception("Scheduler tick failed")