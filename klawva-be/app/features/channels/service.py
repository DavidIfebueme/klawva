import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

import httpx
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.activity.models import ActivityEvent
from app.features.channels.models import ChannelLink
from app.features.provisioning.service import _load_telegram_accounts_map
from app.features.sessions.models import Session
from app.platform.clients import openclaw_gateway
from app.platform.config import settings


def _parse_token_pool(raw_pool: str) -> list[str]:
    return [item.strip() for item in raw_pool.split(",") if item.strip()]


def _parse_account_pool(raw_pool: str) -> list[str]:
    return [item.strip() for item in raw_pool.split(",") if item.strip()]


def _load_whatsapp_numbers_map() -> dict[str, str]:
    map_path = Path(settings.whatsapp_numbers_map_path)
    if not map_path.exists():
        return {}
    try:
        data = json.loads(map_path.read_text(encoding="utf-8"))
        return dict(data) if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


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


async def get_vendor_whatsapp_qr(db: AsyncSession, *, session_id: str) -> tuple[str, int]:
    session = await db.get(Session, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session_not_found")
    if session.channel != "whatsapp":
        raise HTTPException(status_code=409, detail="channel_not_whatsapp")
    if session.agent_id != "vendor":
        raise HTTPException(status_code=409, detail="vendor_qr_requires_vendor_agent")

    account_id = f"vendor-{session_id[:8]}"

    statement = select(ChannelLink).where(ChannelLink.session_id == session_id)
    result = await db.execute(statement)
    link = result.scalar_one_or_none()

    if link is None:
        link = ChannelLink(
            session_id=session_id,
            channel="whatsapp",
            status="qr_pending",
            external_id=account_id,
        )
        db.add(link)
        await db.commit()
        await db.refresh(link)

    try:
        qr_data, expires_in = await openclaw_gateway.get_whatsapp_qr(account_id=account_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="whatsapp_qr_unavailable") from exc

    link.qr_payload = qr_data
    link.status = "qr_ready"
    await db.commit()

    return qr_data, expires_in


async def assign_klawva_whatsapp_number(db: AsyncSession, *, session_id: str) -> tuple[str, str]:
    session = await db.get(Session, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session_not_found")
    if session.channel != "whatsapp":
        raise HTTPException(status_code=409, detail="channel_not_whatsapp")
    if session.agent_id == "vendor":
        raise HTTPException(status_code=409, detail="vendor_uses_own_number")

    statement = select(ChannelLink).where(ChannelLink.session_id == session_id)
    result = await db.execute(statement)
    existing = result.scalar_one_or_none()
    if existing is not None and existing.external_id and existing.link_target:
        numbers_map = _load_whatsapp_numbers_map()
        phone = numbers_map.get(existing.external_id, existing.external_id)
        wa_link = existing.link_target
        return phone, wa_link

    accounts = _parse_account_pool(settings.whatsapp_klawva_account_pool)
    if not accounts:
        raise HTTPException(status_code=503, detail="whatsapp_account_pool_empty")

    in_use_statement = (
        select(ChannelLink.external_id)
        .join(Session, Session.id == ChannelLink.session_id)
        .where(ChannelLink.channel == "whatsapp")
        .where(ChannelLink.external_id.is_not(None))
        .where(Session.completed_at.is_(None))
    )
    in_use_result = await db.execute(in_use_statement)
    in_use = {item for item in in_use_result.scalars().all() if item}

    available = [acct for acct in accounts if acct not in in_use]
    if not available:
        raise HTTPException(status_code=503, detail="whatsapp_account_pool_exhausted")

    assigned_account = available[0]
    numbers_map = _load_whatsapp_numbers_map()
    phone_number = numbers_map.get(assigned_account, assigned_account)
    wa_link = f"https://wa.me/{phone_number.lstrip('+')}?text={session_id}"

    now = datetime.now(UTC)
    if existing is None:
        existing = ChannelLink(
            session_id=session_id,
            channel="whatsapp",
            status="assigned",
            external_id=assigned_account,
            link_target=wa_link,
            connected_at=now,
        )
        db.add(existing)
    else:
        existing.external_id = assigned_account
        existing.link_target = wa_link
        existing.status = "assigned"
        existing.connected_at = now

    await db.commit()
    return phone_number, wa_link


async def assign_telegram_bot_token(db: AsyncSession, *, session_id: str) -> tuple[str, str | None]:
    session = await db.get(Session, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session_not_found")
    if session.channel != "telegram":
        raise HTTPException(status_code=409, detail="channel_not_telegram")
    if session.agent_id == "vendor":
        raise HTTPException(status_code=409, detail="vendor_telegram_not_allowed")

    statement = select(ChannelLink).where(ChannelLink.session_id == session_id)
    result = await db.execute(statement)
    existing = result.scalar_one_or_none()
    if existing is not None and existing.external_id:
        return existing.external_id, existing.link_target

    tokens = _parse_token_pool(settings.telegram_bot_token_pool)
    if not tokens:
        raise HTTPException(status_code=503, detail="telegram_token_pool_empty")

    in_use_statement = (
        select(ChannelLink.external_id)
        .join(Session, Session.id == ChannelLink.session_id)
        .where(ChannelLink.channel == "telegram")
        .where(ChannelLink.external_id.is_not(None))
        .where(Session.completed_at.is_(None))
    )
    in_use_result = await db.execute(in_use_statement)
    in_use = {item for item in in_use_result.scalars().all() if item}

    available = [token for token in tokens if token not in in_use]
    if not available:
        raise HTTPException(status_code=503, detail="telegram_token_pool_exhausted")

    assigned = available[0]
    bot_username = await _telegram_username_from_token(assigned)
    deep_link = f"https://t.me/{bot_username}?start={session_id}" if bot_username else None
    now = datetime.now(UTC)
    if existing is None:
        existing = ChannelLink(
            session_id=session_id,
            channel="telegram",
            status="assigned",
            external_id=assigned,
            link_target=deep_link,
            connected_at=now,
        )
        db.add(existing)
    else:
        existing.external_id = assigned
        existing.link_target = deep_link
        existing.status = "assigned"
        existing.connected_at = now

    await db.commit()
    return assigned, deep_link


async def auto_lock_telegram(db: AsyncSession, session_id: str, telegram_user_id: str) -> bool:
    stmt = select(ChannelLink).where(ChannelLink.session_id == session_id)
    link = (await db.execute(stmt)).scalar_one_or_none()
    if not link or not link.external_id:
        return False
    accounts_map = _load_telegram_accounts_map()
    account_id = accounts_map.get(link.external_id, "")
    if not account_id:
        return False
    config = await openclaw_gateway.read_config()
    config = openclaw_gateway.lock_telegram_account(config, account_id, telegram_user_id)
    openclaw_gateway.write_config(config)
    openclaw_gateway.restart_gateway()
    link.peer_id = telegram_user_id
    db.add(link)
    return True


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
