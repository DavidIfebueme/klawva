from typing import Literal

from pydantic import BaseModel, Field


class CreateSessionPayload(BaseModel):
    agent_id: str = Field(alias="agentId")
    channel: Literal["whatsapp", "telegram"]
    brief: dict[str, str]
    payment_ref: str = Field(alias="paymentRef")


class CreateSessionResponse(BaseModel):
    session_id: str = Field(alias="sessionId")


class SessionStatusResponse(BaseModel):
    status: Literal["provisioning", "ready", "active", "completed"]
    connected: bool | None = None


class ActivityEntry(BaseModel):
    id: str
    timestamp: str
    text: str


class SessionActivityResponse(BaseModel):
    activities: list[ActivityEntry]


class StatEntry(BaseModel):
    label: str
    value: str


class SessionReportResponse(BaseModel):
    date_range: str = Field(alias="dateRange")
    stats: list[StatEntry]
    summary: str
