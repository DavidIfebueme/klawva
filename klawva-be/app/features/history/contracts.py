from datetime import datetime

from pydantic import BaseModel, Field


class RequestHistoryLinkPayload(BaseModel):
    email: str


class RequestHistoryLinkResponse(BaseModel):
    sent: bool


class HistorySessionItem(BaseModel):
    session_id: str = Field(alias="sessionId")
    agent_id: str = Field(alias="agentId")
    channel: str
    status: str
    started_at: datetime | None = Field(default=None, alias="startedAt")
    ends_at: datetime | None = Field(default=None, alias="endsAt")
    completed_at: datetime | None = Field(default=None, alias="completedAt")


class HistorySessionsResponse(BaseModel):
    sessions: list[HistorySessionItem]
