from datetime import datetime

from pydantic import BaseModel, ConfigDict


class EmailEventSchema(BaseModel):
    id: str
    session_id: str | None
    email_type: str
    to_email: str
    subject: str
    status: str
    provider_message_id: str | None
    error_message: str | None
    sent_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
