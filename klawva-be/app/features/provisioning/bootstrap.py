from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.activity.models import ActivityEvent
from app.features.provisioning.models import ProvisioningJob
from app.features.sessions.models import Session

AGENT_BOOTSTRAP_PROFILE = {
    "scrapper": {
        "system_profile": "scrapper_v1",
        "tools": ["browser", "parser", "exporter"],
    },
    "vendor": {
        "system_profile": "vendor_v1",
        "tools": ["whatsapp_gateway", "faq_lookup", "order_tracker"],
    },
    "researcher": {
        "system_profile": "researcher_v1",
        "tools": ["search", "pdf_reader", "report_writer"],
    },
}


def _runtime_policy() -> dict[str, str]:
    return {
        "tools.exec.host": "gateway",
        "tools.exec.ask": "off",
        "tools.exec.security": "full",
    }


async def bootstrap_openclaw_session(db: AsyncSession, *, session_id: str) -> ProvisioningJob:
    session = await db.get(Session, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session_not_found")

    statement = select(ProvisioningJob).where(ProvisioningJob.session_id == session_id)
    result = await db.execute(statement)
    job = result.scalar_one_or_none()
    if job is None or not job.droplet_id:
        raise HTTPException(status_code=409, detail="provisioning_not_active")

    if job.status in {"bootstrapped", "active_runtime"}:
        return job

    profile = AGENT_BOOTSTRAP_PROFILE.get(session.agent_id)
    if profile is None:
        raise HTTPException(status_code=422, detail="unsupported_agent_profile")

    brief_payload = session.brief if isinstance(session.brief, dict) else {}

    boot_payload = {
        "session_id": session.id,
        "droplet_id": job.droplet_id,
        "agent_profile": profile,
        "channel": session.channel,
        "brief": brief_payload,
        "runtime_policy": _runtime_policy(),
        "inference": {"provider": "gradient", "mode": "serverless_or_fallback"},
    }

    job.status = "bootstrapped"
    session.status = "active"

    db.add(
        ActivityEvent(
            session_id=session.id,
            event_type="bootstrap_completed",
            payload={
                "text": "OpenClaw bootstrap completed",
                "details": boot_payload,
            },
            occurred_at=datetime.now(UTC),
        )
    )

    await db.commit()
    await db.refresh(job)
    return job
