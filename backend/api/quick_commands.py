from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models.database import get_db
from models.models import QuickCommand
from models.schemas import QuickCommandCreate, QuickCommandUpdate, QuickCommandOut
from auth.dependencies import get_current_user
from models.models import User

router = APIRouter(prefix="/quick-commands", tags=["quick-commands"])


@router.get("", response_model=list[QuickCommandOut])
async def list_commands(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(QuickCommand)
        .where(QuickCommand.user_id == current_user.id)
        .order_by(QuickCommand.sort_order, QuickCommand.id)
    )
    return result.scalars().all()


@router.post("", response_model=QuickCommandOut, status_code=201)
async def create_command(
    body: QuickCommandCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cmd = QuickCommand(
        user_id=current_user.id,
        label=body.label,
        command=body.command,
        hotkey=body.hotkey or None,
        auto_enter=body.auto_enter,
        sort_order=body.sort_order,
    )
    db.add(cmd)
    await db.commit()
    await db.refresh(cmd)
    return cmd


@router.patch("/{cmd_id}", response_model=QuickCommandOut)
async def update_command(
    cmd_id: int,
    body: QuickCommandUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cmd = await db.get(QuickCommand, cmd_id)
    if not cmd or cmd.user_id != current_user.id:
        raise HTTPException(404, "Nicht gefunden")
    if body.label is not None:
        cmd.label = body.label
    if body.command is not None:
        cmd.command = body.command
    if "hotkey" in body.model_fields_set:
        cmd.hotkey = body.hotkey or None
    if body.auto_enter is not None:
        cmd.auto_enter = body.auto_enter
    if body.sort_order is not None:
        cmd.sort_order = body.sort_order
    await db.commit()
    await db.refresh(cmd)
    return cmd


@router.delete("/{cmd_id}", status_code=204)
async def delete_command(
    cmd_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cmd = await db.get(QuickCommand, cmd_id)
    if not cmd or cmd.user_id != current_user.id:
        raise HTTPException(404, "Nicht gefunden")
    await db.delete(cmd)
    await db.commit()


@router.post("/reorder", status_code=204)
async def reorder_commands(
    order: list[int],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    for i, cmd_id in enumerate(order):
        cmd = await db.get(QuickCommand, cmd_id)
        if cmd and cmd.user_id == current_user.id:
            cmd.sort_order = i
    await db.commit()
