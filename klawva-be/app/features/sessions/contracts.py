from typing import Literal

from pydantic import BaseModel, Field


class CreateSessionPayload(BaseModel):
    agent_id: str = Field(alias="agentId")
    channel: Literal["whatsapp", "telegram"]
    brief: dict[str, str]
    payment_ref: str = Field(alias="paymentRef")


class CreateSessionResponse(BaseModel):
    session_id: str = Field(alias="sessionId")
    session_token: str = Field(alias="sessionToken")


class ActivateSessionResponse(BaseModel):
    status: str
    started_at: str | None = Field(default=None, alias="startedAt")
    ends_at: str | None = Field(default=None, alias="endsAt")
    qr: str | None = None
    expires_in: int | None = Field(default=None, alias="expiresIn")
    telegram_token: str | None = Field(default=None, alias="telegramToken")
    telegram_deep_link: str | None = Field(default=None, alias="telegramDeepLink")


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
