from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete as sa_delete
from sqlalchemy.orm import selectinload

from models.database import get_db
from models.models import User, UserGroup
from models.schemas import UserCreate, UserUpdate, UserOut
from auth.dependencies import require_admin
from auth.password import hash_password

router = APIRouter(prefix="/users", tags=["users"])


def _user_query():
    return select(User).options(selectinload(User.user_groups))


def _user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        username=user.username,
        email=user.email,
        is_admin=user.is_admin,
        is_active=user.is_active,
        created_at=user.created_at,
        group_ids=[ug.group_id for ug in user.user_groups],
    )


async def _sync_groups(db: AsyncSession, user_id: int, group_ids: list[int]):
    await db.execute(sa_delete(UserGroup).where(UserGroup.user_id == user_id))
    for gid in group_ids:
        db.add(UserGroup(user_id=user_id, group_id=gid, role="member"))


@router.get("", response_model=list[UserOut])
async def list_users(db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    result = await db.execute(_user_query().order_by(User.username))
    return [_user_out(u) for u in result.scalars().all()]


@router.post("", response_model=UserOut, status_code=201)
async def create_user(body: UserCreate, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    existing = await db.execute(select(User).where(User.username == body.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already exists")
    user = User(
        username=body.username,
        email=body.email,
        password_hash=hash_password(body.password),
        is_admin=body.is_admin,
        is_active=body.is_active,
    )
    db.add(user)
    await db.flush()
    if body.group_ids:
        await _sync_groups(db, user.id, body.group_ids)
    await db.commit()
    result = await db.execute(_user_query().where(User.id == user.id))
    return _user_out(result.scalar_one())


@router.get("/{user_id}", response_model=UserOut)
async def get_user(user_id: int, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    result = await db.execute(_user_query().where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_out(user)


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(user_id: int, body: UserUpdate, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    result = await db.execute(_user_query().where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if body.email is not None:
        user.email = body.email
    if body.is_admin is not None:
        user.is_admin = body.is_admin
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.password is not None:
        user.password_hash = hash_password(body.password)
    if body.group_ids is not None:
        await _sync_groups(db, user_id, body.group_ids)
    await db.commit()
    result = await db.execute(_user_query().where(User.id == user_id))
    return _user_out(result.scalar_one())


@router.delete("/{user_id}", status_code=204)
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.delete(user)
    await db.commit()
