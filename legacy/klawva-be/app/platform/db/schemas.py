from datetime import datetime

from pydantic import BaseModel, ConfigDict


class IdempotencyKeySchema(BaseModel):
    id: str
    scope: str
    key: str
    request_hash: str
    response_json: dict
    status_code: int
    expires_at: datetime
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
