from datetime import datetime
from pydantic import BaseModel, Field
from typing import Any


class RequestMagicLinkPayload(BaseModel):
    email: str


class VerifyMagicLinkPayload(BaseModel):
    token: str


class VerifyMagicLinkResponse(BaseModel):
    token: str
    user: dict = Field(..., description="dict with user id and email")


class UserProfileResponse(BaseModel):
    id: str
    email: str


class DashboardSessionEntry(BaseModel):
    id: str
    agent_id: str = Field(alias="agentId")
    channel: str
    status: str
    auto_renew: bool = Field(alias="autoRenew")
    started_at: datetime | None = Field(default=None, alias="startedAt")
    expires_at: datetime | None = Field(default=None, alias="expiresAt")
    completed_at: datetime | None = Field(default=None, alias="completedAt")
    created_at: datetime = Field(alias="createdAt")


class UpdateAutoRenewPayload(BaseModel):
    auto_renew: bool = Field(alias="autoRenew")


class UpdateBriefPayload(BaseModel):
    brief: dict[str, Any]


class WalletDetailsResponse(BaseModel):
    balance_minor: int = Field(alias="balanceMinor")
    currency: str
    has_virtual_account: bool = Field(alias="hasVirtualAccount")
    bank_name: str | None = Field(default=None, alias="bankName")
    bank_account_number: str | None = Field(default=None, alias="bankAccountNumber")
    bank_account_name: str | None = Field(default=None, alias="bankAccountName")


class WalletTransactionEntry(BaseModel):
    id: str
    type: str
    amount_minor: int = Field(alias="amountMinor")
    description: str | None
    balance_after: int = Field(alias="balanceAfter")
    source: str
    created_at: datetime = Field(alias="createdAt")
