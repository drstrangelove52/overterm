import asyncio
import json
import logging
import time
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

logger = logging.getLogger("terminal")

from models.database import AsyncSessionLocal
from models.models import Host, Session as SessionModel, KnownHost, SessionRecording
from auth.dependencies import SESSION_COOKIE_NAME
from auth.session import validate_session
from core.ssh_manager import SshShellSession
from core import session_manager

router = APIRouter(tags=["terminal"])


async def _get_host_and_user(websocket: WebSocket, host_id: int, db: AsyncSession):
    token = websocket.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        return None, None
    user_id = await validate_session(db, token)
    if not user_id:
        return None, None
    result = await db.execute(
        select(Host).options(selectinload(Host.host_keys)).where(Host.id == host_id)
    )
    host = result.scalar_one_or_none()
    return user_id, host


async def _check_host_key(host_id: int, shell: SshShellSession, db: AsyncSession) -> dict:
    fp = shell.server_fingerprint
    if not fp:
        return {"status": "ok"}

    result = await db.execute(select(KnownHost).where(KnownHost.host_id == host_id))
    known = result.scalars().all()

    if not known:
        db.add(KnownHost(host_id=host_id, key_type=shell.server_key_type or "unknown", fingerprint=fp))
        await db.commit()
        return {"status": "new", "fingerprint": fp}

    stored_fps = {k.fingerprint for k in known}
    if fp in stored_fps:
        return {"status": "ok"}

    return {"status": "changed", "fingerprint": fp, "stored_fingerprint": next(iter(stored_fps))}


async def _update_known_host(host_id: int, shell: SshShellSession, db: AsyncSession):
    fp = shell.server_fingerprint
    if not fp:
        return
    result = await db.execute(select(KnownHost).where(KnownHost.host_id == host_id))
    for k in result.scalars().all():
        await db.delete(k)
    db.add(KnownHost(host_id=host_id, key_type=shell.server_key_type or "unknown", fingerprint=fp))
    await db.commit()


async def _save_session_end(session_db_id: int, recording: list):
    async with AsyncSessionLocal() as db:
        s = await db.get(SessionModel, session_db_id)
        if s and not s.ended_at:
            s.ended_at = datetime.now(timezone.utc)
            await db.commit()
        if recording:
            existing = await db.execute(
                select(SessionRecording).where(SessionRecording.session_id == session_db_id)
            )
            if not existing.scalar_one_or_none():
                db.add(SessionRecording(session_id=session_db_id, data=json.dumps(recording)))
                await db.commit()


