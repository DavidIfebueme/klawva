from pydantic import BaseModel, Field


class SessionUpsertResponse(BaseModel):
    session_id: str = Field(alias="sessionId")
    accepted: bool
    channel: str


class SessionDeleteResponse(BaseModel):
    session_id: str = Field(alias="sessionId")
    removed: bool


class BridgeHealthResponse(BaseModel):
    ok: bool
    sessions: int


class WhatsAppEventRequest(BaseModel):
    session_id: str = Field(alias="sessionId")
    event_type: str = Field(alias="eventType")
    target: str | None = None
    callback_event_id: str | None = Field(default=None, alias="callbackEventId")


class WhatsAppEventResponse(BaseModel):
    accepted: bool
    session_id: str = Field(alias="sessionId")
