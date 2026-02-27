from datetime import datetime

from pydantic import BaseModel, ConfigDict


class TerminationJobSchema(BaseModel):
    id: str
    session_id: str
    status: str
    scheduled_for: datetime
    executed_at: datetime | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
