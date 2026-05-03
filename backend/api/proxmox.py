from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from slowapi import Limiter
from slowapi.util import get_remote_address

from models.database import get_db
from models.models import ProxmoxSource, Host, HostGroup, User, UserGroup
from models.schemas import ProxmoxSourceCreate, ProxmoxSourceUpdate, ProxmoxSourceOut, ProxmoxSyncResult, HostOut
from auth.dependencies import require_admin, get_current_user
from core.crypto import encrypt, decrypt
from core import proxmox_sync

router = APIRouter(prefix="/proxmox", tags=["proxmox"])
limiter = Limiter(key_func=get_remote_address)


async def _require_sync_permission(
    source_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> tuple[User, ProxmoxSource]:
    """Admin always allowed. Members of the source's target group also allowed."""
    result = await db.execute(select(ProxmoxSource).where(ProxmoxSource.id == source_id))
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    if current_user.is_admin:
        return current_user, source

    if source.target_group_id is None:
        raise HTTPException(status_code=403, detail="Nur Admins können diese Quelle synchronisieren")

    membership = await db.execute(
        select(UserGroup).where(
            UserGroup.user_id == current_user.id,
            UserGroup.group_id == source.target_group_id,
        )
    )
    if not membership.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Kein Zugriff auf diese Import-Quelle")

    return current_user, source


def _out(s: ProxmoxSource) -> ProxmoxSourceOut:
    return ProxmoxSourceOut.model_validate(s)


@router.get("", response_model=list[ProxmoxSourceOut])
async def list_sources(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admins see all sources. Regular users see only sources whose target group they belong to."""
    if current_user.is_admin:
        result = await db.execute(select(ProxmoxSource).order_by(ProxmoxSource.name))
        return [_out(s) for s in result.scalars().all()]

    memberships = await db.execute(
        select(UserGroup.group_id).where(UserGroup.user_id == current_user.id)
    )
    group_ids = [r[0] for r in memberships.all()]
    if not group_ids:
        return []

    result = await db.execute(
        select(ProxmoxSource)
        .where(ProxmoxSource.target_group_id.in_(group_ids))
        .order_by(ProxmoxSource.name)
    )
    return [_out(s) for s in result.scalars().all()]


@router.post("", response_model=ProxmoxSourceOut, status_code=201)
async def create_source(body: ProxmoxSourceCreate, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    source = ProxmoxSource(
        name=body.name,
        url=body.url.rstrip("/"),
        api_token_encrypted=encrypt(body.api_token),
        verify_ssl=body.verify_ssl,
        import_qemu=body.import_qemu,
        import_lxc=body.import_lxc,
        only_running=body.only_running,
        label_filter=body.label_filter or None,
        target_group_id=body.target_group_id,
        default_ssh_port=body.default_ssh_port,
        default_ssh_user=body.default_ssh_user or None,
    )
    db.add(source)
    await db.commit()
    await db.refresh(source)
    return _out(source)


@router.patch("/{source_id}", response_model=ProxmoxSourceOut)
async def update_source(source_id: int, body: ProxmoxSourceUpdate, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    result = await db.execute(select(ProxmoxSource).where(ProxmoxSource.id == source_id))
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    if body.name is not None:
        source.name = body.name
    if body.url is not None:
        source.url = body.url.rstrip("/")
    if body.api_token is not None:
        source.api_token_encrypted = encrypt(body.api_token)
    if body.verify_ssl is not None:
        source.verify_ssl = body.verify_ssl
    if body.import_qemu is not None:
        source.import_qemu = body.import_qemu
    if body.import_lxc is not None:
        source.import_lxc = body.import_lxc
    if body.only_running is not None:
        source.only_running = body.only_running
    if body.label_filter is not None:
        source.label_filter = body.label_filter or None
    if body.target_group_id is not None:
        source.target_group_id = body.target_group_id
    if body.default_ssh_port is not None:
        source.default_ssh_port = body.default_ssh_port
    if body.default_ssh_user is not None:
        source.default_ssh_user = body.default_ssh_user or None
    await db.commit()
    await db.refresh(source)
    return _out(source)


@router.delete("/{source_id}", status_code=204)
async def delete_source(source_id: int, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    result = await db.execute(select(ProxmoxSource).where(ProxmoxSource.id == source_id))
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    await db.delete(source)
    await db.commit()


@router.get("/{source_id}/inactive-hosts", response_model=list[HostOut])
async def list_inactive_hosts(
    source_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_admin),
):
    from sqlalchemy.orm import selectinload
    from api.hosts import _host_out, _host_query
    result = await db.execute(
        _host_query()
        .where(Host.proxmox_source_id == source_id, Host.proxmox_inactive == True)  # noqa: E712
        .order_by(Host.name)
    )
    return [_host_out(h) for h in result.scalars().all()]


@router.post("/{source_id}/sync", response_model=ProxmoxSyncResult)
@limiter.limit("4/minute")
async def sync_source(
    request: Request,
    source_id: int,
    db: AsyncSession = Depends(get_db),
    auth: tuple = Depends(_require_sync_permission),
):
    _, source = auth
    token_plain = decrypt(source.api_token_encrypted)
    try:
        sync_result = await proxmox_sync.sync(source, db, token_plain)
        source.last_sync_at = datetime.utcnow()
        source.last_sync_status = f"OK – {sync_result.created} neu, {sync_result.updated} aktualisiert, {sync_result.deleted} gelöscht"
        if sync_result.errors:
            source.last_sync_status += f" ({len(sync_result.errors)} Fehler)"
        await db.commit()
        return sync_result
    except Exception as e:
        source.last_sync_at = datetime.utcnow()
        source.last_sync_status = f"Fehler: {e}"
        await db.commit()
        raise HTTPException(status_code=502, detail=str(e))
