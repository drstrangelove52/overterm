import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete as sa_delete

from models.database import get_db
from models.models import (
    User, Group, UserGroup, Host, HostGroup, HostKey, HostWebLink,
    SshKey, ProxmoxSource, UserCredential, UserGroupCredential, QuickCommand, AppSettings,
)
from models.schemas import AppSettingsOut, AppSettingsUpdate
from auth.dependencies import require_admin

router = APIRouter(prefix="/admin", tags=["admin"])

BACKUP_VERSION = 1


def _row_to_dict(row):
    d = {}
    for col in row.__table__.columns:
        val = getattr(row, col.name)
        if isinstance(val, datetime):
            val = val.isoformat()
        d[col.name] = val
    return d


async def _dump(db: AsyncSession, model):
    result = await db.execute(select(model))
    return [_row_to_dict(r) for r in result.scalars().all()]


def _parse_dt(val):
    if val is None or isinstance(val, datetime):
        return val
    return datetime.fromisoformat(val)


@router.get("/backup")
async def export_backup(db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    data = {
        "version": BACKUP_VERSION,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "users": await _dump(db, User),
        "groups": await _dump(db, Group),
        "user_groups": await _dump(db, UserGroup),
        "ssh_keys": await _dump(db, SshKey),
        "proxmox_sources": await _dump(db, ProxmoxSource),
        "hosts": await _dump(db, Host),
        "host_groups": await _dump(db, HostGroup),
        "host_web_links": await _dump(db, HostWebLink),
        "host_keys": await _dump(db, HostKey),
        "user_credentials": await _dump(db, UserCredential),
        "user_group_credentials": await _dump(db, UserGroupCredential),
        "quick_commands": await _dump(db, QuickCommand),
    }
    filename = f"overterm-backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    return JSONResponse(
        content=data,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/restore", status_code=204)
async def import_backup(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_admin),
):
    try:
        data = json.loads(await file.read())
    except Exception:
        raise HTTPException(400, "Ungültige Backup-Datei")

    if data.get("version") != BACKUP_VERSION:
        raise HTTPException(400, f"Nicht unterstützte Version: {data.get('version')}")

    # Delete in reverse dependency order
    for model in (
        QuickCommand, UserGroupCredential, UserCredential,
        HostKey, HostWebLink, HostGroup,
        UserGroup, Host, SshKey, ProxmoxSource, Group, User,
    ):
        await db.execute(sa_delete(model))
    await db.commit()

    # Re-insert in dependency order
    dt_fields = {
        "users": ("created_at", "updated_at"),
        "groups": ("created_at",),
        "proxmox_sources": ("last_sync_at", "created_at"),
        "ssh_keys": ("created_at",),
        "hosts": ("created_at", "updated_at"),
        "user_credentials": ("created_at", "updated_at"),
        "user_group_credentials": ("updated_at",),
        "quick_commands": ("created_at",),
    }
    model_map = {
        "users": User,
        "groups": Group,
        "user_groups": UserGroup,
        "proxmox_sources": ProxmoxSource,
        "ssh_keys": SshKey,
        "hosts": Host,
        "host_groups": HostGroup,
        "host_web_links": HostWebLink,
        "host_keys": HostKey,
        "user_credentials": UserCredential,
        "user_group_credentials": UserGroupCredential,
        "quick_commands": QuickCommand,
    }

    for key, model in model_map.items():
        for row in data.get(key, []):
            row = dict(row)
            for field in dt_fields.get(key, ()):
                if field in row:
                    row[field] = _parse_dt(row[field])
            db.add(model(**row))
        await db.flush()

    await db.commit()


@router.get("/settings", response_model=AppSettingsOut)
async def get_settings(db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    result = await db.execute(select(AppSettings).where(AppSettings.id == 1))
    s = result.scalar_one_or_none()
    if not s:
        s = AppSettings(id=1, sync_interval_minutes=360)
        db.add(s)
        await db.commit()
        await db.refresh(s)
    return s


@router.patch("/settings", response_model=AppSettingsOut)
async def update_settings(
    body: AppSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_admin),
):
    if body.sync_interval_minutes < 0:
        raise HTTPException(400, "Intervall darf nicht negativ sein")
    result = await db.execute(select(AppSettings).where(AppSettings.id == 1))
    s = result.scalar_one_or_none()
    if not s:
        s = AppSettings(id=1)
        db.add(s)
    s.sync_interval_minutes = body.sync_interval_minutes
    await db.commit()
    await db.refresh(s)
    return s
