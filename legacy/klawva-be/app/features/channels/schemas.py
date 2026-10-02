from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ChannelLinkSchema(BaseModel):
    id: str
    session_id: str
    channel: str
    external_id: str | None
    qr_payload: str | None
    status: str
    connected_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
