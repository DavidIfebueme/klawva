from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ActivityEventSchema(BaseModel):
    id: str
    session_id: str
    event_type: str
    payload: dict
    occurred_at: datetime
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
