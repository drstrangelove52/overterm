import hashlib
import io
import json
import secrets
import pyotp
import qrcode
import qrcode.image.svg
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from slowapi import Limiter
from slowapi.util import get_remote_address

from core.config import settings
from models.database import get_db
from models.models import User, UserGroup, Group
from models.schemas import (
    LoginRequest, TokenResponse, PasswordChangeRequest, UserOut, GroupOut,
    TotpVerifyRequest, TotpEnableRequest, TotpDisableRequest,
    TotpSetupResponse, TotpStatusResponse, TotpRegenerateCodesResponse, ProfileUpdateRequest,
)
from auth.password import hash_password, verify_password, verify_and_upgrade
from auth.session import create_session, delete_session, create_totp_pending, consume_totp_pending
from auth.dependencies import SESSION_COOKIE_NAME, get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)

RECOVERY_CODE_COUNT = 8


def _hash_recovery_code(code: str) -> str:
    return hashlib.sha256(code.upper().encode()).hexdigest()


def _generate_recovery_codes() -> tuple[list[str], list[str]]:
    plain = [
        f"{secrets.token_hex(4).upper()}-{secrets.token_hex(4).upper()}"
        for _ in range(RECOVERY_CODE_COUNT)
    ]
    hashed = [_hash_recovery_code(c) for c in plain]
    return plain, hashed


def _consume_recovery_code(code: str, stored_json: str) -> str | None:
    """Check code against stored hashes. Returns updated JSON if valid, None if invalid."""
    stored = json.loads(stored_json)
    h = _hash_recovery_code(code)
    if h not in stored:
        return None
    stored.remove(h)
    return json.dumps(stored)


def _make_qr_svg(uri: str) -> str:
    factory = qrcode.image.svg.SvgPathFillImage
    img = qrcode.make(uri, image_factory=factory, box_size=4)
    buf = io.BytesIO()
    img.save(buf)
    return buf.getvalue().decode()


def _set_session_cookie(response: Response, token: str, max_age: int) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=max_age,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, body: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    valid, new_hash = verify_and_upgrade(body.password, user.password_hash)
    if not valid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if new_hash:
        user.password_hash = new_hash
        await db.commit()

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")
    if user.totp_enabled:
        partial_token = await create_totp_pending(db, user.id)
        return TokenResponse(requires_totp=True, partial_token=partial_token)

    token, max_age = await create_session(db, user.id)
    _set_session_cookie(response, token, max_age)
    return TokenResponse()


@router.post("/logout")
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if token:
        await delete_session(db, token)
    response.delete_cookie(SESSION_COOKIE_NAME)
    return {"detail": "ok"}


@router.post("/totp/verify", response_model=TokenResponse)
async def totp_verify(response: Response, body: TotpVerifyRequest, db: AsyncSession = Depends(get_db)):
    user_id = await consume_totp_pending(db, body.partial_token)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active or not user.totp_enabled or not user.totp_secret:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid request")

    # Try TOTP code first
    valid = pyotp.TOTP(user.totp_secret).verify(body.code, valid_window=1)

    # Try recovery code
    if not valid and user.totp_recovery_codes:
        updated = _consume_recovery_code(body.code, user.totp_recovery_codes)
        if updated is not None:
            user.totp_recovery_codes = updated
            await db.commit()
            valid = True

    if not valid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Ungültiger Code")

    token, max_age = await create_session(db, user.id)
    _set_session_cookie(response, token, max_age)
    return TokenResponse()


@router.get("/totp/status", response_model=TotpStatusResponse)
async def totp_status(current_user: User = Depends(get_current_user)):
    return TotpStatusResponse(enabled=current_user.totp_enabled)


@router.post("/totp/setup", response_model=TotpSetupResponse)
async def totp_setup(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    secret = pyotp.random_base32()
    uri = pyotp.TOTP(secret).provisioning_uri(name=current_user.username, issuer_name="OverTerm")
    plain_codes, hashed_codes = _generate_recovery_codes()
    current_user.totp_secret = secret
    current_user.totp_recovery_codes = json.dumps(hashed_codes)
    await db.commit()
    return TotpSetupResponse(secret=secret, otpauth_uri=uri, qr_svg=_make_qr_svg(uri), recovery_codes=plain_codes)


@router.post("/totp/enable", status_code=204)
async def totp_enable(
    body: TotpEnableRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.totp_secret:
        raise HTTPException(400, "Zuerst /totp/setup aufrufen")
    if not pyotp.TOTP(current_user.totp_secret).verify(body.code, valid_window=1):
        raise HTTPException(400, "Ungültiger Code")
    current_user.totp_enabled = True
    await db.commit()


@router.post("/totp/disable", status_code=204)
async def totp_disable(
    body: TotpDisableRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(body.password, current_user.password_hash):
        raise HTTPException(400, "Falsches Passwort")
    current_user.totp_secret = None
    current_user.totp_enabled = False
    current_user.totp_recovery_codes = None
    await db.commit()


@router.post("/totp/regenerate-recovery-codes", response_model=TotpRegenerateCodesResponse)
async def regenerate_recovery_codes(
    body: TotpDisableRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.totp_enabled:
        raise HTTPException(400, "2FA ist nicht aktiv")
    if not verify_password(body.password, current_user.password_hash):
        raise HTTPException(400, "Falsches Passwort")
    plain_codes, hashed_codes = _generate_recovery_codes()
    current_user.totp_recovery_codes = json.dumps(hashed_codes)
    await db.commit()
    return TotpRegenerateCodesResponse(recovery_codes=plain_codes)


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserOut)
async def update_me(
    body: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.email is not None:
        from sqlalchemy import select as sa_select
        existing = await db.execute(sa_select(User).where(User.email == body.email, User.id != current_user.id))
        if existing.scalar_one_or_none():
            raise HTTPException(400, "E-Mail bereits vergeben")
        current_user.email = body.email
    if body.language in ("de", "en"):
        current_user.language = body.language
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.get("/me/groups", response_model=list[GroupOut])
async def my_groups(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Group)
        .join(UserGroup, UserGroup.group_id == Group.id)
        .where(UserGroup.user_id == current_user.id)
        .order_by(Group.name)
    )
    return result.scalars().all()


@router.post("/change-password", status_code=204)
async def change_password(
    body: PasswordChangeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password incorrect")
    current_user.password_hash = hash_password(body.new_password)
    await db.commit()
