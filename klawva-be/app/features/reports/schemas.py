from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MissionReportSchema(BaseModel):
    id: str
    session_id: str
    summary: str
    report_data: dict
    report_card_url: str | None
    delivered_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
