"""
In-memory SSH session registry.

Keeps SshShellSession instances alive for LINGER_SECONDS after a WebSocket
disconnects so the browser can reconnect (e.g. after a page reload) and resume
the same shell without interruption.
"""
import asyncio
import time
import uuid
from collections import deque
from dataclasses import dataclass, field
from typing import Awaitable, Callable

LINGER_SECONDS = 300        # 5 min for normal sessions
LINGER_SECONDS_TMUX = 28800  # 8 h for tmux sessions (re-attach via ManagedSession)


@dataclass
class ManagedSession:
    shell: object           # SshShellSession
    host_id: int
    user_id: int
    session_db_id: int
    tmux_name: str | None = None
    client_ip: str | None = None
    is_ws_connected: bool = False
    output_buffer: deque = field(default_factory=lambda: deque(maxlen=500))
    recording: list = field(default_factory=list)
    rec_start: float = field(default_factory=time.monotonic)
    cleanup_task: asyncio.Task | None = None


_sessions: dict[str, ManagedSession] = {}


def create_session(shell, host_id: int, user_id: int, session_db_id: int, tmux_name: str | None = None, client_ip: str | None = None) -> tuple[str, ManagedSession]:
    key = str(uuid.uuid4())
    _sessions[key] = ManagedSession(
        shell=shell, host_id=host_id, user_id=user_id, session_db_id=session_db_id,
        tmux_name=tmux_name, client_ip=client_ip, is_ws_connected=True,
    )
    return key, _sessions[key]


def get_session(key: str) -> ManagedSession | None:
    return _sessions.get(key)


def remove_session(key: str):
    _sessions.pop(key, None)


def cancel_cleanup(managed: ManagedSession):
    if managed.cleanup_task and not managed.cleanup_task.done():
        managed.cleanup_task.cancel()
        managed.cleanup_task = None


def schedule_cleanup(
    key: str,
    managed: ManagedSession,
    on_expire: Callable[[], Awaitable[None]] | None = None,
):
    cancel_cleanup(managed)
    linger = LINGER_SECONDS_TMUX if managed.tmux_name else LINGER_SECONDS
    managed.cleanup_task = asyncio.create_task(_do_cleanup(key, managed, on_expire, linger))


async def _do_cleanup(key: str, managed: ManagedSession, on_expire, linger: int = LINGER_SECONDS):
    try:
        await asyncio.sleep(linger)
    except asyncio.CancelledError:
        return
    await managed.shell.close()
    _sessions.pop(key, None)
    if on_expire:
        await on_expire()
