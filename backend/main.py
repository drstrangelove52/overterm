import asyncio
import socket
import time
import resource as _resource
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from passlib.context import CryptContext
from sqlalchemy import select

_START_TIME = time.monotonic()
_APP_VERSION = "1.1.0"


def _get_hostname() -> str:
    try:
        return open("/etc/hostname").read().strip()
    except Exception:
        return socket.gethostname()

from core.config import settings
from models.database import engine, AsyncSessionLocal, Base
from models.models import User  # noqa: F401 – ensures all models are registered
import models.models  # registers all ORM models

from api.auth import router as auth_router
from api.users import router as users_router
from api.hosts import router as hosts_router
from api.ssh_keys import router as keys_router
from api.sessions import router as sessions_router
from api.terminal import router as terminal_router
from api.sftp import router as sftp_router
from api.groups import router as groups_router
from api.credentials import router as credentials_router
from api.group_credentials import router as group_credentials_router
from api.proxmox import router as proxmox_router
from api.admin import router as admin_router
from api.quick_commands import router as quick_commands_router
from core import sync_scheduler

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def _create_initial_admin():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User))
        if result.first():
            return
        admin = User(
            username=settings.first_admin_username,
            email=settings.first_admin_email,
            password_hash=pwd_context.hash(settings.first_admin_password),
            is_admin=True,
            is_active=True,
        )
        db.add(admin)
        await db.commit()
        print(f"[startup] Created initial admin: {settings.first_admin_username}")


async def _run_migrations():
    """Lightweight inline migrations for schema additions without Alembic."""
    from sqlalchemy import text
    async with engine.begin() as conn:
        await conn.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
            "totp_recovery_codes TEXT NULL"
        ))
        await conn.execute(text(
            "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS "
            "sync_interval_minutes INTEGER DEFAULT 360"
        ))
        # Migrate existing hours value to minutes — only runs if the old column exists
        col_exists = await conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_settings' "
            "AND COLUMN_NAME = 'sync_interval_hours'"
        ))
        if col_exists.scalar():
            await conn.execute(text(
                "UPDATE app_settings SET sync_interval_minutes = sync_interval_hours * 60 "
                "WHERE sync_interval_minutes = 360 AND sync_interval_hours != 6"
            ))
        await conn.execute(text(
            "ALTER TABLE hosts ADD COLUMN IF NOT EXISTS use_tmux BOOLEAN NOT NULL DEFAULT 0"
        ))
        await conn.execute(text(
            "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tmux_name VARCHAR(64) NULL"
        ))
        await conn.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS language VARCHAR(5) NOT NULL DEFAULT 'de'"
        ))
        await conn.execute(text(
            "ALTER TABLE hosts ADD COLUMN IF NOT EXISTS proxmox_inactive BOOLEAN NOT NULL DEFAULT 0"
        ))


async def _close_stale_tmux_sessions():
    """Mark all open tmux sessions as ended on startup — they don't survive a restart."""
    from sqlalchemy import update
    from models.models import Session
    from datetime import datetime, timezone
    async with AsyncSessionLocal() as db:
        await db.execute(
            update(Session)
            .where(Session.tmux_name.isnot(None), Session.ended_at.is_(None))
            .values(ended_at=datetime.now(timezone.utc))
        )
        await db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _run_migrations()
    await _close_stale_tmux_sessions()
    await _create_initial_admin()
    task = asyncio.create_task(sync_scheduler.run())
    yield
    task.cancel()


limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="OverTerm API",
    version="1.0.0",
    lifespan=lifespan,
    redoc_url=None,  # override below with pinned version
)


@app.get("/redoc", include_in_schema=False)
async def redoc_html():
    from fastapi.openapi.docs import get_redoc_html
    return get_redoc_html(
        openapi_url="/openapi.json",
        title="OverTerm API",
        redoc_js_url="https://cdn.jsdelivr.net/npm/redoc@2.1.5/bundles/redoc.standalone.js",
    )

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(hosts_router, prefix="/api")
app.include_router(keys_router, prefix="/api")
app.include_router(sessions_router, prefix="/api")
app.include_router(terminal_router)
app.include_router(sftp_router, prefix="/api")
app.include_router(groups_router, prefix="/api")
app.include_router(credentials_router, prefix="/api")
app.include_router(group_credentials_router, prefix="/api")
app.include_router(proxmox_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(quick_commands_router, prefix="/api")


@app.get("/health")
async def health():
    from sqlalchemy import text
    from core import session_manager

    db_ok = False
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        pass

    sessions = list(session_manager._sessions.values())
    active_ws = sum(1 for s in sessions if s.is_ws_connected)
    lingering = sum(1 for s in sessions if not s.is_ws_connected)

    mem_kb = _resource.getrusage(_resource.RUSAGE_SELF).ru_maxrss
    mem_mb = round(mem_kb / 1024, 1)

    uptime_s = int(time.monotonic() - _START_TIME)

    return {
        "status": "ok" if db_ok else "degraded",
        "version": _APP_VERSION,
        "hostname": settings.server_name or _get_hostname(),
        "db": "ok" if db_ok else "error",
        "active_sessions": active_ws,
        "lingering_sessions": lingering,
        "memory_mb": mem_mb,
        "uptime_seconds": uptime_s,
    }
