import json
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.channels.models import ChannelLink
from app.features.provisioning.agent_config import (
    _agent_gateway_id,
    build_agent_fragment,
)
from app.features.provisioning.models import ProvisioningJob
from app.features.provisioning.workspace import create_agent_workspace, delete_agent_workspace
from app.features.sessions.models import Session
from app.platform.clients import openclaw_gateway
from app.platform.config import settings


def _load_telegram_accounts_map() -> dict[str, str]:
    map_path = Path(settings.telegram_accounts_map_path)
    if not map_path.exists():
        return {}
    try:
        data = json.loads(map_path.read_text(encoding="utf-8"))
        return dict(data) if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def _resolve_channel_binding(
    session: Session,
    channel_link: ChannelLink | None,
) -> tuple[str, str, dict | None]:
    if session.channel == "telegram" and channel_link is not None and channel_link.external_id:
        token = channel_link.external_id
        accounts_map = _load_telegram_accounts_map()
        account_id = accounts_map.get(token, "")
        if not account_id:
            return "telegram", "", None
        return "telegram", account_id, None

    if session.channel == "whatsapp" and channel_link is not None and channel_link.external_id:
        account_id = channel_link.external_id
        account_config = {"enabled": True}
        return "whatsapp", account_id, account_config

    return "", "", None


async def start_provisioning(
    db: AsyncSession,
    *,
    session_id: str,
    channel_link: ChannelLink | None = None,
    whatsapp_account: str | None = None,
) -> ProvisioningJob:
    session = await db.get(Session, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session_not_found")

    statement = select(ProvisioningJob).where(ProvisioningJob.session_id == session_id)
    result = await db.execute(statement)
    existing = result.scalar_one_or_none()

    if existing is not None:
        if existing.status == "active" and existing.agent_id_in_gateway:
            return existing

    agent_id = _agent_gateway_id(session_id)

    try:
        agent_fragment = build_agent_fragment(session)

        create_agent_workspace(session)

        channel_type, account_id, account_config = _resolve_channel_binding(session, channel_link)

        config = await openclaw_gateway.read_config()
        config = openclaw_gateway.add_agent_to_config(
            config,
            agent_fragment,
            channel_type=channel_type or None,
            account_id=account_id or None,
            account_config=account_config,
        )
        openclaw_gateway.write_config(config)

        if channel_type and account_id:
            openclaw_gateway.restart_gateway()
    except Exception as exc:
        if existing is not None:
            existing.attempt_count += 1
            existing.status = "failed"
            existing.error_message = str(exc)[:500]
            await db.flush()
        raise HTTPException(status_code=502, detail="provisioning_failed") from exc

    if existing is not None:
        existing.status = "active"
        existing.agent_id_in_gateway = agent_id
        existing.attempt_count += 1
        existing.error_message = None
        job = existing
    else:
        job = ProvisioningJob(
            session_id=session_id,
            status="active",
            attempt_count=1,
            agent_id_in_gateway=agent_id,
        )
        db.add(job)

    session.status = "ready"
    await db.commit()
    return job


async def destroy_provisioning(db: AsyncSession, *, session_id: str) -> bool:
    statement = select(ProvisioningJob).where(ProvisioningJob.session_id == session_id)
    result = await db.execute(statement)
    job = result.scalar_one_or_none()
    if job is None or not job.agent_id_in_gateway:
        return False

    agent_id = job.agent_id_in_gateway

    stmt = select(ChannelLink).where(ChannelLink.session_id == session_id)
    link_result = await db.execute(stmt)
    channel_link = link_result.scalar_one_or_none()

    session = await db.get(Session, session_id)
    channel_type = session.channel if session else ""
    account_id = ""
    if channel_link and channel_link.external_id:
        if channel_type == "telegram":
            accounts_map = _load_telegram_accounts_map()
            account_id = accounts_map.get(channel_link.external_id, "")
        elif channel_type == "whatsapp":
            account_id = channel_link.external_id

    try:
        config = await openclaw_gateway.read_config()
        config = openclaw_gateway.remove_agent_from_config(
            config,
            agent_id,
            channel_type=channel_type or None,
            account_id=account_id or None,
        )
        if channel_type == "telegram" and account_id:
            config = openclaw_gateway.reset_telegram_account_access(config, account_id)
        openclaw_gateway.write_config(config)

        if channel_type:
            openclaw_gateway.restart_gateway()
    except Exception:
        pass

    delete_agent_workspace(session_id)

    job.status = "destroyed"
    await db.flush()
    return True
