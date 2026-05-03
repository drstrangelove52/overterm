from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload

from models.database import get_db
from models.models import Group, UserGroup, HostGroup, User, Host
from models.schemas import (
    GroupCreate, GroupOut, GroupDetailOut, GroupMemberOut, GroupHostOut,
    AddUserToGroupRequest, AddHostToGroupRequest,
)
from auth.dependencies import require_admin

router = APIRouter(prefix="/groups", tags=["groups"])


async def _load_group(group_id: int, db: AsyncSession) -> Group:
    result = await db.execute(
        select(Group)
        .options(
            selectinload(Group.user_groups).selectinload(UserGroup.user),
            selectinload(Group.host_groups).selectinload(HostGroup.host),
        )
        .where(Group.id == group_id)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    return group


@router.get("", response_model=list[GroupOut])
async def list_groups(db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    result = await db.execute(select(Group).order_by(Group.name))
    return result.scalars().all()


@router.post("", response_model=GroupOut, status_code=201)
async def create_group(body: GroupCreate, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    group = Group(name=body.name, description=body.description)
    db.add(group)
    await db.commit()
    await db.refresh(group)
    return group


@router.get("/{group_id}", response_model=GroupDetailOut)
async def get_group(group_id: int, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    group = await _load_group(group_id, db)
    return GroupDetailOut(
        id=group.id,
        name=group.name,
        description=group.description,
        created_at=group.created_at,
        members=[
            GroupMemberOut(user_id=ug.user_id, username=ug.user.username, role=ug.role)
            for ug in group.user_groups
        ],
        hosts=[
            GroupHostOut(host_id=hg.host_id, name=hg.host.name, hostname=hg.host.hostname)
            for hg in group.host_groups
        ],
    )


@router.patch("/{group_id}", response_model=GroupOut)
async def update_group(
    group_id: int, body: GroupCreate,
    db: AsyncSession = Depends(get_db), _=Depends(require_admin),
):
    result = await db.execute(select(Group).where(Group.id == group_id))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    group.name = body.name
    group.description = body.description
    await db.commit()
    await db.refresh(group)
    return group


@router.delete("/{group_id}", status_code=204)
async def delete_group(group_id: int, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    result = await db.execute(select(Group).where(Group.id == group_id))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    await db.delete(group)
    await db.commit()


# ── Members ──────────────────────────────────────────────────────────────────

@router.post("/{group_id}/members", status_code=204)
async def add_member(
    group_id: int, body: AddUserToGroupRequest,
    db: AsyncSession = Depends(get_db), _=Depends(require_admin),
):
    existing = await db.execute(
        select(UserGroup).where(UserGroup.group_id == group_id, UserGroup.user_id == body.user_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="User already in group")
    db.add(UserGroup(group_id=group_id, user_id=body.user_id, role=body.role))
    await db.commit()


@router.delete("/{group_id}/members/{user_id}", status_code=204)
async def remove_member(
    group_id: int, user_id: int,
    db: AsyncSession = Depends(get_db), _=Depends(require_admin),
):
    await db.execute(
        delete(UserGroup).where(UserGroup.group_id == group_id, UserGroup.user_id == user_id)
    )
    await db.commit()


# ── Hosts ─────────────────────────────────────────────────────────────────────

@router.post("/{group_id}/hosts", status_code=204)
async def add_host(
    group_id: int, body: AddHostToGroupRequest,
    db: AsyncSession = Depends(get_db), _=Depends(require_admin),
):
    existing = await db.execute(
        select(HostGroup).where(HostGroup.group_id == group_id, HostGroup.host_id == body.host_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Host already in group")
    db.add(HostGroup(group_id=group_id, host_id=body.host_id))
    await db.commit()


@router.delete("/{group_id}/hosts/{host_id}", status_code=204)
async def remove_host(
    group_id: int, host_id: int,
    db: AsyncSession = Depends(get_db), _=Depends(require_admin),
):
    await db.execute(
        delete(HostGroup).where(HostGroup.group_id == group_id, HostGroup.host_id == host_id)
    )
    await db.commit()
