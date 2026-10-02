from datetime import datetime

from pydantic import BaseModel, Field


class ScheduleTerminationRequest(BaseModel):
    session_id: str = Field(alias="sessionId")


class TerminationJobResponse(BaseModel):
    session_id: str = Field(alias="sessionId")
    status: str
    scheduled_for: datetime = Field(alias="scheduledFor")
    executed_at: datetime | None = Field(default=None, alias="executedAt")


class ExecuteDueTerminationResponse(BaseModel):
    terminated: int
