from pydantic import BaseModel, EmailStr, Field


class ContactEmailRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    employee_type: str | None = Field(default=None, alias="employeeType", max_length=100)
    description: str = Field(..., min_length=10, max_length=2000, alias="description")


class SendEmailResponse(BaseModel):
    sent: bool


class DispatchDueEmailsResponse(BaseModel):
    sent_count: int = Field(alias="sentCount")
