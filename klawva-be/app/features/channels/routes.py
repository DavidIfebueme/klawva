from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.channels.service import assign_telegram_bot_token, get_or_refresh_whatsapp_qr
from app.platform.db.session import get_async_session

router = APIRouter(tags=["channels"])


class SessionQrResponse(BaseModel):
    qr: str
    expires_in: int = Field(alias="expiresIn")


class TelegramAssignRequest(BaseModel):
    session_id: str = Field(alias="sessionId")


class TelegramAssignResponse(BaseModel):
    token: str


@router.get("/api/sessions/{session_id}/qr", response_model=SessionQrResponse)
async def get_session_qr_endpoint(
    session_id: str,
    db: AsyncSession = Depends(get_async_session),
) -> SessionQrResponse:
    qr, expires_in = await get_or_refresh_whatsapp_qr(db, session_id=session_id)
    return SessionQrResponse(qr=qr, expiresIn=expires_in)


@router.post("/api/channels/telegram/assign", response_model=TelegramAssignResponse)
async def assign_telegram_endpoint(
    payload: TelegramAssignRequest,
    db: AsyncSession = Depends(get_async_session),
) -> TelegramAssignResponse:
    token = await assign_telegram_bot_token(db, session_id=payload.session_id)
    return TelegramAssignResponse(token=token)
