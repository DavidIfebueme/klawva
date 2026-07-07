import logging
from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.payments.models import Wallet, WalletTransaction

logger = logging.getLogger(__name__)


async def get_or_create_wallet(db: AsyncSession, *, user_id: str) -> Wallet:
    stmt = select(Wallet).where(Wallet.user_id == user_id).with_for_update()
    res = await db.execute(stmt)
    wallet = res.scalar_one_or_none()
    if wallet:
        return wallet

    wallet = Wallet(user_id=user_id, balance_minor=0)
    db.add(wallet)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        stmt = select(Wallet).where(Wallet.user_id == user_id).with_for_update()
        res = await db.execute(stmt)
        wallet = res.scalar_one()
    return wallet


async def credit_wallet(
    db: AsyncSession,
    *,
    wallet_id: str,
    amount_minor: int,
    reference: str,
    description: str,
    source: str,
) -> WalletTransaction:
    result = await db.execute(
        update(Wallet)
        .where(Wallet.id == wallet_id)
        .values(balance_minor=Wallet.balance_minor + amount_minor)
        .returning(Wallet.balance_minor)
    )
    new_balance = result.scalar_one()

    tx = WalletTransaction(
        wallet_id=wallet_id,
        type="credit",
        amount_minor=amount_minor,
        reference=reference,
        description=description,
        balance_after=new_balance,
        source=source,
    )
    db.add(tx)
    return tx


async def debit_wallet(
    db: AsyncSession,
    *,
    wallet_id: str,
    amount_minor: int,
    reference: str,
    description: str,
    source: str,
) -> WalletTransaction | None:
    result = await db.execute(
        update(Wallet)
        .where(Wallet.id == wallet_id, Wallet.balance_minor >= amount_minor)
        .values(balance_minor=Wallet.balance_minor - amount_minor)
        .returning(Wallet.balance_minor)
    )
    row = result.one_or_none()
    if row is None:
        return None

    new_balance = row[0]
    tx = WalletTransaction(
        wallet_id=wallet_id,
        type="debit",
        amount_minor=amount_minor,
        reference=reference,
        description=description,
        balance_after=new_balance,
        source=source,
    )
    db.add(tx)
    return tx


async def get_wallet_balance(db: AsyncSession, *, wallet_id: str) -> int:
    stmt = select(Wallet.balance_minor).where(Wallet.id == wallet_id)
    res = await db.execute(stmt)
    return res.scalar_one()
