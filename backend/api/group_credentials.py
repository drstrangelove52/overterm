from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models.database import get_db
from models.models import UserGroupCredential, User
from models.schemas import UserGroupCredentialCreate, UserGroupCredentialOut
from auth.dependencies import get_current_user
from core.crypto import encrypt

router = APIRouter(prefix="/group-credentials", tags=["group-credentials"])


@router.get("", response_model=list[UserGroupCredentialOut])
async def list_group_credentials(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(UserGroupCredential).where(UserGroupCredential.user_id == current_user.id)
    )
    return result.scalars().all()


@router.put("", response_model=UserGroupCredentialOut)
async def upsert_group_credential(
    body: UserGroupCredentialCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(UserGroupCredential).where(
            UserGroupCredential.user_id == current_user.id,
            UserGroupCredential.group_id == body.group_id,
        )
    )
    cred = result.scalar_one_or_none()
    if not cred:
        cred = UserGroupCredential(user_id=current_user.id, group_id=body.group_id)
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


@router.delete("/{group_id}", status_code=204)
async def delete_group_credential(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(UserGroupCredential).where(
            UserGroupCredential.user_id == current_user.id,
            UserGroupCredential.group_id == group_id,
        )
    )
    cred = result.scalar_one_or_none()
    if not cred:
        raise HTTPException(status_code=404, detail="Keine Gruppen-Credentials gefunden")
    await db.delete(cred)
    await db.commit()
