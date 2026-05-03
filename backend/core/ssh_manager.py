import asyncio
import asyncssh
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from core.crypto import decrypt


def _import_key(key_row):
    pem = decrypt(key_row.private_key_encrypted)
    passphrase = decrypt(key_row.passphrase_encrypted) if key_row.passphrase_encrypted else None
    return asyncssh.import_private_key(pem, passphrase=passphrase)


async def _build_connect_kwargs(host, db: AsyncSession, user_id: int | None = None) -> dict:
    from models.models import SshKey, UserCredential, UserGroupCredential, HostGroup

    # 1. Host-specific personal credentials (highest priority)
    cred = None
    if user_id:
        result = await db.execute(
            select(UserCredential).where(
                UserCredential.user_id == user_id,
                UserCredential.host_id == host.id,
            )
        )
        cred = result.scalar_one_or_none()

    # 2. Group-level personal credentials (fallback)
    if not cred and user_id:
        result = await db.execute(
            select(UserGroupCredential)
            .join(HostGroup, HostGroup.group_id == UserGroupCredential.group_id)
            .where(
                UserGroupCredential.user_id == user_id,
                HostGroup.host_id == host.id,
            )
            .limit(1)
        )
        cred = result.scalar_one_or_none()

    # Personal credentials take priority over shared host credentials
    if cred:
        username = cred.username or host.username
        kwargs = {
            "host": host.hostname,
            "port": host.port,
            "username": username,
            "known_hosts": None,
        }
        if cred.auth_method == "password" and cred.password_encrypted:
            kwargs["password"] = decrypt(cred.password_encrypted)
        elif cred.auth_method == "key" and cred.ssh_key_id:
            result = await db.execute(select(SshKey).where(SshKey.id == cred.ssh_key_id))
            key_row = result.scalar_one_or_none()
            if key_row:
                kwargs["client_keys"] = [_import_key(key_row)]
    elif host.auth_method != "none" and host.username:
        kwargs = {
            "host": host.hostname,
            "port": host.port,
            "username": host.username,
            "known_hosts": None,
        }
        if host.auth_method == "password" and host.password_encrypted:
            kwargs["password"] = decrypt(host.password_encrypted)
        elif host.auth_method == "key" and host.host_keys:
            ssh_key_id = host.host_keys[0].ssh_key_id
            result = await db.execute(select(SshKey).where(SshKey.id == ssh_key_id))
            key_row = result.scalar_one_or_none()
            if key_row:
                kwargs["client_keys"] = [_import_key(key_row)]
    else:
        raise ValueError(
            "Keine Zugangsdaten verfügbar. Bitte persönliche Zugangsdaten unter 'Meine Zugangsdaten' hinterlegen."
        )

    return kwargs


async def test_host_connection(host, db: AsyncSession, user_id: int | None = None) -> tuple[bool, str]:
    try:
        kwargs = await _build_connect_kwargs(host, db, user_id)
        async with asyncssh.connect(**kwargs) as conn:
            await conn.run("echo ok", check=True)
        return True, "Connection successful"
    except asyncssh.DisconnectError as e:
        return False, f"SSH error: {e}"
    except Exception as e:
        return False, str(e)


async def open_shell(host, db: AsyncSession, term_type: str = "xterm-256color", cols: int = 80, rows: int = 24):
    kwargs = await _build_connect_kwargs(host, db)
    conn = await asyncssh.connect(**kwargs)
    channel = await conn.create_session(
        asyncssh.SSHClientSession,
        request_pty=True,
        term_type=term_type,
        term_size=(cols, rows),
    )
    return conn, channel


class SshShellSession:
    """Manages a single interactive SSH shell session."""

    def __init__(self):
        self.conn = None
        self.process = None
        self.server_fingerprint: str | None = None
        self.server_key_type: str | None = None

    async def connect(self, host, db: AsyncSession, cols: int = 80, rows: int = 24, user_id: int | None = None, tmux_name: str | None = None):
        kwargs = await _build_connect_kwargs(host, db, user_id)

        # Use known_hosts=[] so asyncssh runs key validation (not skipped),
        # which triggers validate_host_public_key on our client subclass.
        # With known_hosts=None asyncssh skips validation entirely and never
        # exposes the server's key.
        fp_holder: dict = {}

        class _CaptureKeyClient(asyncssh.SSHClient):
            def validate_host_public_key(self, host, addr, port, key):
                fp_holder["fp"] = key.get_fingerprint()
                fp_holder["alg"] = key.get_algorithm()
                return True  # accept all, we do our own verification

        conn_kwargs = {**kwargs, "known_hosts": [], "connect_timeout": 30}
        self.conn, _ = await asyncssh.create_connection(_CaptureKeyClient, **conn_kwargs)
        self.server_fingerprint = fp_holder.get("fp")
        self.server_key_type = fp_holder.get("alg")

        # With tmux: run the shell inside a persistent tmux session.
        # If the base session already exists, create a new grouped session (-t)
        # instead of attaching directly.  Grouped sessions share windows but
        # each has its own terminal size, so multiple simultaneous clients never
        # cause the "dots and lines" resize artefacts.
        # If the base session does not exist yet, create it (-s).
        command = (
            f"tmux has-session -t {tmux_name} 2>/dev/null"
            f" && tmux new-session -t {tmux_name}"
            f" || tmux new-session -s {tmux_name}"
        ) if tmux_name else None
        self.process = await self.conn.create_process(
            command,
            term_type="xterm-256color",
            term_size=(cols, rows),
        )

    async def write(self, data: str):
        if self.process:
            self.process.stdin.write(data)

    async def read(self) -> str | None:
        if self.process:
            try:
                return await asyncio.wait_for(self.process.stdout.read(4096), timeout=0.05)
            except asyncio.TimeoutError:
                return None
        return None

    def resize(self, cols: int, rows: int):
        if self.process:
            self.process.change_terminal_size(cols, rows)

    async def close(self):
        if self.process:
            self.process.close()
        if self.conn:
            self.conn.close()
            await self.conn.wait_closed()


_SFTP_ROOT_CMD = (
    "sudo /usr/lib/openssh/sftp-server 2>/dev/null || "
    "sudo /usr/libexec/openssh/sftp-server 2>/dev/null || "
    "sudo /usr/libexec/sftp-server"
)


async def open_sftp(host, db: AsyncSession, user_id: int | None = None, sftp_root: bool = False):
    import asyncio
    from asyncssh.sftp import start_sftp_client as _sftp_start, MIN_SFTP_VERSION
    kwargs = await _build_connect_kwargs(host, db, user_id)
    conn = await asyncssh.connect(**kwargs)
    if sftp_root:
        writer, reader, _ = await conn.open_session(command=_SFTP_ROOT_CMD, encoding=None)
        sftp = await _sftp_start(conn, asyncio.get_running_loop(), reader, writer,
                                 'utf-8', 'strict', MIN_SFTP_VERSION)
    else:
        sftp = await conn.start_sftp_client()
    return conn, sftp
