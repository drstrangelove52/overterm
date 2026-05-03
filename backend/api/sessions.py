from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload

from models.database import get_db
from models.models import Session, User, SessionRecording
from models.schemas import SessionOut, SessionRecordingOut, ActiveSessionOut
from auth.dependencies import get_current_user

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("/active", response_model=list[ActiveSessionOut])
async def list_active_sessions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from core import session_manager
    query = (
        select(Session)
        .options(selectinload(Session.host), selectinload(Session.user))
        .where(Session.tmux_name.isnot(None), Session.ended_at.is_(None))
        .order_by(Session.started_at.desc())
    )
    if not current_user.is_admin:
        query = query.where(Session.user_id == current_user.id)
    result = await db.execute(query)
    sessions = result.scalars().all()
    tmux_clients: dict[str, list[str]] = {}
    for m in session_manager._sessions.values():
        if m.tmux_name and m.is_ws_connected and m.client_ip:
            tmux_clients.setdefault(m.tmux_name, []).append(m.client_ip)
    return [
        ActiveSessionOut(
            id=s.id,
            host_id=s.host_id,
            host_name=s.host.name if s.host else "Unbekannt",
            host_hostname=s.host.hostname if s.host else None,
            user_id=s.user_id,
            username=s.user.username if s.user else "Unbekannt",
            started_at=s.started_at,
            tmux_name=s.tmux_name,
            connected_clients=tmux_clients.get(s.tmux_name, []),
        )
        for s in sessions
    ]


@router.delete("/active/{session_id}", status_code=204)
async def dismiss_active_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from core import session_manager
    from core.ssh_manager import _build_connect_kwargs
    import asyncssh

    query = select(Session).options(selectinload(Session.host)).where(Session.id == session_id)
    if not current_user.is_admin:
        query = query.where(Session.user_id == current_user.id)
    result = await db.execute(query)
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(404, "Session not found")

    # Cancel any in-memory ManagedSession for this tmux_name
    if s.tmux_name:
        for key, m in list(session_manager._sessions.items()):
            if m.tmux_name == s.tmux_name and m.user_id == current_user.id:
                session_manager.cancel_cleanup(m)
                await m.shell.close()
                session_manager.remove_session(key)

    # Kill the tmux session on the remote host via a non-interactive SSH exec
    if s.tmux_name and s.host:
        try:
            kwargs = await _build_connect_kwargs(s.host, db, current_user.id)
            conn = await asyncssh.connect(**{**kwargs, "known_hosts": None, "connect_timeout": 5})
            await conn.run(f"tmux kill-session -t {s.tmux_name} 2>/dev/null || true", check=False)
            conn.close()
        except Exception:
            pass  # best-effort; still mark as ended

    s.ended_at = datetime.now(timezone.utc)
    await db.commit()


def _session_out(s: Session) -> SessionOut:
    return SessionOut(
        id=s.id,
        user_id=s.user_id,
        host_id=s.host_id,
        started_at=s.started_at,
        ended_at=s.ended_at,
        client_ip=s.client_ip,
        session_type=s.session_type,
        username=s.user.username if s.user else None,
        host_name=s.host.name if s.host else None,
        has_recording=s.recording is not None,
        tmux_name=s.tmux_name,
    )


@router.get("", response_model=list[SessionOut])
async def list_sessions(
    limit: int = Query(100, le=500),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        select(Session)
        .options(selectinload(Session.user), selectinload(Session.host), selectinload(Session.recording))
        .order_by(Session.started_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if not current_user.is_admin:
        query = query.where(Session.user_id == current_user.id)
    result = await db.execute(query)
    return [_session_out(s) for s in result.scalars().all()]


@router.delete("/{session_id}", status_code=204)
async def delete_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from auth.dependencies import require_admin
    if not current_user.is_admin:
        raise HTTPException(403, "Forbidden")
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Session not found")
    await db.delete(session)
    await db.commit()


class BulkDeleteRequest(BaseModel):
    ids: list[int]


@router.post("/bulk-delete", status_code=204)
async def bulk_delete_sessions(
    body: BulkDeleteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(403, "Forbidden")
    if body.ids:
        await db.execute(delete(Session).where(Session.id.in_(body.ids)))
        await db.commit()


@router.get("/{session_id}/recording", response_model=SessionRecordingOut)
async def get_recording(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Session).options(selectinload(Session.recording)).where(Session.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Session not found")
    if not current_user.is_admin and session.user_id != current_user.id:
        raise HTTPException(403, "Forbidden")
    if not session.recording:
        raise HTTPException(404, "No recording available")
    return session.recording
