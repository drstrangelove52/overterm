import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { isMobile } from "../utils/device";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import useAuth from "../store/auth";
import useTabs from "../store/tabs";
import Modal from "../components/Modal";

function GridIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
      <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3A1.5 1.5 0 0 1 15 10.5v3A1.5 1.5 0 0 1 13.5 15h-3A1.5 1.5 0 0 1 9 13.5v-3z" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
      <path d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5z" />
    </svg>
  );
}

function AuthBadge({ method }) {
  const { t } = useTranslation();
  const styles = {
    key: "bg-purple-900 text-purple-300",
    none: "bg-gray-800 text-gray-500",
    password: "bg-gray-800 text-gray-400",
  };
  const labels = { key: t("dashboard.authKey"), none: t("dashboard.authPersonal"), password: t("dashboard.authPassword") };
  return (
    <span className={`text-xs px-2 py-0.5 rounded ${styles[method] ?? styles.password}`}>
      {labels[method] ?? method}
    </span>
  );
}

function SourceBadge({ name }) {
  const { t } = useTranslation();
  if (!name) return null;
  return (
    <span className="text-xs px-2 py-0.5 rounded bg-blue-900/60 text-blue-300 whitespace-nowrap" title={t("dashboard.importedFrom", { source: name })}>
      ⬇ {name}
    </span>
  );
}

function TmuxBadge() {
  return (
    <span className="text-xs px-2 py-0.5 rounded bg-yellow-900/60 text-yellow-300 whitespace-nowrap">
      tmux
    </span>
  );
}

