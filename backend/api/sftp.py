import shlex
import stat
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from models.database import get_db
from models.models import Host, User
from models.schemas import SftpEntry
from auth.dependencies import get_current_user
from core.ssh_manager import open_sftp, _build_connect_kwargs

router = APIRouter(prefix="/sftp", tags=["sftp"])


async def _get_host(host_id: int, db: AsyncSession) -> Host:
    result = await db.execute(
        select(Host).options(selectinload(Host.host_keys)).where(Host.id == host_id)
    )
    host = result.scalar_one_or_none()
    if not host:
        raise HTTPException(status_code=404, detail="Host not found")
    return host


@router.get("/{host_id}/list", response_model=list[SftpEntry])
async def list_directory(
    host_id: int,
    path: str = Query("/"),
    root: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    host = await _get_host(host_id, db)
    conn, sftp = await open_sftp(host, db, user_id=current_user.id, sftp_root=root)
    try:
        entries = await sftp.readdir(path)

        # Fetch owner/group via find (single exec, no ARG_MAX limit)
        owner_map: dict[str, tuple[str, str]] = {}
        try:
            find_cmd = (
                f"find {shlex.quote(path)} -maxdepth 1 -mindepth 1 "
                f"-printf '%f|%u|%g\\n' 2>/dev/null"
            )
            find_result = await conn.run(find_cmd, check=False)
            for line in find_result.stdout.splitlines():
                parts = line.split("|", 2)
                if len(parts) == 3:
                    owner_map[parts[0]] = (parts[1], parts[2])
        except Exception:
            pass

        result = []
        for e in entries:
            if e.filename in (".", ".."):
                continue
            attrs = e.attrs
            if attrs.permissions and stat.S_ISLNK(attrs.permissions):
                try:
                    target = await sftp.stat(f"{path.rstrip('/')}/{e.filename}")
                    is_dir = stat.S_ISDIR(target.permissions) if target.permissions else False
                except Exception:
                    is_dir = False
            else:
                is_dir = stat.S_ISDIR(attrs.permissions) if attrs.permissions else False
            owner, group = owner_map.get(e.filename, (None, None))
            result.append(SftpEntry(
                name=e.filename,
                path=f"{path.rstrip('/')}/{e.filename}",
                is_dir=is_dir,
                size=attrs.size,
                modified=datetime.fromtimestamp(attrs.mtime) if attrs.mtime else None,
                permissions=oct(attrs.permissions)[-4:] if attrs.permissions else None,
                owner=owner,
                group=group,
            ))
        return sorted(result, key=lambda x: (not x.is_dir, x.name.lower()))
    finally:
        sftp.exit()
        conn.close()
        await conn.wait_closed()


@router.get("/{host_id}/download")
async def download_file(
    host_id: int,
    path: str = Query(...),
    root: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    host = await _get_host(host_id, db)
    conn, sftp = await open_sftp(host, db, user_id=current_user.id, sftp_root=root)

    async def stream():
        try:
            async with sftp.open(path, "rb") as f:
                while True:
                    chunk = await f.read(65536)
                    if not chunk:
                        break
                    yield chunk
        finally:
            sftp.exit()
            conn.close()

    filename = path.split("/")[-1]
    return StreamingResponse(
        stream(),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{host_id}/upload", status_code=204)
async def upload_file(
    host_id: int,
    path: str = Query(...),
    root: bool = Query(False),
    file: UploadFile = ...,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    host = await _get_host(host_id, db)
    conn, sftp = await open_sftp(host, db, user_id=current_user.id, sftp_root=root)
    try:
        remote_path = f"{path.rstrip('/')}/{file.filename}"
        async with sftp.open(remote_path, "wb") as f:
            while True:
                chunk = await file.read(65536)
                if not chunk:
                    break
                await f.write(chunk)
    finally:
        sftp.exit()
        conn.close()
        await conn.wait_closed()


@router.post("/{host_id}/mkdir", status_code=204)
async def make_directory(
    host_id: int,
    path: str = Query(...),
    root: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    host = await _get_host(host_id, db)
    conn, sftp = await open_sftp(host, db, user_id=current_user.id, sftp_root=root)
    try:
        await sftp.mkdir(path)
    finally:
        sftp.exit()
        conn.close()
        await conn.wait_closed()


@router.delete("/{host_id}/delete", status_code=204)
async def delete_path(
    host_id: int,
    path: str = Query(...),
    root: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    host = await _get_host(host_id, db)
    conn, sftp = await open_sftp(host, db, user_id=current_user.id, sftp_root=root)
    try:
        attrs = await sftp.stat(path)
        if stat.S_ISDIR(attrs.permissions):
            await sftp.rmtree(path)
        else:
            await sftp.remove(path)
    finally:
        sftp.exit()
        conn.close()
        await conn.wait_closed()


@router.post("/{host_id}/copy", status_code=204)
async def copy_path(
    host_id: int,
    src: str = Query(...),
    dst: str = Query(...),
    root: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import asyncssh
    host = await _get_host(host_id, db)
    kwargs = await _build_connect_kwargs(host, db, user_id=current_user.id)
    conn = await asyncssh.connect(**{**kwargs, "known_hosts": None, "connect_timeout": 30})
    try:
        cmd = f"{'sudo ' if root else ''}cp -r {shlex.quote(src)} {shlex.quote(dst)}"
        result = await conn.run(cmd)
        if result.exit_status != 0:
            raise HTTPException(400, detail=result.stderr or "Kopieren fehlgeschlagen")
    finally:
        conn.close()
        await conn.wait_closed()


@router.get("/{host_id}/cwd")
async def get_cwd(
    host_id: int,
    session_key: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from core import session_manager
    managed = session_manager.get_session(session_key)
    if not managed or managed.host_id != host_id or managed.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Session not found")

    cmd = (
        "pty_pid=$(ps -o pid=,tty= --ppid $PPID 2>/dev/null | awk '$2 ~ /pts/ {print $1}' | head -1); "
        'if [ -n "$pty_pid" ]; then readlink /proc/$pty_pid/cwd 2>/dev/null || echo $HOME; '
        "else echo $HOME; fi"
    )
    try:
        result = await managed.shell.conn.run(cmd, check=False)
        path = result.stdout.strip()
    except Exception:
        path = ""

    if not path or not path.startswith("/"):
        path = "/"
    return {"path": path}


@router.post("/{host_id}/rename", status_code=204)
async def rename_path(
    host_id: int,
    old_path: str = Query(...),
    new_path: str = Query(...),
    root: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    host = await _get_host(host_id, db)
    conn, sftp = await open_sftp(host, db, user_id=current_user.id, sftp_root=root)
    try:
        await sftp.rename(old_path, new_path)
    finally:
        sftp.exit()
        conn.close()
        await conn.wait_closed()
