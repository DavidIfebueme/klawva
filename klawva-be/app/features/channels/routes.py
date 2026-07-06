from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
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
from app.platform.config import settings
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


class TelegramAuthPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: int
    first_name: str | None = Field(default=None, alias="firstName")
    last_name: str | None = Field(default=None, alias="lastName")
    username: str | None = None
    photo_url: str | None = Field(default=None, alias="photoUrl")
    auth_date: int = Field(alias="authDate")
    hash: str


class TelegramAuthRequest(BaseModel):
    session_id: str = Field(alias="sessionId")
    user: TelegramAuthPayload


class TelegramAuthResponse(BaseModel):
    stored: bool
    telegram_user_id: str | None = Field(default=None, alias="telegramUserId")


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


@router.post("/api/channels/telegram/auth", response_model=TelegramAuthResponse)
async def telegram_auth_endpoint(
    payload: TelegramAuthRequest,
    session_token: str = Depends(get_session_token_header),
    db: AsyncSession = Depends(get_async_session),
) -> TelegramAuthResponse:
    from app.features.channels.service import (
        store_telegram_user_id,
        verify_telegram_widget_payload,
    )
    from app.features.sessions.auth import assert_session_access
    from app.platform.config import settings

    session = await assert_session_access(
        db,
        session_id=payload.session_id,
        session_token=session_token,
    )
    if session.channel != "telegram":
        return TelegramAuthResponse(stored=False, telegramUserId=None)

    bot_token = settings.telegram_auth_bot_token
    if not bot_token:
        return TelegramAuthResponse(stored=False, telegramUserId=None)

    user_payload = {
        "id": payload.user.id,
        "first_name": payload.user.first_name,
        "last_name": payload.user.last_name,
        "username": payload.user.username,
        "photo_url": payload.user.photo_url,
        "auth_date": payload.user.auth_date,
        "hash": payload.user.hash,
    }
    user_payload = {k: v for k, v in user_payload.items() if v is not None}
    if not verify_telegram_widget_payload(user_payload, bot_token):
        return TelegramAuthResponse(stored=False, telegramUserId=None)

    telegram_user_id = str(payload.user.id)
    await store_telegram_user_id(
        db,
        session_id=payload.session_id,
        telegram_user_id=telegram_user_id,
    )
    return TelegramAuthResponse(stored=True, telegramUserId=telegram_user_id)


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


class TelegramAuthBotIdResponse(BaseModel):
    bot_id: str = Field(alias="botId")


@router.get("/api/channels/telegram/auth-bot-id", response_model=TelegramAuthBotIdResponse)
async def get_telegram_auth_bot_id_endpoint() -> TelegramAuthBotIdResponse:
    bot_token = settings.telegram_auth_bot_token
    if not bot_token:
        raise HTTPException(status_code=503, detail="telegram_auth_bot_not_configured")
    bot_id = bot_token.split(":", 1)[0]
    return TelegramAuthBotIdResponse(botId=bot_id)


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
    session_token: str = Depends(get_session_token_header),
    db: AsyncSession = Depends(get_async_session),
) -> TelegramLockAccessResponse:
    await assert_session_access(
        db,
        session_id=payload.session_id,
        session_token=session_token,
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

    link.peer_id = telegram_user_id
    await db.commit()

    return TelegramLockAccessResponse(locked=True, telegramUserId=telegram_user_id)


CLAWRAG_WHATSAPP_ALLOW_FROM = {"+2349066033744", "+2348023131244", "+15063961976"}


class WhatsAppLockAccessRequest(BaseModel):
    session_id: str = Field(alias="sessionId")


class WhatsAppLockAccessResponse(BaseModel):
    locked: bool
    whatsapp_phone_number: str | None = Field(default=None, alias="whatsappPhoneNumber")
    overlap_warning: bool = Field(default=False, alias="overlapWarning")


@router.post(
    "/api/channels/whatsapp/lock-access",
    response_model=WhatsAppLockAccessResponse,
)
async def lock_whatsapp_access_endpoint(
    payload: WhatsAppLockAccessRequest,
    session_token: str = Depends(get_session_token_header),
    db: AsyncSession = Depends(get_async_session),
) -> WhatsAppLockAccessResponse:
    session = await assert_session_access(
        db,
        session_id=payload.session_id,
        session_token=session_token,
    )

    agent_id = _agent_gateway_id(payload.session_id)
    detected_peer = openclaw_gateway.read_whatsapp_peer_id(agent_id)

    stmt = select(ChannelLink).where(ChannelLink.session_id == payload.session_id)
    link = (await db.execute(stmt)).scalar_one_or_none()
    if not link or not link.external_id:
        return WhatsAppLockAccessResponse(locked=False, whatsappPhoneNumber=detected_peer)

    account_id = link.external_id

    if session.agent_id == "vendor":
        from app.features.channels.service import _normalize_whatsapp_number
        owner_number = _normalize_whatsapp_number(link.link_target)
        link.peer_id = owner_number or detected_peer
        await db.commit()
        return WhatsAppLockAccessResponse(
            locked=True,
            whatsappPhoneNumber=owner_number or detected_peer,
            overlapWarning=False,
        )

    if not detected_peer:
        return WhatsAppLockAccessResponse(locked=False, whatsappPhoneNumber=None)
    phone_number = detected_peer

    config = await openclaw_gateway.read_config()
    config = openclaw_gateway.lock_whatsapp_account(config, account_id, phone_number)
    openclaw_gateway.write_config(config)
    openclaw_gateway.restart_gateway()

    link.peer_id = phone_number
    await db.commit()

    return WhatsAppLockAccessResponse(
        locked=True,
        whatsappPhoneNumber=phone_number,
        overlapWarning=False,
    )
