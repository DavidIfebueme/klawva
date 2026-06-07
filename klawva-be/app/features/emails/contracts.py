from pydantic import BaseModel, Field


class ContactEmailRequest(BaseModel):
    subject: str
    body: str
    reply_to: str | None = Field(default=None, alias="replyTo")


class SendEmailResponse(BaseModel):
    sent: bool


class DispatchDueEmailsResponse(BaseModel):
    sent_count: int = Field(alias="sentCount")
