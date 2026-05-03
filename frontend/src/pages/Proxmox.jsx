import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import api from "../api/client";
import Modal from "../components/Modal";
import useAuth from "../store/auth";

const emptyForm = {
  name: "",
  url: "",
  api_token: "",
  verify_ssl: false,
  import_qemu: true,
  import_lxc: true,
  only_running: true,
  label_filter: "",
  target_group_id: "",
  default_ssh_port: 22,
  default_ssh_user: "",
};

const inp = "w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-cyan-500";

function SourceModal({ source, groups, onClose, onSaved }) {
  const { t } = useTranslation();
  const isEdit = Boolean(source);
  const [form, setForm] = useState(
    source
      ? {
          name: source.name,
          url: source.url,
          api_token: "",
          verify_ssl: source.verify_ssl,
          import_qemu: source.import_qemu,
          import_lxc: source.import_lxc,
          only_running: source.only_running,
          label_filter: source.label_filter ?? "",
          target_group_id: source.target_group_id ?? "",
          default_ssh_port: source.default_ssh_port,
          default_ssh_user: source.default_ssh_user ?? "",
        }
      : emptyForm
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        label_filter: form.label_filter || null,
        target_group_id: form.target_group_id ? Number(form.target_group_id) : null,
        default_ssh_user: form.default_ssh_user || null,
        default_ssh_port: Number(form.default_ssh_port),
      };
      if (isEdit) {
        if (!payload.api_token) delete payload.api_token;
        await api.patch(`/proxmox/${source.id}`, payload);
      } else {
        await api.post("/proxmox", payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  const checkboxFields = [
    ["import_qemu", t('proxmox.importQemu')],
    ["import_lxc", t('proxmox.importLxc')],
    ["only_running", t('proxmox.onlyRunning')],
    ["verify_ssl", t('proxmox.verifySsl')],
  ];

  return (
    <Modal title={isEdit ? t('proxmox.modalTitleEdit', { name: source.name }) : t('proxmox.modalTitleNew')} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs text-gray-400 mb-1">{t('proxmox.nameLabel')}</label>
            <input className={inp} value={form.name} onChange={(e) => set("name", e.target.value)} required />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-gray-400 mb-1">{t('proxmox.urlLabel')}</label>
            <input className={inp} placeholder={t('proxmox.urlPlaceholder')} value={form.url} onChange={(e) => set("url", e.target.value)} required />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-gray-400 mb-1">
              {t('proxmox.apiTokenLabel')}{" "}
              <span className="text-gray-600">
                {isEdit ? t('proxmox.apiTokenFormatEdit') : t('proxmox.apiTokenFormatNew')}
              </span>
            </label>
            <input className={inp} value={form.api_token} onChange={(e) => set("api_token", e.target.value)} required={!isEdit} placeholder={t('proxmox.apiTokenPlaceholder')} />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">{t('proxmox.labelFilterLabel')}</label>
            <input className={inp} placeholder={t('proxmox.labelFilterPlaceholder')} value={form.label_filter} onChange={(e) => set("label_filter", e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">{t('proxmox.targetGroupLabel')}</label>
            <select className={inp} value={form.target_group_id} onChange={(e) => set("target_group_id", e.target.value)}>
              <option value="">{t('proxmox.targetGroupNone')}</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">{t('proxmox.sshPortLabel')}</label>
            <input type="number" className={inp} value={form.default_ssh_port} onChange={(e) => set("default_ssh_port", e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">{t('proxmox.sshUserLabel')}</label>
            <input className={inp} placeholder={t('proxmox.sshUserPlaceholder')} value={form.default_ssh_user} onChange={(e) => set("default_ssh_user", e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-2 pt-1">
          {checkboxFields.map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input type="checkbox" checked={form[key]} onChange={(e) => set(key, e.target.checked)} className="accent-cyan-500" />
              {label}
            </label>
          ))}
        </div>

        {error && <div className="bg-red-950 border border-red-800 text-red-300 text-xs rounded px-3 py-2">{error}</div>}

        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={saving}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded text-sm font-medium transition-colors">
            {saving ? "..." : t('common.save')}
          </button>
          <button type="button" onClick={onClose}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-sm transition-colors">
            {t('common.cancel')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function Proxmox() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.is_admin;
  const [sources, setSources] = useState([]);
  const [groups, setGroups] = useState([]);
  const [editSource, setEditSource] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [syncing, setSyncing] = useState({});
  const [syncResults, setSyncResults] = useState({});
  const [inactiveHosts, setInactiveHosts] = useState({});
  const [showInactive, setShowInactive] = useState({});

  const load = () =>
    Promise.all([
      api.get("/proxmox").then((r) => setSources(r.data)),
      isAdmin ? api.get("/groups").then((r) => setGroups(r.data)) : Promise.resolve(),
    ]);

  const loadInactive = (sourceId) =>
    api.get(`/proxmox/${sourceId}/inactive-hosts`).then((r) =>
      setInactiveHosts((p) => ({ ...p, [sourceId]: r.data }))
    );

  useEffect(() => { load(); }, []);

  const deleteSource = async (s) => {
    if (!confirm(t('proxmox.deleteConfirm', { name: s.name }))) return;
    await api.delete(`/proxmox/${s.id}`);
    load();
  };

  const syncSource = async (s) => {
    setSyncing((p) => ({ ...p, [s.id]: true }));
    setSyncResults((p) => ({ ...p, [s.id]: null }));
    try {
      const res = await api.post(`/proxmox/${s.id}/sync`);
      setSyncResults((p) => ({ ...p, [s.id]: { ok: true, data: res.data } }));
      if (showInactive[s.id]) loadInactive(s.id);
    } catch (err) {
      setSyncResults((p) => ({ ...p, [s.id]: { ok: false, msg: err.response?.data?.detail || "Fehler" } }));
    } finally {
      setSyncing((p) => ({ ...p, [s.id]: false }));
      load();
    }
  };

  const toggleInactive = (sourceId) => {
    const next = !showInactive[sourceId];
    setShowInactive((p) => ({ ...p, [sourceId]: next }));
    if (next && !inactiveHosts[sourceId]) loadInactive(sourceId);
  };

  const deleteInactiveHost = async (sourceId, host) => {
    if (!confirm(t("proxmox.inactiveHostDeleteConfirm", { name: host.name }))) return;
    await api.delete(`/hosts/${host.id}`);
    loadInactive(sourceId);
  };

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">{t('proxmox.title')}</h1>
          <p className="text-xs text-gray-500 mt-1">{t('proxmox.subtitle')}</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded text-sm font-medium transition-colors">
            {t('proxmox.addSource')}
          </button>
        )}
      </div>

      {sources.length === 0 ? (
        <div className="text-gray-500 text-sm">{t('proxmox.noSources')}</div>
      ) : (
        <div className="space-y-4">
          {sources.map((s) => {
            const result = syncResults[s.id];
            return (
              <div key={s.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium text-white">{s.name}</div>
                    <div className="text-xs text-gray-500 font-mono mt-0.5">{s.url}</div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {s.import_qemu && <Chip>QEMU</Chip>}
                      {s.import_lxc && <Chip>LXC</Chip>}
                      {s.only_running && <Chip>{t('proxmox.chipOnlyRunning')}</Chip>}
                      {s.label_filter && <Chip color="cyan">{t('proxmox.chipTag', { label: s.label_filter })}</Chip>}
                      {s.target_group_id && (
                        <Chip color="indigo">
                          {t('proxmox.chipGroup', { name: groups.find((g) => g.id === s.target_group_id)?.name ?? s.target_group_id })}
                        </Chip>
                      )}
                      {s.default_ssh_user && <Chip>{t('proxmox.chipUser', { user: s.default_ssh_user })}</Chip>}
                      <Chip>{t('proxmox.chipPort', { port: s.default_ssh_port })}</Chip>
                    </div>

                    {s.last_sync_at && (
                      <div className="text-xs text-gray-500 mt-2">
                        {t('proxmox.lastSync', {
                          date: new Date(s.last_sync_at).toLocaleString("de"),
                          status: s.last_sync_status,
                        })}
                      </div>
                    )}

                    {result && (
                      <div className={`mt-2 text-xs px-3 py-2 rounded border ${result.ok ? "bg-green-950 border-green-800 text-green-300" : "bg-red-950 border-red-800 text-red-300"}`}>
                        {result.ok
                          ? [
                              `✓ ${result.data.created} ${t('proxmox.syncNew')}`,
                              `${result.data.updated} ${t('proxmox.syncUpdated')}`,
                              ...(result.data.deleted ? [t('proxmox.syncDeactivated', { count: result.data.deleted })] : []),
                              ...(result.data.errors?.length ? [`${result.data.errors.length} Fehler`] : []),
                            ].join(" · ")
                          : t('proxmox.syncError', { error: result.msg })}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => syncSource(s)}
                      disabled={syncing[s.id]}
                      className="text-xs px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 rounded transition-colors flex items-center gap-1"
                    >
                      {syncing[s.id] ? <span className="animate-spin inline-block">⟳</span> : "⟳"} {t('proxmox.sync')}
                    </button>
                    {isAdmin && (
                      <>
                        <button onClick={() => setEditSource(s)}
                          className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded transition-colors">
                          ✏
                        </button>
                        <button onClick={() => deleteSource(s)}
                          className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-red-900 text-red-400 rounded transition-colors">
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {isAdmin && (
                  <div className="mt-3 border-t border-gray-800 pt-3">
                    <button
                      onClick={() => toggleInactive(s.id)}
                      className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
                    >
                      {showInactive[s.id] ? "▾" : "▸"} {t('proxmox.inactiveHosts')}
                      {inactiveHosts[s.id]?.length > 0 && (
                        <span className="ml-1 bg-gray-700 text-gray-300 rounded px-1.5 py-0.5 text-xs">
                          {inactiveHosts[s.id].length}
                        </span>
                      )}
                    </button>
                    {showInactive[s.id] && (
                      <div className="mt-2 space-y-1">
                        {!inactiveHosts[s.id] ? (
                          <div className="text-xs text-gray-600">{t('common.loading')}</div>
                        ) : inactiveHosts[s.id].length === 0 ? (
                          <div className="text-xs text-gray-600">{t('proxmox.inactiveHostsNone')}</div>
                        ) : (
                          inactiveHosts[s.id].map((h) => (
                            <div key={h.id} className="flex items-center justify-between text-xs text-gray-400 bg-gray-800 rounded px-3 py-1.5">
                              <div>
                                <span className="text-gray-300">{h.name}</span>
                                <span className="text-gray-600 ml-2 font-mono">{h.hostname}</span>
                              </div>
                              <button
                                onClick={() => deleteInactiveHost(s.id, h)}
                                className="text-red-500 hover:text-red-400 transition-colors px-1"
                                title={t('common.delete')}
                              >
                                ✕
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <SourceModal groups={groups} onClose={() => setShowCreate(false)} onSaved={load} />
      )}
      {editSource && (
        <SourceModal source={editSource} groups={groups} onClose={() => setEditSource(null)} onSaved={load} />
      )}
    </div>
  );
}

function Chip({ children, color = "gray" }) {
  const colors = {
    gray: "bg-gray-800 text-gray-400",
    cyan: "bg-cyan-900 text-cyan-300",
    indigo: "bg-indigo-900 text-indigo-300",
  };
  return <span className={`text-xs px-2 py-0.5 rounded ${colors[color]}`}>{children}</span>;
}
