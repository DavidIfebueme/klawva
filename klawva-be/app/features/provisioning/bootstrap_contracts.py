from pydantic import BaseModel, Field


class BootstrapRequest(BaseModel):
    session_id: str = Field(alias="sessionId")


class BootstrapResponse(BaseModel):
    job_id: str = Field(alias="jobId")
    status: str
