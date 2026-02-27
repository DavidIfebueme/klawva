from datetime import datetime

from pydantic import BaseModel, ConfigDict


class PaymentSchema(BaseModel):
    id: str
    session_id: str
    provider: str
    provider_reference: str
    amount_minor: int
    currency: str
    status: str
    confirmed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
