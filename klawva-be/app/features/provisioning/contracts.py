from pydantic import BaseModel, Field


class StartProvisioningRequest(BaseModel):
    session_id: str = Field(alias="sessionId")
    session_config: dict = Field(alias="sessionConfig")


class ProvisioningResponse(BaseModel):
    job_id: str = Field(alias="jobId")
    status: str
    droplet_id: str | None = Field(default=None, alias="dropletId")
    attempt_count: int = Field(alias="attemptCount")


class DestroyProvisioningRequest(BaseModel):
    session_id: str = Field(alias="sessionId")


class DestroyProvisioningResponse(BaseModel):
    destroyed: bool
