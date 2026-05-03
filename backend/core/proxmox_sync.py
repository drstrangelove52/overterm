from __future__ import annotations

import httpx
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete as sa_delete, update as sa_update
from sqlalchemy.orm import selectinload

from models.models import ProxmoxSource, Host, HostGroup, HostWebLink, Group
from models.schemas import ProxmoxSyncResult


def _headers(token: str) -> dict:
    return {"Authorization": f"PVEAPIToken={token}"}


async def _get(client: httpx.AsyncClient, base: str, path: str) -> dict:
    r = await client.get(f"{base}/api2/json{path}")
    r.raise_for_status()
    return r.json().get("data", {})


def _parse_web_links(notes: str | None) -> list[dict]:
    """Extract web links from VM notes. Formats:
      web: https://url          → label "Web"
      web UI: https://url       → label "UI"
      web Admin: https://url    → label "Admin"
    Handles both newline and <br> separators (Proxmox API quirk).
    """
    if not notes:
        return []
    # Normalize: replace <br> variants with newlines
    import re
    normalized = re.sub(r"<br\s*/?>", "\n", notes, flags=re.IGNORECASE)
    links = []
    sort = 0
    for line in normalized.splitlines():
        stripped = line.strip()
        if not stripped.lower().startswith("web"):
            continue
        rest = stripped[3:].strip()  # everything after "web"
        if rest.startswith(":"):
            label, url = "Web", rest[1:].strip()
        elif ":" in rest:
            # Split only on first colon, but the URL contains colons (https:)
            # so we look for "label: https://..." pattern
            match = re.match(r'^([^:]+):\s*(https?://.+)$', rest, re.IGNORECASE)
            if match:
                label, url = match.group(1).strip() or "Web", match.group(2).strip()
            else:
                continue
        else:
            continue
        if url:
            links.append({"label": label, "url": url, "sort_order": sort})
            sort += 1
    return links


def _tags(tag_str: str | None) -> set[str]:
    if not tag_str:
        return set()
    return {t.strip().lower() for t in tag_str.split(";") if t.strip()}


def _first_ipv4(interfaces: list) -> str | None:
    for iface in interfaces:
        name = iface.get("name", "")
        if name in ("lo", "loopback"):
            continue
        for addr in iface.get("ip-addresses", []):
            if addr.get("ip-address-type") == "ipv4":
                ip = addr.get("ip-address", "")
                if ip and not ip.startswith("127."):
                    return ip
    return None


