from pydantic import BaseModel, Field


class ActivityIngestRequest(BaseModel):
    session_id: str = Field(alias="sessionId")
    event_type: str = Field(alias="eventType")
    text: str
    payload: dict = {}


class ActivityIngestResponse(BaseModel):
    event_id: str = Field(alias="eventId")


class SessionProjectionResponse(BaseModel):
    status: str
    connected: bool | None = None
