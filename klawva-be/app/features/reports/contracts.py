from datetime import datetime

from pydantic import BaseModel, Field


class UpsertMissionReportRequest(BaseModel):
    session_id: str = Field(alias="sessionId")
    summary: str
    report_data: dict = Field(alias="reportData")
    report_card_url: str | None = Field(default=None, alias="reportCardUrl")


class MissionReportResponse(BaseModel):
    session_id: str = Field(alias="sessionId")
    summary: str
    report_data: dict = Field(alias="reportData")
    report_card_url: str | None = Field(default=None, alias="reportCardUrl")
    delivered_at: datetime | None = Field(default=None, alias="deliveredAt")
