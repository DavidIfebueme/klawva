from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.provisioning.models import ProvisioningJob
from app.features.sessions.models import Session
from app.platform.clients.digitalocean import DigitalOceanClient
from app.platform.config import settings


async def start_provisioning(db: AsyncSession, *, session_id: str) -> ProvisioningJob:
    session = await db.get(Session, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session_not_found")

    statement = select(ProvisioningJob).where(ProvisioningJob.session_id == session_id)
    result = await db.execute(statement)
    job = result.scalar_one_or_none()

    if job is None:
        job = ProvisioningJob(session_id=session_id, status="provisioning", attempt_count=0)
        db.add(job)
        await db.commit()
        await db.refresh(job)
    elif job.status == "active" and job.droplet_id:
        if session.status != "ready":
            session.status = "ready"
            await db.commit()
        return job

    if job.attempt_count >= settings.provisioning_max_retries and job.status != "active":
        raise HTTPException(status_code=409, detail="provisioning_retry_exhausted")

    job.status = "provisioning"
    job.error_message = None

    client = DigitalOceanClient()
    try:
        created = await client.create_openclaw_droplet(session_id=session_id)
    except Exception as exc:
        job.attempt_count = int(job.attempt_count or 0) + 1
        job.status = "failed"
        job.error_message = str(exc)
        await db.commit()
        await db.refresh(job)
        raise HTTPException(status_code=502, detail="provisioning_failed") from exc

    job.attempt_count += 1
    job.status = "active"
    job.droplet_id = created.droplet_id
    job.error_message = None
    session.status = "ready"
    await db.commit()
    await db.refresh(job)
    return job


async def destroy_provisioning(db: AsyncSession, *, session_id: str) -> bool:
    statement = select(ProvisioningJob).where(ProvisioningJob.session_id == session_id)
    result = await db.execute(statement)
    job = result.scalar_one_or_none()
    if job is None or not job.droplet_id:
        return False

    client = DigitalOceanClient()
    try:
        await client.destroy_droplet(droplet_id=job.droplet_id)
    except Exception as exc:
        job.status = "destroy_failed"
        job.error_message = str(exc)
        await db.commit()
        raise HTTPException(status_code=502, detail="destroy_failed") from exc

    job.status = "destroyed"
    job.error_message = None
    await db.commit()
    return True
