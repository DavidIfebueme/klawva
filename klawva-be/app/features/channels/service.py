import base64
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.channels.models import ChannelLink
from app.features.sessions.models import Session
from app.platform.config import settings


def _parse_token_pool(raw_pool: str) -> list[str]:
    return [item.strip() for item in raw_pool.split(",") if item.strip()]


def _new_qr_payload(session_id: str) -> str:
    raw = f"{session_id}:{secrets.token_urlsafe(24)}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


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


async def assign_telegram_bot_token(db: AsyncSession, *, session_id: str) -> str:
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
        return existing.external_id

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
    if existing is None:
        existing = ChannelLink(
            session_id=session_id,
            channel="telegram",
            status="assigned",
            external_id=assigned,
            connected_at=datetime.now(UTC) + timedelta(seconds=0),
        )
        db.add(existing)
    else:
        existing.external_id = assigned
        existing.status = "assigned"
        existing.connected_at = datetime.now(UTC)

    await db.commit()
    return assigned
