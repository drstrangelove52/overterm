import hashlib
import base64
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models.database import get_db
from models.models import SshKey, User
from models.schemas import SshKeyCreate, SshKeyOut
from auth.dependencies import get_current_user
from core.crypto import encrypt

router = APIRouter(prefix="/ssh-keys", tags=["ssh-keys"])


def _fingerprint(public_key: str) -> str:
    parts = public_key.strip().split()
    if len(parts) < 2:
        return ""
    raw = base64.b64decode(parts[1])
    digest = hashlib.sha256(raw).digest()
    return "SHA256:" + base64.b64encode(digest).rstrip(b"=").decode()


@router.get("", response_model=list[SshKeyOut])
async def list_keys(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(SshKey).where(SshKey.user_id == current_user.id))
    return result.scalars().all()


@router.post("", response_model=SshKeyOut, status_code=201)
async def create_key(
    body: SshKeyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    key = SshKey(
        user_id=current_user.id,
        name=body.name,
        public_key=body.public_key,
        private_key_encrypted=encrypt(body.private_key),
        passphrase_encrypted=encrypt(body.passphrase) if body.passphrase else None,
        fingerprint=_fingerprint(body.public_key),
    )
    db.add(key)
    await db.commit()
    await db.refresh(key)
    return key


@router.delete("/{key_id}", status_code=204)
async def delete_key(
    key_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SshKey).where(SshKey.id == key_id, SshKey.user_id == current_user.id)
    )
    key = result.scalar_one_or_none()
    if not key:
        raise HTTPException(status_code=404, detail="Key not found")
    await db.delete(key)
    await db.commit()
