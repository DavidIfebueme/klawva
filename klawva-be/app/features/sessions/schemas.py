from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SessionSchema(BaseModel):
    id: str
    agent_id: str
    channel: str
    brief: dict
    payment_ref: str | None
    status: str
    started_at: datetime | None
    expires_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
