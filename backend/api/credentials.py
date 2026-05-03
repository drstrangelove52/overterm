from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models.database import get_db
from models.models import UserCredential, User
from models.schemas import UserCredentialCreate, UserCredentialOut
from auth.dependencies import get_current_user
from core.crypto import encrypt

router = APIRouter(prefix="/credentials", tags=["credentials"])


@router.get("", response_model=list[UserCredentialOut])
async def list_credentials(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(UserCredential).where(UserCredential.user_id == current_user.id)
    )
    return result.scalars().all()


@router.put("", response_model=UserCredentialOut)
async def upsert_credential(
    body: UserCredentialCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(UserCredential).where(
            UserCredential.user_id == current_user.id,
            UserCredential.host_id == body.host_id,
        )
    )
    cred = result.scalar_one_or_none()
    if not cred:
        cred = UserCredential(user_id=current_user.id, host_id=body.host_id)
        db.add(cred)

    if body.username is not None:
        cred.username = body.username
    cred.auth_method = body.auth_method
    if body.auth_method == "password" and body.password:
        cred.password_encrypted = encrypt(body.password)
        cred.ssh_key_id = None
    elif body.auth_method == "key" and body.ssh_key_id:
        cred.ssh_key_id = body.ssh_key_id
        cred.password_encrypted = None

    await db.commit()
    await db.refresh(cred)
    return cred


@router.delete("/{host_id}", status_code=204)
async def delete_credential(
    host_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(UserCredential).where(
            UserCredential.user_id == current_user.id,
            UserCredential.host_id == host_id,
        )
    )
    cred = result.scalar_one_or_none()
    if not cred:
        raise HTTPException(status_code=404, detail="No personal credentials for this host")
    await db.delete(cred)
    await db.commit()
