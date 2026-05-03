from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete as sa_delete
from sqlalchemy.orm import selectinload

from models.database import get_db
from models.models import Host, HostGroup, HostKey, HostWebLink, KnownHost, ProxmoxSource, User
from models.schemas import HostCreate, HostUpdate, HostOut
from auth.dependencies import get_current_user, require_admin
from core.crypto import encrypt

router = APIRouter(prefix="/hosts", tags=["hosts"])


def _host_out(host: Host) -> HostOut:
    return HostOut(
        id=host.id,
        name=host.name,
        hostname=host.hostname,
        port=host.port,
        username=host.username,
        description=host.description,
        notes=host.notes,
        auth_method=host.auth_method,
        use_tmux=host.use_tmux or False,
        created_at=host.created_at,
        group_ids=[hg.group_id for hg in host.host_groups],
        groups=[{"id": hg.group.id, "name": hg.group.name} for hg in host.host_groups],
        web_links=[{"id": wl.id, "label": wl.label, "url": wl.url, "sort_order": wl.sort_order} for wl in host.web_links],
        proxmox_source_name=host.proxmox_source.name if host.proxmox_source else None,
        proxmox_inactive=host.proxmox_inactive,
    )


def _host_query():
    return select(Host).options(
        selectinload(Host.host_groups).selectinload(HostGroup.group),
        selectinload(Host.host_keys),
        selectinload(Host.web_links),
        selectinload(Host.proxmox_source),
    )


async def _sync_web_links(db: AsyncSession, host_id: int, links: list):
    await db.execute(sa_delete(HostWebLink).where(HostWebLink.host_id == host_id))
    for i, link in enumerate(links):
        db.add(HostWebLink(
            host_id=host_id,
            label=link.label or "Web",
            url=link.url,
            sort_order=link.sort_order if link.sort_order else i,
        ))


async def get_accessible_hosts(db: AsyncSession, user: User) -> list[Host]:
    if user.is_admin:
        result = await db.execute(_host_query().where(Host.proxmox_inactive == False).order_by(Host.name))  # noqa: E712
        return result.scalars().all()
    group_ids = [ug.group_id for ug in user.user_groups]
    if not group_ids:
        return []
    result = await db.execute(
        _host_query()
        .join(HostGroup, Host.id == HostGroup.host_id)
        .where(HostGroup.group_id.in_(group_ids), Host.proxmox_inactive == False)  # noqa: E712
        .order_by(Host.name)
    )
    return result.scalars().unique().all()


@router.get("", response_model=list[HostOut])
async def list_hosts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(User).options(selectinload(User.user_groups)).where(User.id == current_user.id)
    )
    user_with_groups = result.scalar_one()
    hosts = await get_accessible_hosts(db, user_with_groups)
    return [_host_out(h) for h in hosts]


@router.post("", response_model=HostOut, status_code=201)
async def create_host(body: HostCreate, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    host = Host(
        name=body.name,
        hostname=body.hostname,
        port=body.port,
        username=body.username or None,
        description=body.description,
        notes=body.notes,
        auth_method=body.auth_method,
        use_tmux=body.use_tmux,
    )
    if body.auth_method == "password" and body.password:
        host.password_encrypted = encrypt(body.password)
    db.add(host)
    await db.flush()
    if body.auth_method == "key" and body.ssh_key_id:
        db.add(HostKey(host_id=host.id, ssh_key_id=body.ssh_key_id))
    for gid in body.group_ids:
        db.add(HostGroup(host_id=host.id, group_id=gid))
    if body.web_links:
        await _sync_web_links(db, host.id, body.web_links)
    await db.commit()
    result = await db.execute(_host_query().where(Host.id == host.id))
    return _host_out(result.scalar_one())


@router.get("/{host_id}", response_model=HostOut)
async def get_host(host_id: int, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(_host_query().where(Host.id == host_id))
    host = result.scalar_one_or_none()
    if not host:
        raise HTTPException(status_code=404, detail="Host not found")
    return _host_out(host)


@router.patch("/{host_id}", response_model=HostOut)
async def update_host(host_id: int, body: HostUpdate, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    result = await db.execute(_host_query().where(Host.id == host_id))
    host = result.scalar_one_or_none()
    if not host:
        raise HTTPException(status_code=404, detail="Host not found")
    for field in ("name", "hostname", "port", "username", "description", "notes", "auth_method", "use_tmux"):
        val = getattr(body, field)
        if val is not None:
            setattr(host, field, val)
    if body.password is not None:
        host.password_encrypted = encrypt(body.password)
    if body.ssh_key_id is not None:
        await db.execute(sa_delete(HostKey).where(HostKey.host_id == host_id))
        db.add(HostKey(host_id=host_id, ssh_key_id=body.ssh_key_id))
    if body.group_ids is not None:
        await db.execute(sa_delete(HostGroup).where(HostGroup.host_id == host_id))
        for gid in body.group_ids:
            db.add(HostGroup(host_id=host_id, group_id=gid))
    if body.web_links is not None:
        await _sync_web_links(db, host_id, body.web_links)
    await db.commit()
    result = await db.execute(_host_query().where(Host.id == host_id))
    return _host_out(result.scalar_one())


@router.delete("/{host_id}", status_code=204)
async def delete_host(host_id: int, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    result = await db.execute(select(Host).where(Host.id == host_id))
    host = result.scalar_one_or_none()
    if not host:
        raise HTTPException(status_code=404, detail="Host not found")
    await db.delete(host)
    await db.commit()


@router.get("/{host_id}/known-host")
async def get_known_host(host_id: int, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    result = await db.execute(select(KnownHost).where(KnownHost.host_id == host_id))
    kh = result.scalar_one_or_none()
    if not kh:
        raise HTTPException(404, "Kein gespeicherter Host-Key")
    return {"id": kh.id, "key_type": kh.key_type, "fingerprint": kh.fingerprint, "added_at": kh.added_at}


@router.delete("/{host_id}/known-host", status_code=204)
async def delete_known_host(host_id: int, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    result = await db.execute(select(KnownHost).where(KnownHost.host_id == host_id))
    kh = result.scalar_one_or_none()
    if not kh:
        raise HTTPException(404, "Kein gespeicherter Host-Key")
    await db.delete(kh)
    await db.commit()


@router.post("/{host_id}/test")
async def test_connection(host_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    from core.ssh_manager import test_host_connection
    result = await db.execute(_host_query().where(Host.id == host_id))
    host = result.scalar_one_or_none()
    if not host:
        raise HTTPException(status_code=404, detail="Host not found")
    ok, message = await test_host_connection(host, db, user_id=current_user.id)
    return {"success": ok, "message": message}


@router.get("/{host_id}/ping")
async def ping_host(host_id: int, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    import asyncio
    result = await db.execute(_host_query().where(Host.id == host_id))
    host = result.scalar_one_or_none()
    if not host:
        raise HTTPException(status_code=404, detail="Host not found")
    try:
        _, writer = await asyncio.wait_for(
            asyncio.open_connection(host.hostname, host.port), timeout=20
        )
        try:
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass
        return {"reachable": True}
    except Exception:
        return {"reachable": False}
