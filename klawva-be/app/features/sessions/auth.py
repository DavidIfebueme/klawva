from __future__ import annotations

import hashlib
import hmac
import secrets

from fastapi import Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.sessions.models import Session


def generate_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def get_session_token_header(x_session_token: str | None = Header(default=None)) -> str:
    if not x_session_token:
        raise HTTPException(status_code=401, detail="session_token_required")
    return x_session_token


async def assert_session_access(
    db: AsyncSession,
    *,
    session_id: str,
    session_token: str,
) -> Session:
    session = await db.get(Session, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session_not_found")
    if not session.session_token_hash:
        raise HTTPException(status_code=401, detail="session_token_missing")
    provided_hash = hash_session_token(session_token)
    if not hmac.compare_digest(session.session_token_hash, provided_hash):
        raise HTTPException(status_code=403, detail="session_access_denied")
    return session
