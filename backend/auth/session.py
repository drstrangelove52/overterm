import secrets
from datetime import datetime, timedelta

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from models.models import AuthSession, TotpPending

TOTP_PENDING_MINUTES = 5


async def create_session(db: AsyncSession, user_id: int) -> tuple[str, int]:
    """Creates a login session, returns (token, max_age_seconds) for the cookie."""
    await db.execute(delete(AuthSession).where(AuthSession.expires_at < datetime.utcnow()))
    token = secrets.token_urlsafe(32)
    now = datetime.utcnow()
    expires_at = now + timedelta(hours=settings.access_token_expire_hours)
    db.add(AuthSession(token=token, user_id=user_id, created_at=now, expires_at=expires_at))
    await db.commit()
    return token, settings.access_token_expire_hours * 3600


async def validate_session(db: AsyncSession, token: str) -> int | None:
    """Returns the user_id for a valid, unexpired session token, else None."""
    session = await db.get(AuthSession, token)
    if session is None:
        return None
    if session.expires_at < datetime.utcnow():
        await db.delete(session)
        await db.commit()
        return None
    return session.user_id


async def delete_session(db: AsyncSession, token: str) -> None:
    session = await db.get(AuthSession, token)
    if session:
        await db.delete(session)
        await db.commit()


async def create_totp_pending(db: AsyncSession, user_id: int) -> str:
    await db.execute(delete(TotpPending).where(TotpPending.expires_at < datetime.utcnow()))
    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(minutes=TOTP_PENDING_MINUTES)
    db.add(TotpPending(token=token, user_id=user_id, expires_at=expires_at))
    await db.commit()
    return token


async def consume_totp_pending(db: AsyncSession, token: str) -> int | None:
    """Validates and deletes a partial token (single use). Returns user_id or None."""
    pending = await db.get(TotpPending, token)
    if pending is None:
        return None
    user_id = pending.user_id
    expired = pending.expires_at < datetime.utcnow()
    await db.delete(pending)
    await db.commit()
    return None if expired else user_id
