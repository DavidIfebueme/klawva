from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Literal

from app.features.channels.service import (
    assign_telegram_bot_token,
    get_or_refresh_whatsapp_qr,
    record_channel_onboarding_event,
)
from app.features.sessions.auth import assert_session_access, get_session_token_header
from app.platform.db.session import get_async_session

router = APIRouter(tags=["channels"])


class SessionQrResponse(BaseModel):
    qr: str
    expires_in: int = Field(alias="expiresIn")


class TelegramAssignRequest(BaseModel):
    session_id: str = Field(alias="sessionId")


class TelegramAssignResponse(BaseModel):
    token: str
    deep_link: str | None = Field(default=None, alias="deepLink")


class ChannelOnboardingEventRequest(BaseModel):
    session_id: str = Field(alias="sessionId")
    channel: Literal["telegram", "whatsapp"]
    event_type: Literal["linked", "intro_sent", "report_sent"] = Field(alias="eventType")
    target: str | None = None


class ChannelOnboardingEventResponse(BaseModel):
    status: str
    target: str | None = None


@router.get("/api/sessions/{session_id}/qr", response_model=SessionQrResponse)
async def get_session_qr_endpoint(
    session_id: str,
    session_token: str = Depends(get_session_token_header),
    db: AsyncSession = Depends(get_async_session),
) -> SessionQrResponse:
    await assert_session_access(
        db,
        session_id=session_id,
        session_token=session_token,
    )
    qr, expires_in = await get_or_refresh_whatsapp_qr(db, session_id=session_id)
    return SessionQrResponse(qr=qr, expiresIn=expires_in)


@router.post("/api/channels/telegram/assign", response_model=TelegramAssignResponse)
async def assign_telegram_endpoint(
    payload: TelegramAssignRequest,
    db: AsyncSession = Depends(get_async_session),
) -> TelegramAssignResponse:
    token, deep_link = await assign_telegram_bot_token(db, session_id=payload.session_id)
    return TelegramAssignResponse(token=token, deepLink=deep_link)


@router.post("/api/channels/onboarding/event", response_model=ChannelOnboardingEventResponse)
async def record_channel_onboarding_event_endpoint(
    payload: ChannelOnboardingEventRequest,
    db: AsyncSession = Depends(get_async_session),
) -> ChannelOnboardingEventResponse:
    link = await record_channel_onboarding_event(
        db,
        session_id=payload.session_id,
        channel=payload.channel,
        event_type=payload.event_type,
        target=payload.target,
    )
    return ChannelOnboardingEventResponse(status=link.status, target=link.link_target)