function WebButtons({ links, small }) {
  const [open, setOpen] = useState(false);
  if (!links?.length) return null;
  const cls = small
    ? "text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded transition-colors text-emerald-400"
    : "text-xs px-2 py-1.5 bg-gray-800 hover:bg-gray-700 rounded transition-colors text-emerald-400";

  if (links.length === 1) {
    return (
      <a href={links[0].url} target="_blank" rel="noopener noreferrer" className={cls}>
        {links[0].label}
      </a>
    );
  }
  return (
    <div className="relative">
      <button onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} className={cls}>
        Web ▾
      </button>
      {open && (
        <div className="absolute z-20 bottom-full mb-1 left-0 bg-gray-800 border border-gray-700 rounded shadow-lg min-w-max"
          onMouseLeave={() => setOpen(false)}>
          {links.map((lnk) => (
            <a key={lnk.id ?? lnk.url} href={lnk.url} target="_blank" rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="block px-3 py-1.5 text-xs text-emerald-400 hover:bg-gray-700 whitespace-nowrap">
              {lnk.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusDot({ status }) {
  const { t } = useTranslation();
  if (status === undefined) return <span className="w-2 h-2 rounded-full bg-gray-600 inline-block" title={t("dashboard.statusChecking")} />;
  return status
    ? <span className="w-2 h-2 rounded-full bg-green-500 inline-block" title={t("dashboard.statusReachable")} />
    : <span className="w-2 h-2 rounded-full bg-red-500 inline-block" title={t("dashboard.statusUnreachable")} />;
}

function GroupChips({ groups }) {
  if (!groups?.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {groups.map((g) => (
        <span key={g.id} className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">
          {g.name}
        </span>
      ))}
    </div>
  );
}

// ── Bulk-assign modal ─────────────────────────────────────────────────────────

function BulkGroupModal({ selectedIds, groups, onClose, onDone }) {
  const { t } = useTranslation();
  const [groupId, setGroupId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const apply = async (e) => {
    e.preventDefault();
    if (!groupId) return;
    setSaving(true);
    setError("");
    try {
      await Promise.all(
        selectedIds.map((hid) =>
          api.post(`/groups/${groupId}/hosts`, { host_id: hid }).catch(() => {})
        )
      );
      onDone();
      onClose();
    } catch {
      setError(t("dashboard.assignGroupError"));
    } finally {
      setSaving(false);
    }
  };

  const inp = "w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-cyan-500";
  return (
    <Modal title={t("dashboard.assignGroupTitle", { count: selectedIds.length })} onClose={onClose}>
      <form onSubmit={apply} className="space-y-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">{t("common.groups")}</label>
          <select className={inp} value={groupId} onChange={(e) => setGroupId(e.target.value)} required>
            <option value="">{t("dashboard.selectGroup")}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={saving || !groupId}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded text-sm font-medium transition-colors">
            {saving ? "..." : t("dashboard.assign")}
          </button>
          <button type="button" onClick={onClose}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-sm transition-colors">
            {t("common.cancel")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { openTab } = useTabs();
  const [hosts, setHosts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(() => isMobile ? "grid" : (localStorage.getItem("host-view") || "grid"));
  const [selected, setSelected] = useState(new Set());
  const [showBulkGroup, setShowBulkGroup] = useState(false);
  const [search, setSearch] = useState("");
  const [filterGroup, setFilterGroup] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [hostStatus, setHostStatus] = useState({});

  const checkStatus = useCallback((hostList) => {
    hostList.forEach((h) => {
      api.get(`/hosts/${h.id}/ping`).then((r) => {
        setHostStatus((prev) => ({ ...prev, [h.id]: r.data.reachable }));
      }).catch(() => {
        setHostStatus((prev) => ({ ...prev, [h.id]: false }));
      });
    });
  }, []);

  const load = useCallback(() => {
    Promise.all([
      api.get("/hosts").then((r) => { setHosts(r.data); return r.data; }),
      user?.is_admin
        ? api.get("/groups").then((r) => setGroups(r.data))
        : api.get("/auth/me/groups").then((r) => setGroups(r.data)),
    ]).then(([hostList]) => checkStatus(hostList)).finally(() => setLoading(false));
  }, [user, checkStatus]);

  useEffect(() => { load(); }, [load]);

  const setViewMode = (mode) => {
    setView(mode);
    localStorage.setItem("host-view", mode);
  };

  const lastSelectedRef = useRef(null);

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((h) => h.id)));
  };

  const deleteSelected = async () => {
    if (!confirm(t("dashboard.bulkDeleteConfirm", { count: selected.size }))) return;
    await Promise.all([...selected].map((id) => api.delete(`/hosts/${id}`)));
    setSelected(new Set());
    load();
  };

  const filtered = hosts
    .filter((h) => {
      if (search) {
        const q = search.toLowerCase();
        const inName = h.name.toLowerCase().includes(q);
        const inHost = h.hostname.toLowerCase().includes(q);
        const inDesc = (h.description ?? "").toLowerCase().includes(q);
        const inGroup = (h.groups ?? []).some((g) => g.name.toLowerCase().includes(q));
        if (!inName && !inHost && !inDesc && !inGroup) return false;
      }
      if (filterGroup) {
        if (!(h.groups ?? []).some((g) => String(g.id) === filterGroup)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "auth") return a.auth_method.localeCompare(b.auth_method);
      if (sortBy === "group") {
        const ga = a.groups?.[0]?.name ?? "\uFFFF";
        const gb = b.groups?.[0]?.name ?? "\uFFFF";
        return ga.localeCompare(gb) || a.name.localeCompare(b.name);
      }
      return 0;
    });

  const allSelected = filtered.length > 0 && selected.size === filtered.length;
  const anySelected = selected.size > 0;

  const handleSelect = useCallback((id, e) => {
    if (e?.shiftKey && lastSelectedRef.current !== null) {
      const ids = filtered.map((h) => h.id);
      const from = ids.indexOf(lastSelectedRef.current);
      const to = ids.indexOf(id);
      const [start, end] = from <= to ? [from, to] : [to, from];
      setSelected((prev) => {
        const next = new Set(prev);
        ids.slice(start, end + 1).forEach((rid) => next.add(rid));
        return next;
      });
    } else if (e?.ctrlKey || e?.metaKey) {
      setSelected((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
      lastSelectedRef.current = id;
    } else {
      setSelected((prev) => (prev.size === 1 && prev.has(id) ? new Set() : new Set([id])));
      lastSelectedRef.current = id;
    }
  }, [filtered]);

  const handleToggle = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    lastSelectedRef.current = id;
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-gray-950 px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b border-gray-800">
      {/* Header row */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <h1 className="text-xl font-semibold text-white mr-auto">{t("nav.hosts")}</h1>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("dashboard.searchPlaceholder")}
          className={`bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500 ${isMobile ? "flex-1 min-w-0" : "w-44"}`}
        />

        {!isMobile && groups.length > 0 && (
          <select
            value={filterGroup}
            onChange={(e) => setFilterGroup(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="">{t("dashboard.allGroups")}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        )}

        {!isMobile && (
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="name">{t("dashboard.sortName")}</option>
            <option value="auth">{t("dashboard.sortAuth")}</option>
            <option value="group">{t("dashboard.sortGroup")}</option>
          </select>
        )}

        {!isMobile && (
          <div className="flex border border-gray-700 rounded overflow-hidden">
            <button
              onClick={() => setViewMode("grid")}
              className={`px-2.5 py-1.5 transition-colors ${view === "grid" ? "bg-cyan-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}
              title={t("dashboard.viewGrid")}
            >
              <GridIcon />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-2.5 py-1.5 transition-colors ${view === "list" ? "bg-cyan-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}
              title={t("dashboard.viewList")}
            >
              <ListIcon />
            </button>
          </div>
        )}

        {!isMobile && user?.is_admin && (
          <button
            onClick={() => navigate("/hosts/new")}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded text-sm font-medium transition-colors"
          >
            {t("dashboard.addHost")}
          </button>
        )}
      </div>

      {/* Bulk action bar — desktop only */}
      {!isMobile && (
        <div className="flex items-center gap-3 mb-4 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2">
          <span className={`text-sm ${anySelected ? "text-gray-300" : "text-gray-600"}`}>
            {anySelected ? t("dashboard.selected", { count: selected.size }) : t("dashboard.selectPrompt")}
          </span>
          <div className={`flex gap-2 ml-auto ${anySelected ? "" : "invisible"}`}>
            <button
              onClick={() => {
                hosts.filter((h) => selected.has(h.id)).forEach((h) => openTab(h, "ssh"));
                setSelected(new Set());
              }}
              className="text-xs px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 rounded transition-colors"
            >
              {t("dashboard.startSsh")}
            </button>
            <button
              onClick={() => {
                hosts.filter((h) => selected.has(h.id)).forEach((h) => openTab(h, "sftp"));
                setSelected(new Set());
              }}
              className="text-xs px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 rounded transition-colors"
            >
              {t("dashboard.startSftp")}
            </button>
            {user?.is_admin && groups.length > 0 && (
              <button
                onClick={() => setShowBulkGroup(true)}
                className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded transition-colors"
              >
                {t("dashboard.assignGroup")}
              </button>
            )}
            {user?.is_admin && (
              <button
                onClick={deleteSelected}
                className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-red-900 text-red-400 rounded transition-colors"
              >
                {t("common.delete")}
              </button>
            )}
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded transition-colors text-gray-400"
            >
              {t("dashboard.deselect")}
            </button>
          </div>
        </div>
      )}

      {/* Mobile bulk bar — only when items selected */}
      {isMobile && anySelected && (
        <div className="flex items-center gap-2 px-3 py-2 bg-cyan-950 border-t border-cyan-800">
          <span className="text-xs text-cyan-300 mr-auto">{t("dashboard.selected", { count: selected.size })}</span>
          <button
            onClick={() => { hosts.filter((h) => selected.has(h.id)).forEach((h) => openTab(h, "ssh")); setSelected(new Set()); }}
            className="text-xs px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 rounded transition-colors"
          >⌨ SSH</button>
          <button
            onClick={() => { hosts.filter((h) => selected.has(h.id)).forEach((h) => openTab(h, "sftp")); setSelected(new Set()); }}
            className="text-xs px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 rounded transition-colors"
          >📁 SFTP</button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs px-2.5 py-1.5 bg-gray-700 hover:bg-gray-600 rounded transition-colors text-gray-300"
          >✕</button>
        </div>
      )}
      </div>{/* end sticky header */}

      <div className="flex-1 overflow-auto px-4 sm:px-6 py-4">

      {loading ? (
        <div className="text-gray-500 text-sm">{t("dashboard.loading")}</div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-500 text-sm">{search || filterGroup ? t("dashboard.noHosts") : t("dashboard.noHostsAvailable")}</div>
      ) : view === "grid" ? (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((host) => (
            <HostCard
              key={host.id}
              host={host}
              isAdmin={user?.is_admin}
              selected={selected.has(host.id)}
              onSelect={(e) => handleSelect(host.id, e)}
              onToggle={() => handleToggle(host.id)}
              onDeleted={load}
              status={hostStatus[host.id]}
            />
          ))}
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-800 text-xs text-gray-500">
              <tr>
                <th className="px-4 py-3 w-8">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-cyan-500" />
                </th>
                <th className="text-left px-4 py-3 cursor-pointer select-none" onClick={() => setSortBy("name")}>
                  {t("common.name")} {sortBy === "name" && "↑"}
                </th>
                <th className="px-4 py-3 hidden sm:table-cell cursor-pointer select-none" onClick={() => setSortBy("auth")}>
                  Auth {sortBy === "auth" && "↑"}
                </th>
                <th className="text-left px-4 py-3 hidden lg:table-cell cursor-pointer select-none" onClick={() => setSortBy("group")}>
                  {t("common.groups")} {sortBy === "group" && "↑"}
                </th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((host) => (
                <HostRow
                  key={host.id}
                  host={host}
                  isAdmin={user?.is_admin}
                  selected={selected.has(host.id)}
                  onSelect={(e) => handleSelect(host.id, e)}
                  onToggle={() => handleToggle(host.id)}
                  onDeleted={load}
                  status={hostStatus[host.id]}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showBulkGroup && (
        <BulkGroupModal
          selectedIds={[...selected]}
          groups={groups}
          onClose={() => setShowBulkGroup(false)}
          onDone={() => { setSelected(new Set()); load(); }}
        />
      )}
      </div>{/* end scrollable content */}
    </div>
  );
}

// ── Admin actions dropdown ────────────────────────────────────────────────────

function AdminMenu({ onEdit, onDelete }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs px-2 py-1.5 bg-gray-800 hover:bg-gray-700 rounded transition-colors text-gray-400"
        title={t("common.actions")}
      >⋯</button>
      {open && (
        <div className="absolute right-0 bottom-full mb-1 bg-gray-900 border border-gray-700 rounded shadow-lg min-w-max z-20">
          <button
            onClick={() => { setOpen(false); onEdit(); }}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-gray-300 hover:bg-gray-800 transition-colors"
          >✏ {t("common.edit")}</button>
          <button
            onClick={() => { setOpen(false); onDelete(); }}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-400 hover:bg-gray-800 transition-colors"
          >✕ {t("common.delete")}</button>
        </div>
      )}
    </div>
  );
}

// ── Card view ─────────────────────────────────────────────────────────────────

function HostCard({ host, isAdmin, selected, onSelect, onToggle, onDeleted, status }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { openTab } = useTabs();

  const deleteHost = async () => {
    if (!confirm(t("dashboard.deleteConfirm", { name: host.name }))) return;
    await api.delete(`/hosts/${host.id}`);
    onDeleted();
  };

  return (
    <div
      onClick={onSelect}
      className={`bg-gray-900 border rounded-lg p-4 transition-colors cursor-pointer select-none ${selected ? "border-cyan-600 bg-cyan-950/20" : "border-gray-800 hover:border-gray-600"}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-start gap-2 min-w-0">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            onClick={(e) => e.stopPropagation()}
            className="accent-cyan-500 mt-0.5 shrink-0"
          />
          <div className="min-w-0">
            <h3 className="font-medium text-white truncate flex items-center gap-1.5">
              <StatusDot status={status} />
              {host.name}
            </h3>
            <p className="text-xs text-gray-500 font-mono mt-0.5 truncate">
              {host.username ? `${host.username}@` : ""}{host.hostname}:{host.port}
            </p>
            {host.description && (
              <p className="text-xs text-gray-500 mt-0.5 truncate">{host.description}</p>
            )}
            {host.notes && (
              <p className="text-xs text-amber-600/80 mt-1 whitespace-pre-wrap line-clamp-3">{host.notes}</p>
            )}
            <GroupChips groups={host.groups} />
          </div>
        </div>
        <AuthBadge method={host.auth_method} />
      </div>

      {(host.proxmox_source_name || host.use_tmux) && (
        <div className="mt-2 flex flex-wrap gap-1">
          <SourceBadge name={host.proxmox_source_name} />
          {host.use_tmux && <TmuxBadge />}
        </div>
      )}
      <div className="flex items-center justify-between mt-3 gap-2">
        <div className="flex items-center gap-1.5">
          <div onClick={(e) => e.stopPropagation()}>
            <WebButtons links={host.web_links} small />
          </div>
          <div className="flex rounded overflow-hidden border border-gray-700 shrink-0">
            <button onClick={(e) => { e.stopPropagation(); openTab(host, "ssh"); }}
              className="text-xs px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 transition-colors">
              SSH
            </button>
            <span className="w-px bg-gray-700" />
            <button onClick={(e) => { e.stopPropagation(); openTab(host, "sftp"); }}
              className="text-xs px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 transition-colors">
              SFTP
            </button>
            <span className="w-px bg-gray-700" />
            <button onClick={(e) => { e.stopPropagation(); openTab(host, "sftp", null, { sftpRoot: true }); }}
              className="text-xs px-3 py-1.5 bg-purple-800 hover:bg-purple-700 transition-colors"
              title={t("dashboard.sftpRootTitle")}>
              SFTP ✦
            </button>
          </div>
        </div>
        {isAdmin && (
          <AdminMenu
            onEdit={() => navigate(`/hosts/${host.id}/edit`)}
            onDelete={deleteHost}
          />
        )}
      </div>
    </div>
  );
}

// ── List view row ─────────────────────────────────────────────────────────────

function HostRow({ host, isAdmin, selected, onSelect, onToggle, onDeleted, status }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { openTab } = useTabs();

  const deleteHost = async () => {
    if (!confirm(t("dashboard.deleteConfirm", { name: host.name }))) return;
    await api.delete(`/hosts/${host.id}`);
    onDeleted();
  };

  return (
    <tr
      onClick={onSelect}
      className={`border-b border-gray-800 last:border-0 cursor-pointer select-none ${selected ? "bg-cyan-950/30" : "hover:bg-gray-800/50"}`}
    >
      <td className="px-4 py-2.5 w-8" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={selected} onChange={onToggle} className="accent-cyan-500" />
      </td>
      <td className="px-4 py-2.5">
        <div className="font-medium text-white text-sm flex items-center gap-1.5">
          <StatusDot status={status} />
          {host.name}
        </div>
        {host.notes && (
          <div className="text-xs text-amber-600/80 mt-0.5 truncate max-w-xs" title={host.notes}>{host.notes}</div>
        )}
      </td>
      <td className="px-4 py-2.5 text-center hidden sm:table-cell">
        <AuthBadge method={host.auth_method} />
      </td>
      <td className="px-4 py-2.5 hidden lg:table-cell">
        <div className="flex flex-wrap gap-1 items-center">
          <GroupChips groups={host.groups} />
          <SourceBadge name={host.proxmox_source_name} />
          {host.use_tmux && <TmuxBadge />}
        </div>
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center justify-end gap-1.5">
          <div onClick={(e) => e.stopPropagation()}>
            <WebButtons links={host.web_links} small />
          </div>
          <div className="flex rounded overflow-hidden border border-gray-700">
            <button onClick={(e) => { e.stopPropagation(); openTab(host, "ssh"); }}
              className="text-xs px-2 py-1 bg-cyan-700 hover:bg-cyan-600 transition-colors">
              SSH
            </button>
            <span className="w-px bg-gray-700" />
            <button onClick={(e) => { e.stopPropagation(); openTab(host, "sftp"); }}
              className="text-xs px-2 py-1 bg-indigo-700 hover:bg-indigo-600 transition-colors">
              SFTP
            </button>
            <span className="w-px bg-gray-700" />
            <button onClick={(e) => { e.stopPropagation(); openTab(host, "sftp", null, { sftpRoot: true }); }}
              className="text-xs px-2 py-1 bg-purple-800 hover:bg-purple-700 transition-colors"
              title={t("dashboard.sftpRootTitle")}>
              SFTP ✦
            </button>
          </div>
          {isAdmin && (
            <AdminMenu
              onEdit={() => navigate(`/hosts/${host.id}/edit`)}
              onDelete={deleteHost}
            />
          )}
        </div>
      </td>
    </tr>
  );
}
