import logging
import time
import httpx
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.platform.config import settings
from app.platform.db.session import get_async_session
from app.features.users.models import User
from app.features.sessions.models import Session
from app.features.sessions.service import normalize_session_status
from app.features.payments.models import Wallet, WalletTransaction, VirtualAccount
from app.features.activity.models import ActivityEvent
from app.features.provisioning.workspace import create_agent_workspace
from app.features.provisioning.agent_config import build_agent_fragment, _agent_gateway_id
from app.features.channels.models import ChannelLink
from app.platform.clients import openclaw_gateway
from app.features.dashboard.auth import (
    generate_token,
    decode_token,
    send_dashboard_magic_link,
    get_current_user,
)
from app.features.dashboard.contracts import (
    RequestMagicLinkPayload,
    VerifyMagicLinkPayload,
    VerifyMagicLinkResponse,
    UserProfileResponse,
    DashboardSessionEntry,
    UpdateAutoRenewPayload,
    UpdateBriefPayload,
    WalletDetailsResponse,
    WalletTransactionEntry,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.post("/auth/request-magic-link")
async def request_magic_link(
    payload: RequestMagicLinkPayload,
    db: AsyncSession = Depends(get_async_session),
) -> dict:
    email = payload.email.strip().lower()
    stmt = select(User).where(User.email == email)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    if user:
        try:
            await send_dashboard_magic_link(db, email=email)
        except Exception:
            logger.error("Failed to send dashboard magic link to %s", email, exc_info=True)
            raise HTTPException(status_code=502, detail="failed_to_send_email")
    return {"success": True}


@router.post("/auth/verify-magic-link", response_model=VerifyMagicLinkResponse)
async def verify_magic_link(
    payload: VerifyMagicLinkPayload,
    db: AsyncSession = Depends(get_async_session),
) -> VerifyMagicLinkResponse:
    try:
        email = decode_token(payload.token, expected_scope="dashboard_magic_link")
    except HTTPException as exc:
        raise exc
    except Exception as exc:
        raise HTTPException(status_code=401, detail="invalid_token") from exc

    stmt = select(User).where(User.email == email)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="user_not_found")

    session_token = generate_token(user.email, exp_minutes=60 * 24 * 7, scope="dashboard_session")
    return VerifyMagicLinkResponse(
        token=session_token,
        user={"id": user.id, "email": user.email},
    )


@router.get("/me", response_model=UserProfileResponse)
async def get_me(
    current_user: User = Depends(get_current_user),
) -> UserProfileResponse:
    return UserProfileResponse(id=current_user.id, email=current_user.email)


@router.get("/sessions", response_model=list[DashboardSessionEntry])
async def list_user_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> list[DashboardSessionEntry]:
    stmt = (
        select(Session)
        .where(Session.user_id == current_user.id)
        .order_by(Session.created_at.desc())
    )
    res = await db.execute(stmt)
    sessions = res.scalars().all()
    return [
        DashboardSessionEntry(
            id=s.id,
            agentId=s.agent_id,
            channel=s.channel,
            status=normalize_session_status(s.status),
            autoRenew=s.auto_renew,
            startedAt=s.started_at,
            expiresAt=s.expires_at,
            completedAt=s.completed_at,
            createdAt=s.created_at,
        )
        for s in sessions
    ]


@router.get("/sessions/{session_id}", response_model=DashboardSessionEntry)
async def get_user_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> DashboardSessionEntry:
    s = await db.get(Session, session_id)
    if not s or s.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="session_not_found")
    return DashboardSessionEntry(
        id=s.id,
        agentId=s.agent_id,
        channel=s.channel,
        status=normalize_session_status(s.status),
        autoRenew=s.auto_renew,
        startedAt=s.started_at,
        expiresAt=s.expires_at,
        completedAt=s.completed_at,
        createdAt=s.created_at,
    )


@router.patch("/sessions/{session_id}/auto-renew", response_model=DashboardSessionEntry)
async def toggle_auto_renew(
    session_id: str,
    payload: UpdateAutoRenewPayload,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> DashboardSessionEntry:
    s = await db.get(Session, session_id)
    if not s or s.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="session_not_found")
    s.auto_renew = payload.auto_renew
    await db.commit()
    await db.refresh(s)
    return DashboardSessionEntry(
        id=s.id,
        agentId=s.agent_id,
        channel=s.channel,
        status=normalize_session_status(s.status),
        autoRenew=s.auto_renew,
        startedAt=s.started_at,
        expiresAt=s.expires_at,
        completedAt=s.completed_at,
        createdAt=s.created_at,
    )


@router.patch("/sessions/{session_id}/brief")
async def update_session_brief(
    session_id: str,
    payload: UpdateBriefPayload,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> dict:
    s = await db.get(Session, session_id)
    if not s or s.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="session_not_found")
    
    s.brief = payload.brief
    await db.flush()

    status = normalize_session_status(s.status)
    if status in ("provisioning", "ready", "active"):
        try:
            create_agent_workspace(s)

            channel_stmt = select(ChannelLink).where(ChannelLink.session_id == s.id)
            channel_res = await db.execute(channel_stmt)
            channel_link = channel_res.scalar_one_or_none()

            from app.features.provisioning.service import _resolve_channel_binding
            channel_type, account_id, account_config = _resolve_channel_binding(s, channel_link)

            agent_fragment = build_agent_fragment(s)

            config = await openclaw_gateway.read_config()
            config = openclaw_gateway.add_agent_to_config(
                config,
                agent_fragment,
                channel_type=channel_type or None,
                account_id=account_id or None,
                account_config=account_config,
            )
            openclaw_gateway.write_config(config)

            if channel_type and account_id:
                openclaw_gateway.restart_gateway()

            db.add(
                ActivityEvent(
                    session_id=s.id,
                    event_type="brief_updated",
                    payload={"text": "Employer brief updated. Agent configuration reloaded."},
                    occurred_at=datetime.now(UTC),
                )
            )
        except Exception as exc:
            logger.error("Failed to update active workspace/gateway config for session %s", s.id, exc_info=True)

    await db.commit()
    return {"success": True}


