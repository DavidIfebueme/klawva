from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ProvisioningJobSchema(BaseModel):
    id: str
    session_id: str
    status: str
    attempt_count: int
    droplet_id: str | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
