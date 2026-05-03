import asyncio
import logging
from datetime import datetime, timedelta

from sqlalchemy import select

from models.database import AsyncSessionLocal
from models.models import AppSettings, ProxmoxSource
from core.crypto import decrypt
from core import proxmox_sync

logger = logging.getLogger("sync_scheduler")

CHECK_INTERVAL = 5 * 60  # check every 5 minutes


async def _get_interval_minutes() -> int:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(AppSettings).where(AppSettings.id == 1))
        s = result.scalar_one_or_none()
        return s.sync_interval_minutes if s else 360


async def _sync_all():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(ProxmoxSource))
        sources = result.scalars().all()
        for source in sources:
            try:
                token_plain = decrypt(source.api_token_encrypted)
                sync_result = await proxmox_sync.sync(source, db, token_plain)
                source.last_sync_at = datetime.utcnow()
                source.last_sync_status = (
                    f"Auto-Sync OK – {sync_result.created} neu, "
                    f"{sync_result.updated} aktualisiert, {sync_result.deleted} gelöscht"
                )
                if sync_result.errors:
                    source.last_sync_status += f" ({len(sync_result.errors)} Fehler)"
                logger.info("Auto-synced %s: %s", source.name, source.last_sync_status)
            except Exception as e:
                source.last_sync_at = datetime.utcnow()
                source.last_sync_status = f"Auto-Sync Fehler: {e}"
                logger.error("Auto-sync failed for %s: %s", source.name, e)
        await db.commit()


async def run():
    logger.info("Sync scheduler started (check interval: %ds)", CHECK_INTERVAL)
    while True:
        await asyncio.sleep(CHECK_INTERVAL)
        try:
            interval_minutes = await _get_interval_minutes()
            if interval_minutes == 0:
                continue

            async with AsyncSessionLocal() as db:
                result = await db.execute(select(ProxmoxSource))
                sources = result.scalars().all()

            threshold = datetime.utcnow() - timedelta(minutes=interval_minutes)
            due = [s for s in sources if s.last_sync_at is None or s.last_sync_at < threshold]
            if due:
                logger.info("%d source(s) due for auto-sync", len(due))
                await _sync_all()
        except Exception as e:
            logger.error("Sync scheduler error: %s", e)
