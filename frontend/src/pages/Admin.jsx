import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import api from "../api/client";
import Modal from "../components/Modal";
import useAuth from "../store/auth";
import Groups from "./Groups";
import Sessions from "./Sessions";
import Import from "./Import";

export default function Admin() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("users");

  const TABS = [
    { key: "users",    label: t("admin.usersTab") },
    { key: "groups",   label: t("admin.groupsTab") },
    { key: "sessions", label: t("admin.sessionsTab") },
    { key: "import",   label: t("admin.importTab") },
    { key: "backup",   label: t("admin.backupTab") },
    { key: "settings", label: t("admin.settingsTab") },
  ];

  const embedded = ["groups", "sessions", "import"].includes(tab);
  return (
    <div className="p-6">
      <div className="flex flex-wrap gap-1 mb-6 border-b border-gray-800">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors rounded-t ${
              tab === tb.key
                ? "bg-gray-900 text-white border border-b-gray-900 border-gray-800 -mb-px"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>
      {tab === "users" && <UsersTab />}
      {tab === "backup" && <BackupTab />}
      {tab === "settings" && <SettingsTab />}
      {embedded && (
        <div className="-mx-6 -mb-6">
          {tab === "groups" && <Groups />}
          {tab === "sessions" && <Sessions />}
          {tab === "import" && <Import />}
        </div>
      )}
    </div>
  );
}

// ── Benutzer ──────────────────────────────────────────────────────────────────

const emptyForm = { username: "", email: "", password: "", is_admin: false, is_active: true, group_ids: [] };