async def sync(source: ProxmoxSource, db: AsyncSession, api_token_plain: str) -> ProxmoxSyncResult:
    from core.crypto import decrypt

    result = ProxmoxSyncResult(created=0, updated=0, deleted=0)
    base = source.url.rstrip("/")
    label = source.label_filter.strip().lower() if source.label_filter else None

    async with httpx.AsyncClient(
        headers=_headers(api_token_plain),
        verify=source.verify_ssl,
        timeout=15,
    ) as client:
        try:
            nodes_data = await _get(client, base, "/nodes")
        except Exception as e:
            raise RuntimeError(f"Proxmox-Verbindung fehlgeschlagen: {e}")

        nodes = [n["node"] for n in nodes_data] if isinstance(nodes_data, list) else []
        seen_vmids: set[int] = set()

        for node in nodes:
            vm_types = []
            if source.import_qemu:
                vm_types.append(("qemu", "qemu"))
            if source.import_lxc:
                vm_types.append(("lxc", "lxc"))

            for vtype, vpath in vm_types:
                try:
                    vms = await _get(client, base, f"/nodes/{node}/{vpath}")
                except Exception as e:
                    result.errors.append(f"{node}/{vpath}: {e}")
                    continue

                if not isinstance(vms, list):
                    continue

                for vm in vms:
                    vmid = int(vm.get("vmid", 0))
                    if not vmid:
                        continue

                    status = vm.get("status", "")
                    if source.only_running and status != "running":
                        continue

                    vm_tags = _tags(vm.get("tags"))
                    if label and label not in vm_tags:
                        continue

                    seen_vmids.add(vmid)
                    vm_name = vm.get("name", f"vm-{vmid}")

                    # Get VM config for notes (web links)
                    web_links = []
                    try:
                        cfg = await _get(client, base, f"/nodes/{node}/{vpath}/{vmid}/config")
                        notes = cfg.get("description") or cfg.get("notes")
                        web_links = _parse_web_links(notes)
                    except Exception:
                        pass

                    # Get IP address
                    hostname = vm_name
                    if vtype == "qemu" and status == "running":
                        try:
                            iface_data = await _get(client, base, f"/nodes/{node}/qemu/{vmid}/agent/network-get-interfaces")
                            interfaces = iface_data.get("result", []) if isinstance(iface_data, dict) else []
                            ip = _first_ipv4(interfaces)
                            if ip:
                                hostname = ip
                        except Exception:
                            pass
                    elif vtype == "lxc":
                        try:
                            ifaces = await _get(client, base, f"/nodes/{node}/lxc/{vmid}/interfaces")
                            if isinstance(ifaces, list):
                                for iface in ifaces:
                                    if iface.get("name") in ("lo",):
                                        continue
                                    raw_ip = iface.get("ip", "")
                                    ip = raw_ip.split("/")[0] if "/" in raw_ip else raw_ip
                                    if ip and not ip.startswith("127."):
                                        hostname = ip
                                        break
                        except Exception:
                            pass

                    # Upsert host
                    existing = await db.execute(
                        select(Host)
                        .options(selectinload(Host.host_groups))
                        .where(
                            Host.proxmox_source_id == source.id,
                            Host.proxmox_vmid == vmid,
                        )
                    )
                    host = existing.scalar_one_or_none()
                    is_new = host is None

                    if not is_new:
                        host.name = vm_name
                        host.hostname = hostname
                        host.port = source.default_ssh_port
                        if source.default_ssh_user:
                            host.username = source.default_ssh_user
                        if host.proxmox_inactive:
                            host.proxmox_inactive = False
                        result.updated += 1
                    else:
                        host = Host(
                            name=vm_name,
                            hostname=hostname,
                            port=source.default_ssh_port,
                            username=source.default_ssh_user,
                            description=f"Proxmox {vtype.upper()} (VMID {vmid}) on {node}",
                            auth_method="none",
                            proxmox_source_id=source.id,
                            proxmox_vmid=vmid,
                        )
                        db.add(host)
                        await db.flush()
                        result.created += 1

                    # Sync web links (replace all on every sync to reflect notes changes)
                    await db.execute(sa_delete(HostWebLink).where(HostWebLink.host_id == host.id))
                    for i, lnk in enumerate(web_links):
                        db.add(HostWebLink(host_id=host.id, label=lnk["label"], url=lnk["url"], sort_order=i))

                    # Assign target group — for new hosts the collection is empty, skip check
                    if source.target_group_id:
                        already = (not is_new) and any(
                            hg.group_id == source.target_group_id for hg in host.host_groups
                        )
                        if not already:
                            db.add(HostGroup(host_id=host.id, group_id=source.target_group_id))

        # Deactivate hosts from this source that are no longer in Proxmox (soft delete).
        stale_q = select(Host.id).where(
            Host.proxmox_source_id == source.id,
            Host.proxmox_inactive == False,  # noqa: E712
            Host.proxmox_vmid.notin_(seen_vmids) if seen_vmids else Host.proxmox_vmid.isnot(None),
        )
        stale_ids_result = await db.execute(stale_q)
        stale_ids = [row[0] for row in stale_ids_result.all()]
        if stale_ids:
            await db.execute(sa_update(Host).where(Host.id.in_(stale_ids)).values(proxmox_inactive=True))
            result.deleted += len(stale_ids)

        await db.commit()
    return result
