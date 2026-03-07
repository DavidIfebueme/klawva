import base64
import secrets
from typing import Literal
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.activity.models import ActivityEvent
from app.features.channels.models import ChannelLink
from app.features.sessions.models import Session
from app.platform.config import settings


def _parse_token_pool(raw_pool: str) -> list[str]:
    return [item.strip() for item in raw_pool.split(",") if item.strip()]


def _new_qr_payload(session_id: str) -> str:
    raw = f"{session_id}:{secrets.token_urlsafe(24)}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


async def _telegram_username_from_token(token: str) -> str | None:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"https://api.telegram.org/bot{token}/getMe")
        if response.status_code >= 400:
            return None
        payload = response.json()
        if not payload.get("ok"):
            return None
        result = payload.get("result", {})
        username = result.get("username")
        if isinstance(username, str) and username.strip():
            return username.strip()
    except Exception:
        return None
    return None


async def get_or_refresh_whatsapp_qr(db: AsyncSession, *, session_id: str) -> tuple[str, int]:
    session = await db.get(Session, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session_not_found")
    if session.channel != "whatsapp":
        raise HTTPException(status_code=409, detail="channel_not_whatsapp")

    statement = select(ChannelLink).where(ChannelLink.session_id == session_id)
    result = await db.execute(statement)
    link = result.scalar_one_or_none()

    if link is None:
        link = ChannelLink(
            session_id=session_id,
            channel="whatsapp",
            status="qr_ready",
            qr_payload=_new_qr_payload(session_id),
        )
        db.add(link)
        await db.commit()
        await db.refresh(link)
        return str(link.qr_payload), 60

    if link.channel != "whatsapp":
        raise HTTPException(status_code=409, detail="channel_link_mismatch")

    link.qr_payload = _new_qr_payload(session_id)
    link.status = "qr_ready"
    await db.commit()
    await db.refresh(link)
    return str(link.qr_payload), 60


async def assign_telegram_bot_token(db: AsyncSession, *, session_id: str) -> tuple[str, str | None]:
    session = await db.get(Session, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session_not_found")
    if session.agent_id == "vendor":
        raise HTTPException(status_code=409, detail="vendor_telegram_not_allowed")
    if session.channel != "telegram":
        raise HTTPException(status_code=409, detail="channel_not_telegram")

    statement = select(ChannelLink).where(ChannelLink.session_id == session_id)
    result = await db.execute(statement)
    existing = result.scalar_one_or_none()
    if existing is not None and existing.external_id:
        return existing.external_id, existing.link_target

    tokens = _parse_token_pool(settings.telegram_bot_token_pool)
    if not tokens:
        raise HTTPException(status_code=503, detail="telegram_token_pool_empty")

    in_use_statement = select(ChannelLink).where(ChannelLink.channel == "telegram")
    in_use_result = await db.execute(in_use_statement)
    in_use_links = list(in_use_result.scalars().all())
    in_use = {item.external_id for item in in_use_links if item.external_id}

    available = [token for token in tokens if token not in in_use]
    if not available:
        raise HTTPException(status_code=503, detail="telegram_token_pool_exhausted")

    assigned = available[0]
    bot_username = await _telegram_username_from_token(assigned)
    deep_link = f"https://t.me/{bot_username}?start={session_id}" if bot_username else None
    if existing is None:
        existing = ChannelLink(
            session_id=session_id,
            channel="telegram",
            status="assigned",
            external_id=assigned,
            link_target=deep_link,
            connected_at=datetime.now(UTC) + timedelta(seconds=0),
        )
        db.add(existing)
    else:
        existing.external_id = assigned
        existing.link_target = deep_link
        existing.status = "assigned"
        existing.connected_at = datetime.now(UTC)

    await db.commit()
    return assigned, deep_link


async def record_channel_onboarding_event(
    db: AsyncSession,
    *,
    session_id: str,
    channel: Literal["telegram", "whatsapp"],
    event_type: Literal["linked", "intro_sent", "report_sent", "terminated"],
    target: str | None,
    callback_event_id: str | None = None,
) -> ChannelLink:
    session = await db.get(Session, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session_not_found")

    statement = select(ChannelLink).where(ChannelLink.session_id == session_id)
    result = await db.execute(statement)
    link = result.scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=404, detail="channel_link_not_found")
    if link.channel != channel:
        raise HTTPException(status_code=409, detail="channel_link_mismatch")

    if callback_event_id:
        existing_callback_id: str | None
        if event_type == "linked":
            existing_callback_id = link.worker_link_callback_id
        elif event_type == "intro_sent":
            existing_callback_id = link.worker_intro_callback_id
        elif event_type == "report_sent":
            existing_callback_id = link.worker_report_callback_id
        else:
            existing_callback_id = link.worker_terminated_callback_id

        if existing_callback_id == callback_event_id:
            return link

    now = datetime.now(UTC)
    if target:
        link.link_target = target

    if event_type == "linked":
        link.status = "linked"
        link.connected_at = now
        if callback_event_id:
            link.worker_link_callback_id = callback_event_id
        text = f"{channel.capitalize()} channel connected"
    elif event_type == "intro_sent":
        link.status = "intro_sent"
        link.intro_sent_at = now
        if callback_event_id:
            link.worker_intro_callback_id = callback_event_id
        text = f"{channel.capitalize()} intro message sent"
    elif event_type == "report_sent":
        link.status = "report_sent"
        link.report_sent_at = now
        if callback_event_id:
            link.worker_report_callback_id = callback_event_id
        text = f"{channel.capitalize()} final report sent"
    else:
        link.status = "terminated"
        link.terminated_at = now
        if callback_event_id:
            link.worker_terminated_callback_id = callback_event_id
        text = f"{channel.capitalize()} channel session terminated"

    db.add(
        ActivityEvent(
            session_id=session_id,
            event_type=f"channel_{event_type}",
            payload={
                "text": text,
                "channel": channel,
                "target": target,
                "callback_event_id": callback_event_id,
            },
            occurred_at=now,
        )
    )
    await db.commit()
    await db.refresh(link)
    return link
