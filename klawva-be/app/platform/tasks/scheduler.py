import asyncio
import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.platform.db.session import SessionLocal

log = logging.getLogger(__name__)

_INTERVAL_SECONDS = 300


async def _process_pending_whatsapp_locks(db: AsyncSession) -> int:
    from app.features.activity.models import ActivityEvent
    from app.features.channels.models import ChannelLink
    from app.features.channels.service import _normalize_whatsapp_number, auto_lock_whatsapp
    from app.features.provisioning.agent_config import _agent_gateway_id
    from app.features.sessions.models import Session
    from app.platform.clients import openclaw_gateway

    stmt = (
        select(Session, ChannelLink)
        .join(ChannelLink, ChannelLink.session_id == Session.id)
        .where(Session.status == "provisioning")
        .where(ChannelLink.channel == "whatsapp")
        .where(ChannelLink.peer_id.is_(None))
    )
    result = await db.execute(stmt)
    rows = result.all()
    locked = 0
    for session, link in rows:
        agent_id = _agent_gateway_id(session.id)
        try:
            agent_state = openclaw_gateway.check_agent_sessions(agent_id)
        except Exception:
            continue
        if not agent_state.get("channel_connected") or not agent_state.get("peer_id"):
            continue

        detected_peer = agent_state["peer_id"]
        if session.agent_id == "vendor":
            vendor_number = _normalize_whatsapp_number(link.link_target)
            if vendor_number and detected_peer != vendor_number:
                log.warning(
                    "vendor whatsapp peer mismatch for session %s: expected %s got %s",
                    session.id,
                    vendor_number,
                    detected_peer,
                )
                continue
            lock_target = vendor_number or detected_peer
        else:
            lock_target = detected_peer

        try:
            await auto_lock_whatsapp(db, session.id, lock_target)
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
            log.exception("whatsapp auto-lock failed for session %s", session.id)
            await db.rollback()
    return locked


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
            agent_state = openclaw_gateway.check_agent_sessions(agent_id)
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
                telegram_locked = await _process_pending_telegram_locks(db)
                whatsapp_locked = await _process_pending_whatsapp_locks(db)
                log.info(
                    "Scheduler tick: auto-renewals + terminations processed, "
                    "%d shift emails sent, %d telegram locked, %d whatsapp locked",
                    sent,
                    telegram_locked,
                    whatsapp_locked,
                )
        except Exception:
            log.exception("Scheduler tick failed")