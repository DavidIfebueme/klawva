from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.provisioning.contracts import (
    DestroyProvisioningRequest,
    DestroyProvisioningResponse,
    ProvisioningResponse,
    StartProvisioningRequest,
)
from app.features.provisioning.service import destroy_provisioning, start_provisioning
from app.platform.db.session import get_async_session

router = APIRouter(prefix="/api/provisioning", tags=["provisioning"])


@router.post("/start", response_model=ProvisioningResponse)
async def start_provisioning_endpoint(
    payload: StartProvisioningRequest,
    db: AsyncSession = Depends(get_async_session),
) -> ProvisioningResponse:
    job = await start_provisioning(db, session_id=payload.session_id)
    return ProvisioningResponse(
        jobId=job.id,
        status=job.status,
        agentIdInGateway=job.agent_id_in_gateway,
        attemptCount=job.attempt_count,
    )


@router.post("/destroy", response_model=DestroyProvisioningResponse)
async def destroy_provisioning_endpoint(
    payload: DestroyProvisioningRequest,
    db: AsyncSession = Depends(get_async_session),
) -> DestroyProvisioningResponse:
    destroyed = await destroy_provisioning(db, session_id=payload.session_id)
    return DestroyProvisioningResponse(destroyed=destroyed)