@router.websocket("/ws/ssh/{host_id}")
async def ssh_terminal(
    websocket: WebSocket,
    host_id: int,
    resume: str | None = Query(None),
    tmux_resume: str | None = Query(None),
):
    await websocket.accept()

    client_ip = (
        websocket.headers.get("x-real-ip")
        or websocket.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (websocket.client.host if websocket.client else None)
    )

    async with AsyncSessionLocal() as db:
        user_id, host = await _get_host_and_user(websocket, host_id, db)
        if not host or not user_id:
            await websocket.send_text(json.dumps({"type": "error", "data": "Unauthorized"}))
            await websocket.close()
            return

        # ── Try to resume an existing in-memory session ────────────────────────
        managed = None
        session_key = None

        if resume:
            existing = session_manager.get_session(resume)
            if existing and existing.host_id == host_id and existing.user_id == user_id:
                session_manager.cancel_cleanup(existing)
                existing.client_ip = client_ip
                existing.is_ws_connected = True
                managed = existing
                session_key = resume

        # ── Try tmux resume (cross-device or expired ManagedSession) ───────────
        if managed is None and tmux_resume:
            result = await db.execute(
                select(SessionModel).where(
                    SessionModel.tmux_name == tmux_resume,
                    SessionModel.user_id == user_id,
                    SessionModel.host_id == host_id,
                    SessionModel.ended_at.is_(None),
                )
            )
            tmux_db_session = result.scalar_one_or_none()
            if tmux_db_session:
                audit = SessionModel(user_id=user_id, host_id=host_id, client_ip=client_ip, session_type="ssh", tmux_name=tmux_resume)
                db.add(audit)
                # close the old db session record since we're re-attaching into a new one
                tmux_db_session.ended_at = datetime.now(timezone.utc)
                await db.commit()
                await db.refresh(audit)

                shell = SshShellSession()
                try:
                    await shell.connect(host, db, user_id=user_id, tmux_name=tmux_resume)
                except Exception as e:
                    logger.error("tmux resume failed for host %d user %d: %s", host_id, user_id, e, exc_info=True)
                    audit.ended_at = datetime.now(timezone.utc)
                    await db.commit()
                    try:
                        await websocket.send_text(json.dumps({"type": "error", "data": str(e)}))
                        await websocket.close()
                    except Exception:
                        pass
                    return

                session_key, managed = session_manager.create_session(shell, host_id, user_id, audit.id, tmux_name=tmux_resume, client_ip=client_ip)

        # ── New session ────────────────────────────────────────────────────────
        if managed is None:
            tmux_name = f"ot-{uuid.uuid4().hex[:12]}" if getattr(host, "use_tmux", False) else None
            audit = SessionModel(user_id=user_id, host_id=host_id, client_ip=client_ip, session_type="ssh", tmux_name=tmux_name)
            db.add(audit)
            await db.commit()
            await db.refresh(audit)

            shell = SshShellSession()
            try:
                await shell.connect(host, db, user_id=user_id, tmux_name=tmux_name)
            except Exception as e:
                logger.error("SSH connect failed for host %d user %d: %s", host_id, user_id, e, exc_info=True)
                audit.ended_at = datetime.now(timezone.utc)
                await db.commit()
                try:
                    await websocket.send_text(json.dumps({"type": "error", "data": str(e)}))
                    await websocket.close()
                except Exception:
                    pass
                return

            key_status = await _check_host_key(host_id, shell, db)
            if key_status["status"] == "new":
                await websocket.send_text(json.dumps({
                    "type": "hostkey_new",
                    "fingerprint": key_status["fingerprint"],
                }))
            elif key_status["status"] == "changed":
                await websocket.send_text(json.dumps({
                    "type": "hostkey_changed",
                    "fingerprint": key_status["fingerprint"],
                    "stored_fingerprint": key_status["stored_fingerprint"],
                }))
                try:
                    raw = await asyncio.wait_for(websocket.receive_text(), timeout=60)
                    msg = json.loads(raw)
                    if msg.get("type") == "accept_hostkey":
                        await _update_known_host(host_id, shell, db)
                    else:
                        await shell.close()
                        return
                except (asyncio.TimeoutError, Exception):
                    await shell.close()
                    return

            session_key, managed = session_manager.create_session(shell, host_id, user_id, audit.id, tmux_name=tmux_name, client_ip=client_ip)

    # ── Send session key (+ tmux_name if applicable) & replay buffer ──────────
    session_info: dict = {"type": "session_key", "key": session_key}
    if managed.tmux_name:
        session_info["tmux_name"] = managed.tmux_name
    await websocket.send_text(json.dumps(session_info))

    if resume and managed.output_buffer:
        for chunk in list(managed.output_buffer):
            await websocket.send_text(json.dumps({"type": "output", "data": chunk}))

    shell = managed.shell
    ssh_exited = False

    async def read_ssh():
        nonlocal ssh_exited
        while True:
            data = await shell.read()
            if data is None:
                continue
            if data == "":
                ssh_exited = True
                await websocket.close(1000)
                return
            offset = round(time.monotonic() - managed.rec_start, 3)
            managed.recording.append([offset, data])
            managed.output_buffer.append(data)
            await websocket.send_text(json.dumps({"type": "output", "data": data}))

    read_task = asyncio.create_task(read_ssh())
    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            if msg.get("type") == "input":
                await shell.write(msg["data"])
            elif msg.get("type") == "resize":
                shell.resize(msg.get("cols", 80), msg.get("rows", 24))
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        read_task.cancel()
        managed.is_ws_connected = False
        if ssh_exited:
            if managed.tmux_name:
                # PTY exited — distinguish detach (tmux still alive) from exit (tmux gone).
                tmux_alive = False
                try:
                    result = await managed.shell.conn.run(
                        f"tmux has-session -t {managed.tmux_name} 2>/dev/null",
                        check=False,
                    )
                    tmux_alive = (result.exit_status == 0)
                except Exception:
                    pass

                if tmux_alive:
                    # Detach: session still running, keep DB record open for re-attach.
                    session_manager.schedule_cleanup(
                        session_key,
                        managed,
                        on_expire=lambda: _save_session_end(managed.session_db_id, managed.recording),
                    )
                else:
                    # exit/kill: tmux session is truly gone — end it cleanly.
                    await shell.close()
                    session_manager.remove_session(session_key)
                    await _save_session_end(managed.session_db_id, managed.recording)
            else:
                # Non-tmux: shell exited cleanly — save and tear down immediately.
                await shell.close()
                session_manager.remove_session(session_key)
                await _save_session_end(managed.session_db_id, managed.recording)
        else:
            # Client disconnected (reload/network): keep session alive for LINGER
            session_manager.schedule_cleanup(
                session_key,
                managed,
                on_expire=lambda: _save_session_end(managed.session_db_id, managed.recording),
            )