function UsersTab() {
  const { t } = useTranslation();
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => api.get("/users").then((r) => setUsers(r.data));
  useEffect(() => {
    load();
    api.get("/groups").then((r) => setGroups(r.data));
  }, []);

  const toggleGroup = (gid) => setForm((f) => ({
    ...f,
    group_ids: f.group_ids.includes(gid) ? f.group_ids.filter((x) => x !== gid) : [...f.group_ids, gid],
  }));

  const openCreate = () => { setEditUser(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (u) => {
    setEditUser(u);
    setForm({ username: u.username, email: u.email, password: "", is_admin: u.is_admin, is_active: u.is_active, group_ids: u.group_ids ?? [] });
    setShowModal(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (editUser) {
        const payload = { email: form.email, is_admin: form.is_admin, is_active: form.is_active, group_ids: form.group_ids };
        if (form.password) payload.password = form.password;
        await api.patch(`/users/${editUser.id}`, payload);
      } else {
        await api.post("/users", form);
      }
      setShowModal(false);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || t("common.error"));
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async (u) => {
    if (u.id === me?.id) { alert(t("admin.deleteOwnError")); return; }
    if (!confirm(t("admin.deleteConfirm", { username: u.username }))) return;
    await api.delete(`/users/${u.id}`);
    load();
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-semibold">{t("admin.usersTitle")}</h2>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded text-sm font-medium transition-colors"
        >
          {t("admin.createUser")}
        </button>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-800 text-xs text-gray-500">
            <tr>
              <th className="text-left px-4 py-3">{t("admin.colUsername")}</th>
              <th className="text-left px-4 py-3">{t("admin.colEmail")}</th>
              <th className="px-4 py-3">{t("admin.colAdmin")}</th>
              <th className="px-4 py-3">{t("admin.colActive")}</th>
              <th className="px-4 py-3">{t("admin.colCreated")}</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-gray-900 hover:bg-gray-800">
                <td className="px-4 py-2.5 font-medium text-white">
                  {u.username}
                  {u.id === me?.id && <span className="ml-2 text-xs text-cyan-500">{t("admin.meBadge")}</span>}
                </td>
                <td className="px-4 py-2.5 text-gray-400">{u.email}</td>
                <td className="px-4 py-2.5 text-center">{u.is_admin ? "✓" : ""}</td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded ${u.is_active ? "bg-green-900 text-green-400" : "bg-red-900 text-red-400"}`}>
                    {u.is_active ? t("admin.activeYes") : t("admin.activeNo")}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-500 text-xs">
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => openEdit(u)} className="text-xs text-cyan-400 hover:text-cyan-300">{t("common.edit")}</button>
                    <button onClick={() => deleteUser(u)} className="text-xs text-red-500 hover:text-red-400">{t("common.delete")}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={editUser ? t("admin.modalEdit", { username: editUser.username }) : t("admin.modalNew")} onClose={() => setShowModal(false)}>
          <form onSubmit={save} className="space-y-3">
            {!editUser && (
              <Field label={t("admin.colUsername")}>
                <input className={inp} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
              </Field>
            )}
            <Field label="E-Mail">
              <input type="email" className={inp} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </Field>
            <Field label={editUser ? t("admin.passwordLabelEdit") : t("admin.passwordLabelNew")}>
              <input type="password" className={inp} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!editUser} />
            </Field>
            {groups.length > 0 && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">{t("admin.groupsTab")}</label>
                <div className="space-y-1 max-h-36 overflow-auto">
                  {groups.map((g) => (
                    <label key={g.id} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                      <input type="checkbox" checked={form.group_ids.includes(g.id)} onChange={() => toggleGroup(g.id)} className="accent-cyan-500" />
                      {g.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input type="checkbox" checked={form.is_admin} onChange={(e) => setForm({ ...form, is_admin: e.target.checked })} />
                {t("admin.isAdmin")}
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                {t("admin.isActive")}
              </label>
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={saving}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded text-sm font-medium transition-colors">
                {saving ? "..." : t("common.save")}
              </button>
              <button type="button" onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-sm transition-colors">
                {t("common.cancel")}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

// ── Backup & Restore ──────────────────────────────────────────────────────────

function BackupTab() {
  const { t } = useTranslation();
  const fileRef = useRef(null);
  const [restoreState, setRestoreState] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);

  const downloadBackup = async () => {
    const res = await api.get("/admin/backup", { responseType: "blob" });
    const disposition = res.headers["content-disposition"] || "";
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : "overterm-backup.json";
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setSelectedFile(f);
    setRestoreState("confirm");
    setErrorMsg("");
  };

  const doRestore = async () => {
    if (!selectedFile) return;
    setRestoreState("loading");
    try {
      const fd = new FormData();
      fd.append("file", selectedFile);
      await api.post("/admin/restore", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setRestoreState("done");
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || "Restore fehlgeschlagen");
      setRestoreState("error");
    } finally {
      setSelectedFile(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const reset = () => { setRestoreState("idle"); setErrorMsg(""); setSelectedFile(null); if (fileRef.current) fileRef.current.value = ""; };

  return (
    <div className="max-w-xl space-y-6">
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
        <h3 className="text-white font-medium mb-1">{t("admin.backupExportTitle")}</h3>
        <p className="text-gray-400 text-sm mb-4">{t("admin.backupExportDesc")}</p>
        <button
          onClick={downloadBackup}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded text-sm font-medium transition-colors"
        >
          {t("admin.backupDownload")}
        </button>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
        <h3 className="text-white font-medium mb-1">{t("admin.backupRestoreTitle")}</h3>
        <p className="text-gray-400 text-sm mb-4">{t("admin.backupRestoreDesc")}</p>

        {restoreState === "idle" && (
          <>
            <input ref={fileRef} type="file" accept=".json" onChange={onFileChange} className="hidden" />
            <button
              onClick={() => fileRef.current?.click()}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm font-medium transition-colors"
            >
              {t("admin.backupSelectFile")}
            </button>
          </>
        )}

        {restoreState === "confirm" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 bg-amber-900/30 border border-amber-700/50 rounded text-sm text-amber-300">
              <span className="text-lg">⚠</span>
              <span>{t("admin.backupConfirmWarning", { filename: selectedFile?.name })}</span>
            </div>
            <div className="flex gap-3">
              <button onClick={doRestore}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded text-sm font-medium transition-colors">
                {t("admin.backupRestoreButton")}
              </button>
              <button onClick={reset}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors">
                {t("common.cancel")}
              </button>
            </div>
          </div>
        )}

        {restoreState === "loading" && (
          <p className="text-gray-400 text-sm">{t("admin.backupLoading")}</p>
        )}

        {restoreState === "done" && (
          <div className="space-y-3">
            <p className="text-green-400 text-sm">{t("admin.backupSuccess")}</p>
            <button onClick={() => { reset(); window.location.href = "/login"; }}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded text-sm font-medium transition-colors">
              {t("admin.backupToLogin")}
            </button>
          </div>
        )}

        {restoreState === "error" && (
          <div className="space-y-3">
            <p className="text-red-400 text-sm">{t("admin.backupError", { error: errorMsg })}</p>
            <button onClick={reset} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors">
              {t("admin.backupRetry")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Einstellungen ─────────────────────────────────────────────────────────────

function SettingsTab() {
  const { t } = useTranslation();
  const [interval, setInterval] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/admin/settings").then((r) => {
      setInterval(String(r.data.sync_interval_minutes));
    }).finally(() => setLoading(false));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    const val = parseInt(interval, 10);
    if (isNaN(val) || val < 0) { setError(t("common.invalidValue")); return; }
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await api.patch("/admin/settings", { sync_interval_minutes: val });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError(t("admin.settingsError"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-gray-500 text-sm">{t("common.loading")}</div>;

  return (
    <div className="max-w-xl space-y-4">
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
        <h3 className="text-white font-medium mb-1">{t("admin.settingsTitle")}</h3>
        <p className="text-gray-400 text-sm mb-4">{t("admin.settingsDesc")}</p>
        <form onSubmit={save} className="flex items-end gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">{t("admin.settingsIntervalLabel")}</label>
            <input
              type="number"
              min="0"
              max="10080"
              className="w-28 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded text-sm font-medium transition-colors"
          >
            {saving ? "…" : t("common.save")}
          </button>
          {saved && <span className="text-green-400 text-sm">{t("admin.settingsSaved")}</span>}
          {error && <span className="text-red-400 text-sm">{error}</span>}
        </form>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const inp = "w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-cyan-500";

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  );
}
