from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from core.config import settings

ALGORITHM = "HS256"


def create_access_token(user_id: int, username: str, is_admin: bool) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.access_token_expire_hours)
    payload = {
        "sub": str(user_id),
        "username": username,
        "is_admin": is_admin,
        "exp": expire,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def create_partial_token(user_id: int) -> str:
    """Short-lived token issued after password check, before TOTP verification."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=5)
    payload = {"sub": str(user_id), "scope": "totp", "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except JWTError:
        return {}


def decode_partial_token(token: str) -> int | None:
    """Returns user_id if token is a valid partial (totp-scope) token, else None."""
    payload = decode_token(token)
    if payload.get("scope") == "totp":
        return int(payload["sub"])
    return None
