from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.provisioning.models import ProvisioningJob
from app.features.provisioning.pool import assign_droplet_from_pool, release_session_from_pool
from app.features.sessions.models import Session
from app.platform.config import settings


async def start_provisioning(
    db: AsyncSession,
    *,
    session_id: str,
    session_config: dict,
) -> ProvisioningJob:
    session = await db.get(Session, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session_not_found")

    statement = select(ProvisioningJob).where(ProvisioningJob.session_id == session_id)
    result = await db.execute(statement)
    existing = result.scalar_one_or_none()

    if existing is not None:
        if existing.status == "active" and existing.droplet_id:
            return existing
        if (
            existing.attempt_count >= settings.provisioning_max_retries
            and existing.status != "active"
        ):
            raise HTTPException(status_code=409, detail="provisioning_retry_exhausted")

    try:
        job = await assign_droplet_from_pool(
            db,
            session_config=session_config,
            session_id=session_id,
        )
    except HTTPException:
        raise
    except Exception as exc:
        if existing is not None:
            existing.attempt_count += 1
            existing.status = "failed"
            existing.error_message = str(exc)
            await db.flush()
        raise HTTPException(status_code=502, detail="provisioning_failed") from exc

    session.status = "ready"
    await db.commit()
    return job


async def destroy_provisioning(db: AsyncSession, *, session_id: str) -> bool:
    result = await release_session_from_pool(db, session_id=session_id)
    await db.commit()
    return result