@router.get("/sessions/{session_id}/brief")
async def get_session_brief(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> dict:
    s = await db.get(Session, session_id)
    if not s or s.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="session_not_found")
    return {"brief": s.brief}


@router.get("/wallet", response_model=WalletDetailsResponse)
async def get_wallet_details(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> WalletDetailsResponse:
    wallet_stmt = select(Wallet).where(Wallet.user_id == current_user.id)
    wallet_res = await db.execute(wallet_stmt)
    wallet = wallet_res.scalar_one_or_none()
    balance = wallet.balance_minor if wallet else 0

    va_stmt = select(VirtualAccount).where(VirtualAccount.user_id == current_user.id)
    va_res = await db.execute(va_stmt)
    va = va_res.scalar_one_or_none()

    return WalletDetailsResponse(
        balanceMinor=balance,
        currency="NGN",
        hasVirtualAccount=va is not None,
        bankName=va.bank_name if va else None,
        bankAccountNumber=va.bank_account_number if va else None,
        bankAccountName=va.bank_account_name if va else None,
    )


@router.post("/wallet/create-virtual-account", response_model=WalletDetailsResponse)
async def create_virtual_account_endpoint(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> WalletDetailsResponse:
    stmt = select(VirtualAccount).where(VirtualAccount.user_id == current_user.id)
    res = await db.execute(stmt)
    existing = res.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="virtual_account_already_exists")

    from app.features.payments.providers import get_provider, NombaProvider
    provider = get_provider("nomba")
    if not isinstance(provider, NombaProvider):
        raise HTTPException(status_code=500, detail="invalid_provider_configuration")

    account_ref = f"klawva_{current_user.id[:8]}_{int(time.time())}"
    try:
        token = await provider._get_access_token()
    except Exception as exc:
        logger.error("Failed to authenticate with Nomba API", exc_info=True)
        raise HTTPException(status_code=502, detail="nomba_authentication_failed")

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                f"{provider._base_url}/v1/accounts/virtual",
                headers={
                    "Authorization": f"Bearer {token}",
                    "accountId": provider._account_id,
                    "Content-Type": "application/json",
                },
                json={
                    "accountRef": account_ref,
                    "accountName": f"Klawva / {current_user.email}",
                }
            )
    except Exception as exc:
        logger.error("Failed to call Nomba API for virtual account creation", exc_info=True)
        raise HTTPException(status_code=502, detail="nomba_api_connection_failed")

    if response.status_code >= 400:
        logger.error("Nomba VA creation API returned error status: %s, body: %s", response.status_code, response.text)
        raise HTTPException(status_code=502, detail=f"nomba_api_error:{response.status_code}")

    res_json = response.json()
    if res_json.get("code") != "00":
        logger.error("Nomba VA creation API returned code: %s, desc: %s", res_json.get("code"), res_json.get("description"))
        raise HTTPException(
            status_code=502,
            detail=f"nomba_api_error_code:{res_json.get('code')}:{res_json.get('description')}"
        )

    data = res_json.get("data", {})
    va = VirtualAccount(
        user_id=current_user.id,
        nomba_account_ref=account_ref,
        bank_account_number=str(data.get("bankAccountNumber")),
        bank_name=str(data.get("bankName")),
        bank_account_name=str(data.get("bankAccountName")),
        is_active=True,
    )
    db.add(va)

    wallet_stmt = select(Wallet).where(Wallet.user_id == current_user.id)
    wallet_res = await db.execute(wallet_stmt)
    wallet = wallet_res.scalar_one_or_none()
    if not wallet:
        wallet = Wallet(user_id=current_user.id, balance_minor=0)
        db.add(wallet)

    await db.commit()
    await db.refresh(va)
    await db.refresh(wallet)

    return WalletDetailsResponse(
        balanceMinor=wallet.balance_minor,
        currency="NGN",
        hasVirtualAccount=True,
        bankName=va.bank_name,
        bankAccountNumber=va.bank_account_number,
        bankAccountName=va.bank_account_name,
    )


@router.get("/wallet/transactions", response_model=list[WalletTransactionEntry])
async def list_wallet_transactions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> list[WalletTransactionEntry]:
    wallet_stmt = select(Wallet).where(Wallet.user_id == current_user.id)
    wallet_res = await db.execute(wallet_stmt)
    wallet = wallet_res.scalar_one_or_none()
    if not wallet:
        return []

    tx_stmt = (
        select(WalletTransaction)
        .where(WalletTransaction.wallet_id == wallet.id)
        .order_by(WalletTransaction.created_at.desc())
    )
    tx_res = await db.execute(tx_stmt)
    transactions = tx_res.scalars().all()
    return [
        WalletTransactionEntry(
            id=t.id,
            type=t.type,
            amountMinor=t.amount_minor,
            description=t.description,
            balanceAfter=t.balance_after,
            source=t.source,
            createdAt=t.created_at,
        )
        for t in transactions
    ]
