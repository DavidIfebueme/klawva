from pydantic import BaseModel, Field


class StartProvisioningRequest(BaseModel):
    session_id: str = Field(alias="sessionId")


class ProvisioningResponse(BaseModel):
    job_id: str = Field(alias="jobId")
    status: str
    agent_id_in_gateway: str | None = Field(default=None, alias="agentIdInGateway")
    attempt_count: int = Field(alias="attemptCount")


class DestroyProvisioningRequest(BaseModel):
    session_id: str = Field(alias="sessionId")


class DestroyProvisioningResponse(BaseModel):
    destroyed: bool
