from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.emails.service import decode_history_token, send_history_magic_link
from app.features.sessions.models import Session


async def request_history_link(db: AsyncSession, *, email: str) -> None:
    await send_history_magic_link(db, email=email)


async def get_history_sessions(db: AsyncSession, *, token: str) -> list[Session]:
    email = decode_history_token(token)
    statement = (
        select(Session)
        .where(Session.customer_email == email)
        .order_by(Session.created_at.desc())
    )
    result = await db.execute(statement)
    return list(result.scalars().all())
