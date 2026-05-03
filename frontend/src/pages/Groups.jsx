import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import api from "../api/client";
import Modal from "../components/Modal";

function SearchAdd({ placeholder, items, labelFn, onAdd, actions }) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const filtered = items.filter((i) => labelFn(i).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="mt-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-cyan-500"
      />
      {q && (
        <div className="mt-1 bg-gray-900 border border-gray-700 rounded overflow-hidden max-h-48 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-600">Keine Treffer</div>
          ) : (
            filtered.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-3 py-2 hover:bg-gray-800 border-b border-gray-800 last:border-0">
                <span className="text-sm text-gray-200">{labelFn(item)}</span>
                <div className="flex gap-1">
                  {actions ? actions(item, () => setQ("")) : (
                    <button
                      onClick={() => { onAdd(item); setQ(""); }}
                      className="text-xs px-2.5 py-1 bg-cyan-700 hover:bg-cyan-600 rounded transition-colors"
                    >
                      {t('common.add')}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function InlineEdit({ value, placeholder, multiline, onSave, className }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef();

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const commit = () => { onSave(draft); setEditing(false); };
  const cancel = () => { setDraft(value); setEditing(false); };

  if (!editing) return (
    <button
      onClick={() => { setDraft(value); setEditing(true); }}
      className={`text-left hover:bg-gray-800 rounded px-1 -mx-1 transition-colors group ${className}`}
    >
      {value || <span className="text-gray-600 italic">{placeholder}</span>}
      <span className="ml-2 text-gray-600 opacity-0 group-hover:opacity-100 text-xs">✎</span>
    </button>
  );

  const inputCls = "bg-gray-800 border border-cyan-600 rounded px-2 py-1 text-sm focus:outline-none w-full";
  return (
    <div className="flex items-start gap-2">
      {multiline ? (
        <textarea ref={ref} value={draft} onChange={(e) => setDraft(e.target.value)}
          rows={2} className={inputCls + " resize-none"} />
      ) : (
        <input ref={ref} value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancel(); }}
          className={inputCls} />
      )}
      <button onClick={commit} className="text-xs px-2 py-1 bg-cyan-600 hover:bg-cyan-500 rounded transition-colors shrink-0">✓</button>
      <button onClick={cancel} className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded transition-colors shrink-0">✕</button>
    </div>
  );
}

export default function Groups() {
  const { t } = useTranslation();
  const [groups, setGroups] = useState([]);
  const [selected, setSelected] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [allHosts, setAllHosts] = useState([]);
  const [tab, setTab] = useState("members");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [error, setError] = useState("");

  const loadGroups = useCallback(() =>
    api.get("/groups").then((r) => setGroups(r.data)), []);

  const loadDetail = useCallback((id) =>
    api.get(`/groups/${id}`).then((r) => setSelected(r.data)), []);

  useEffect(() => {
    loadGroups();
    api.get("/users").then((r) => setAllUsers(r.data)).catch(() => {});
    api.get("/hosts").then((r) => setAllHosts(r.data)).catch(() => {});
  }, []);

  const createGroup = async (e) => {
    e.preventDefault();
    await api.post("/groups", { name: newName, description: newDesc });
    setNewName(""); setNewDesc(""); setShowCreate(false);
    loadGroups();
  };

  const deleteGroup = async (id) => {
    if (!confirm(t('groups.deleteConfirm'))) return;
    await api.delete(`/groups/${id}`);
    if (selected?.id === id) setSelected(null);
    loadGroups();
  };

  const updateGroup = async (field, value) => {
    const updated = { name: selected.name, description: selected.description, [field]: value };
    const { data } = await api.patch(`/groups/${selected.id}`, updated);
    setSelected((s) => ({ ...s, ...data }));
    setGroups((gs) => gs.map((g) => g.id === data.id ? { ...g, ...data } : g));
  };

  const withError = (fn) => async (...args) => {
    setError("");
    try { await fn(...args); }
    catch (e) { setError(e.response?.data?.detail || t('common.error')); }
  };

  const addMember = withError(async (userId, role = "member") => {
    await api.post(`/groups/${selected.id}/members`, { user_id: userId, role });
    await loadDetail(selected.id);
  });

  const removeMember = withError(async (userId) => {
    await api.delete(`/groups/${selected.id}/members/${userId}`);
    await loadDetail(selected.id);
  });

  const addHost = withError(async (hostId) => {
    await api.post(`/groups/${selected.id}/hosts`, { host_id: hostId });
    await loadDetail(selected.id);
  });

  const removeHost = withError(async (hostId) => {
    await api.delete(`/groups/${selected.id}/hosts/${hostId}`);
    await loadDetail(selected.id);
  });

  const memberIds = selected?.members.map((m) => m.user_id) ?? [];
  const hostIds = selected?.hosts.map((h) => h.host_id) ?? [];
  const availableUsers = allUsers.filter((u) => !memberIds.includes(u.id));
  const availableHosts = allHosts.filter((h) => !hostIds.includes(h.id));

  const tabBtn = (id, label, count) => (
    <button
      onClick={() => setTab(id)}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        tab === id ? "border-cyan-500 text-white" : "border-transparent text-gray-500 hover:text-gray-300"
      }`}
    >
      {label}
      <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
        tab === id ? "bg-cyan-800 text-cyan-200" : "bg-gray-800 text-gray-500"
      }`}>{count}</span>
    </button>
  );

  return (
    <div className="p-6 flex gap-6 h-full overflow-hidden">
      {/* Left: group list */}
      <div className="w-64 shrink-0 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white">{t('groups.title')}</h2>
          <button onClick={() => setShowCreate(true)}
            className="text-xs px-2 py-1 bg-cyan-700 hover:bg-cyan-600 rounded transition-colors">
            {t('groups.new')}
          </button>
        </div>
        <div className="space-y-1 overflow-auto">
          {groups.length === 0 && (
            <p className="text-gray-600 text-xs px-1">{t('groups.noGroups')}</p>
          )}
          {groups.map((g) => (
            <div
              key={g.id}
              onClick={() => { setError(""); setTab("members"); loadDetail(g.id); }}
              className={`flex items-start justify-between px-3 py-2 rounded cursor-pointer text-sm transition-colors ${
                selected?.id === g.id ? "bg-cyan-700 text-white" : "bg-gray-900 text-gray-300 hover:bg-gray-800"
              }`}
            >
              <div className="min-w-0">
                <div className="font-medium truncate">{g.name}</div>
                {g.description && (
                  <div className={`text-xs truncate mt-0.5 ${selected?.id === g.id ? "text-cyan-200" : "text-gray-500"}`}>
                    {g.description}
                  </div>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteGroup(g.id); }}
                className={`shrink-0 ml-2 text-xs mt-0.5 ${selected?.id === g.id ? "text-cyan-300 hover:text-red-300" : "text-gray-600 hover:text-red-400"}`}
              >✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* Right: group detail */}
      <div className="flex-1 overflow-auto min-w-0">
        {!selected ? (
          <div className="flex items-center justify-center h-32 text-gray-600 text-sm">
            {t('groups.selectGroup')}
          </div>
        ) : (
          <div className="flex flex-col gap-0 max-w-2xl">
            {/* Header */}
            <div className="bg-gray-900 border border-gray-800 rounded-t-lg px-5 py-4">
              <InlineEdit
                value={selected.name}
                placeholder={t('groups.groupNamePlaceholder')}
                onSave={(v) => updateGroup("name", v)}
                className="text-lg font-semibold text-white"
              />
              <div className="mt-1.5">
                <InlineEdit
                  value={selected.description || ""}
                  placeholder={t('groups.descriptionPlaceholder')}
                  multiline
                  onSave={(v) => updateGroup("description", v || null)}
                  className="text-sm text-gray-400"
                />
              </div>
            </div>

            {/* Tabs */}
            <div className="bg-gray-900 border-x border-gray-800 flex border-b border-gray-800">
              {tabBtn("members", t('groups.tabMembers'), selected.members.length)}
              {tabBtn("hosts", t('groups.tabHosts'), selected.hosts.length)}
            </div>

            {/* Tab content */}
            <div className="bg-gray-950 border border-t-0 border-gray-800 rounded-b-lg px-5 py-4">
              {error && (
                <div className="mb-3 text-xs text-red-400 bg-red-950 border border-red-800 rounded px-3 py-2">
                  {error}
                </div>
              )}

              {tab === "members" && (
                <>
                  {selected.members.length === 0 ? (
                    <p className="text-xs text-gray-600 mb-2">{t('groups.noMembers')}</p>
                  ) : (
                    <table className="w-full mb-2">
                      <tbody className="divide-y divide-gray-800">
                        {selected.members.map((m) => (
                          <tr key={m.user_id} className="group">
                            <td className="py-2 text-sm text-white">{m.username}</td>
                            <td className="py-2">
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                m.role === "admin" ? "bg-purple-900 text-purple-300" : "bg-gray-800 text-gray-400"
                              }`}>{m.role === "admin" ? t('groups.roleAdmin') : t('groups.roleMember')}</span>
                            </td>
                            <td className="py-2 text-right">
                              <button onClick={() => removeMember(m.user_id)}
                                className="text-xs text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                                {t('common.remove')}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <SearchAdd
                    placeholder={t('groups.searchUsers')}
                    items={availableUsers}
                    labelFn={(u) => u.username}
                    actions={(u, clear) => (
                      <div className="flex gap-1">
                        <button onClick={() => { addMember(u.id, "member"); clear(); }}
                          className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded transition-colors">
                          {t('groups.roleMember')}
                        </button>
                        <button onClick={() => { addMember(u.id, "admin"); clear(); }}
                          className="text-xs px-2 py-1 bg-purple-800 hover:bg-purple-700 rounded transition-colors text-purple-200">
                          {t('groups.roleAdmin')}
                        </button>
                      </div>
                    )}
                  />
                </>
              )}

              {tab === "hosts" && (
                <>
                  {selected.hosts.length === 0 ? (
                    <p className="text-xs text-gray-600 mb-2">{t('groups.noHosts')}</p>
                  ) : (
                    <table className="w-full mb-2">
                      <tbody className="divide-y divide-gray-800">
                        {selected.hosts.map((h) => (
                          <tr key={h.host_id} className="group">
                            <td className="py-2 text-sm text-white">{h.name}</td>
                            <td className="py-2 text-xs text-gray-500 font-mono">{h.hostname}</td>
                            <td className="py-2 text-right">
                              <button onClick={() => removeHost(h.host_id)}
                                className="text-xs text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                                {t('common.remove')}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <SearchAdd
                    placeholder={t('groups.searchHosts')}
                    items={availableHosts}
                    labelFn={(h) => `${h.name} ${h.hostname}`}
                    onAdd={(h) => addHost(h.id)}
                  />
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {showCreate && (
        <Modal title={t('groups.createTitle')} onClose={() => setShowCreate(false)}>
          <form onSubmit={createGroup} className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">{t('common.name')}</label>
              <input
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
                value={newName} onChange={(e) => setNewName(e.target.value)}
                autoFocus required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">{t('common.description')}</label>
              <input
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
                value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="submit" className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded text-sm font-medium transition-colors">
                {t('groups.createButton')}
              </button>
              <button type="button" onClick={() => setShowCreate(false)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-sm transition-colors">
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
