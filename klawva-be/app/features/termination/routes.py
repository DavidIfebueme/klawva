from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.termination.contracts import (
    ExecuteDueTerminationResponse,
    ScheduleTerminationRequest,
    TerminationJobResponse,
)
from app.features.termination.service import (
    execute_due_terminations,
    schedule_termination,
    process_upcoming_auto_renewals,
)
from app.platform.db.session import get_async_session

router = APIRouter(prefix="/api/termination", tags=["termination"])


@router.post("/schedule", response_model=TerminationJobResponse)
async def schedule_termination_endpoint(
    payload: ScheduleTerminationRequest,
    db: AsyncSession = Depends(get_async_session),
) -> TerminationJobResponse:
    job = await schedule_termination(db, session_id=payload.session_id)
    return TerminationJobResponse(
        sessionId=job.session_id,
        status=job.status,
        scheduledFor=job.scheduled_for,
        executedAt=job.executed_at,
    )


@router.post("/execute-due", response_model=ExecuteDueTerminationResponse)
async def execute_due_termination_endpoint(
    db: AsyncSession = Depends(get_async_session),
) -> ExecuteDueTerminationResponse:
    await process_upcoming_auto_renewals(db)
    terminated = await execute_due_terminations(db)
    return ExecuteDueTerminationResponse(terminated=terminated)
