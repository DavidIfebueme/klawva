from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.channels.models import ChannelLink
from app.features.channels.service import (
    assign_klawva_whatsapp_number,
    assign_telegram_bot_token,
    get_vendor_whatsapp_qr,
    record_channel_onboarding_event,
)
from app.features.provisioning.agent_config import _agent_gateway_id
from app.features.sessions.auth import assert_session_access, get_session_token_header
from app.platform.clients import openclaw_gateway
from app.platform.db.session import get_async_session

router = APIRouter(tags=["channels"])


class SessionQrResponse(BaseModel):
    qr: str
    expires_in: int = Field(alias="expiresIn")
    whatsapp_number: str | None = Field(default=None, alias="whatsappNumber")
    wa_me_link: str | None = Field(default=None, alias="waMeLink")


class TelegramAssignRequest(BaseModel):
    session_id: str = Field(alias="sessionId")


class TelegramAssignResponse(BaseModel):
    token: str
    deep_link: str | None = Field(default=None, alias="deepLink")


class ChannelOnboardingEventRequest(BaseModel):
    session_id: str = Field(alias="sessionId")
    channel: Literal["telegram", "whatsapp"]
    event_type: Literal["linked", "intro_sent", "report_sent", "terminated"] = Field(
        alias="eventType"
    )
    target: str | None = None
    callback_event_id: str | None = Field(default=None, alias="callbackEventId")


class LinkConfirmedRequest(BaseModel):
    session_id: str = Field(alias="sessionId")
    channel: Literal["telegram", "whatsapp"]
    target: str | None = None
    callback_event_id: str | None = Field(default=None, alias="callbackEventId")


class IntroDeliveredRequest(BaseModel):
    session_id: str = Field(alias="sessionId")
    channel: Literal["telegram", "whatsapp"]
    target: str | None = None
    callback_event_id: str | None = Field(default=None, alias="callbackEventId")


class ChannelOnboardingEventResponse(BaseModel):
    status: str
    target: str | None = None
    callback_event_id: str | None = Field(default=None, alias="callbackEventId")


def _callback_event_id_for_status(link: ChannelLink, status: str) -> str | None:
    if status == "linked":
        return link.worker_link_callback_id
    if status == "intro_sent":
        return link.worker_intro_callback_id
    if status == "report_sent":
        return link.worker_report_callback_id
    if status == "terminated":
        return link.worker_terminated_callback_id
    return None


@router.get("/api/sessions/{session_id}/qr", response_model=SessionQrResponse)
async def get_session_qr_endpoint(
    session_id: str,
    session_token: str = Depends(get_session_token_header),
    db: AsyncSession = Depends(get_async_session),
) -> SessionQrResponse:
    session = await assert_session_access(
        db,
        session_id=session_id,
        session_token=session_token,
    )
    if session.agent_id == "vendor":
        qr, expires_in = await get_vendor_whatsapp_qr(db, session_id=session_id)
        return SessionQrResponse(qr=qr, expiresIn=expires_in)

    phone_number, wa_link = await assign_klawva_whatsapp_number(db, session_id=session_id)
    return SessionQrResponse(
        qr="",
        expiresIn=0,
        whatsappNumber=phone_number,
        waMeLink=wa_link,
    )


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
        callback_event_id=payload.callback_event_id,
    )
    return ChannelOnboardingEventResponse(
        status=link.status,
        target=link.link_target,
        callbackEventId=_callback_event_id_for_status(link, link.status),
    )


@router.post(
    "/api/channels/onboarding/link-confirmed",
    response_model=ChannelOnboardingEventResponse,
)
async def record_link_confirmed_endpoint(
    payload: LinkConfirmedRequest,
    db: AsyncSession = Depends(get_async_session),
) -> ChannelOnboardingEventResponse:
    link = await record_channel_onboarding_event(
        db,
        session_id=payload.session_id,
        channel=payload.channel,
        event_type="linked",
        target=payload.target,
        callback_event_id=payload.callback_event_id,
    )
    return ChannelOnboardingEventResponse(
        status=link.status,
        target=link.link_target,
        callbackEventId=link.worker_link_callback_id,
    )


@router.post(
    "/api/channels/onboarding/intro-delivered",
    response_model=ChannelOnboardingEventResponse,
)
async def record_intro_delivered_endpoint(
    payload: IntroDeliveredRequest,
    db: AsyncSession = Depends(get_async_session),
) -> ChannelOnboardingEventResponse:
    link = await record_channel_onboarding_event(
        db,
        session_id=payload.session_id,
        channel=payload.channel,
        event_type="intro_sent",
        target=payload.target,
        callback_event_id=payload.callback_event_id,
    )
    return ChannelOnboardingEventResponse(
        status=link.status,
        target=link.link_target,
        callbackEventId=link.worker_intro_callback_id,
    )


class TelegramLockAccessRequest(BaseModel):
    session_id: str = Field(alias="sessionId")


class TelegramLockAccessResponse(BaseModel):
    locked: bool
    telegram_user_id: str | None = Field(default=None, alias="telegramUserId")


@router.post(
    "/api/channels/telegram/lock-access",
    response_model=TelegramLockAccessResponse,
)
async def lock_telegram_access_endpoint(
    payload: TelegramLockAccessRequest,
    db: AsyncSession = Depends(get_async_session),
) -> TelegramLockAccessResponse:
    session_token_header = get_session_token_header(None)
    await assert_session_access(
        db,
        session_id=payload.session_id,
        session_token=session_token_header,
    )

    agent_id = _agent_gateway_id(payload.session_id)
    telegram_user_id = openclaw_gateway.read_telegram_peer_id(agent_id)
    if not telegram_user_id:
        return TelegramLockAccessResponse(locked=False, telegramUserId=None)

    stmt = select(ChannelLink).where(ChannelLink.session_id == payload.session_id)
    link = (await db.execute(stmt)).scalar_one_or_none()
    if not link or not link.external_id:
        return TelegramLockAccessResponse(locked=False, telegramUserId=None)

    from app.features.provisioning.service import _load_telegram_accounts_map
    accounts_map = _load_telegram_accounts_map()
    account_id = accounts_map.get(link.external_id, "")
    if not account_id:
        return TelegramLockAccessResponse(locked=False, telegramUserId=telegram_user_id)

    config = await openclaw_gateway.read_config()
    config = openclaw_gateway.lock_telegram_account(config, account_id, telegram_user_id)
    openclaw_gateway.write_config(config)
    openclaw_gateway.restart_gateway()

    return TelegramLockAccessResponse(locked=True, telegramUserId=telegram_user_id)
