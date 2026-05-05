import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import api from "../api/client";
import Modal from "../components/Modal";

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function CredForm({ title, onClose, onSave, existing, keys, defaultUsername = "" }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    username: existing?.username ?? "",
    auth_method: existing?.auth_method ?? "password",
    password: "",
    ssh_key_id: existing?.ssh_key_id ?? "",
  });
  const [keyMode, setKeyMode] = useState("existing"); // "existing" | "upload"
  const [uploadForm, setUploadForm] = useState({ name: "", passphrase: "", privateFile: null, publicFile: null });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      let ssh_key_id = form.auth_method === "key" ? Number(form.ssh_key_id) || null : null;

      if (form.auth_method === "key" && keyMode === "upload") {
        if (!uploadForm.privateFile || !uploadForm.publicFile) {
          setError(t("credentials.keyUploadRequired"));
          setSaving(false);
          return;
        }
        const privateKey = await readFileAsText(uploadForm.privateFile);
        const publicKey = await readFileAsText(uploadForm.publicFile);
        const keyName = uploadForm.name.trim() || uploadForm.privateFile.name;
        const res = await api.post("/ssh-keys", {
          name: keyName,
          private_key: privateKey.trim(),
          public_key: publicKey.trim(),
          passphrase: uploadForm.passphrase || null,
        });
        ssh_key_id = res.data.id;
      }

      await onSave({
        username: form.username || null,
        auth_method: form.auth_method,
        password: form.auth_method === "password" ? form.password || null : null,
        ssh_key_id,
      });
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || t("common.error"));
    } finally {
      setSaving(false);
    }
  };

  const inp = "w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-cyan-500";
  const tabBtn = (mode) =>
    `flex-1 py-1.5 text-xs rounded transition-colors ${keyMode === mode ? "bg-cyan-700 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`;

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">
            {t("credentials.usernameLabel")}
          </label>
          <input className={inp} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder={defaultUsername} />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">{t("credentials.authLabel")}</label>
          <select className={inp} value={form.auth_method} onChange={(e) => setForm({ ...form, auth_method: e.target.value })}>
            <option value="password">{t("credentials.passwordLabel")}</option>
            <option value="key">{t("credentials.keyLabel")}</option>
          </select>
        </div>
        {form.auth_method === "password" ? (
          <div>
            <label className="block text-xs text-gray-400 mb-1">{t("credentials.passwordLabel")}</label>
            <input type="password" className={inp} value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={t("credentials.passwordPlaceholder")} />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-1">
              <button type="button" className={tabBtn("existing")} onClick={() => setKeyMode("existing")}>
                {t("credentials.keyModeExisting")}
              </button>
              <button type="button" className={tabBtn("upload")} onClick={() => setKeyMode("upload")}>
                {t("credentials.keyModeUpload")}
              </button>
            </div>

            {keyMode === "existing" ? (
              <div>
                <label className="block text-xs text-gray-400 mb-1">{t("credentials.keyLabel")}</label>
                <select className={inp} value={form.ssh_key_id} onChange={(e) => setForm({ ...form, ssh_key_id: e.target.value })}>
                  <option value="">{t("credentials.keySelect")}</option>
                  {keys.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">{t("credentials.keyUploadName")}</label>
                  <input className={inp} value={uploadForm.name}
                    onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })}
                    placeholder={t("credentials.keyUploadNamePlaceholder")} />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">{t("credentials.keyUploadPrivate")}</label>
                  <input type="file" accept=".pem,.key,*"
                    className="w-full text-sm text-gray-300 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-gray-700 file:text-gray-300 hover:file:bg-gray-600 cursor-pointer"
                    onChange={(e) => setUploadForm({ ...uploadForm, privateFile: e.target.files[0] || null })} />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">{t("credentials.keyUploadPublic")}</label>
                  <input type="file" accept=".pub,*"
                    className="w-full text-sm text-gray-300 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-gray-700 file:text-gray-300 hover:file:bg-gray-600 cursor-pointer"
                    onChange={(e) => setUploadForm({ ...uploadForm, publicFile: e.target.files[0] || null })} />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">{t("credentials.keyUploadPassphrase")}</label>
                  <input type="password" className={inp} value={uploadForm.passphrase}
                    onChange={(e) => setUploadForm({ ...uploadForm, passphrase: e.target.value })}
                    placeholder={t("credentials.keyUploadPassphrasePlaceholder")} />
                </div>
              </div>
            )}
          </div>
        )}
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={saving} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded text-sm font-medium transition-colors">
            {saving ? "..." : t("common.save")}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-sm transition-colors">{t("common.cancel")}</button>
        </div>
      </form>
    </Modal>
  );
}

function CredBadge({ cred, keys }) {
  const { t } = useTranslation();
  if (!cred) return <span className="text-gray-700 text-xs">—</span>;
  const keyName = cred.auth_method === "key" && cred.ssh_key_id
    ? keys.find((k) => k.id === cred.ssh_key_id)?.name ?? "Key"
    : null;
  return (
    <span className="text-cyan-400 text-xs">
      {cred.username || <span className="text-gray-500 italic">{t("credentials.defaultBadge")}</span>}
      {" · "}
      {keyName ?? cred.auth_method}
    </span>
  );
}

export default function Credentials() {
  const { t } = useTranslation();
  const [hosts, setHosts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [creds, setCreds] = useState([]);
  const [groupCreds, setGroupCreds] = useState([]);
  const [keys, setKeys] = useState([]);
  const [editingHost, setEditingHost] = useState(null);
  const [editingGroup, setEditingGroup] = useState(null);
  const [search, setSearch] = useState("");
  const [onlyWithCreds, setOnlyWithCreds] = useState(true);

  const loadCreds = () => Promise.all([
    api.get("/credentials").then((r) => setCreds(r.data)),
    api.get("/group-credentials").then((r) => setGroupCreds(r.data)),
  ]);

  useEffect(() => {
    api.get("/hosts").then((r) => setHosts(r.data));
    api.get("/auth/me/groups").then((r) => setGroups(r.data));
    api.get("/ssh-keys").then((r) => setKeys(r.data));
    loadCreds();
  }, []);

  const credForHost = (hostId) => creds.find((c) => c.host_id === hostId);
  const credForGroup = (groupId) => groupCreds.find((c) => c.group_id === groupId);

  const saveHostCred = async (hostId, data) => {
    await api.put("/credentials", { host_id: hostId, ...data });
    loadCreds();
  };
  const saveGroupCred = async (groupId, data) => {
    await api.put("/group-credentials", { group_id: groupId, ...data });
    loadCreds();
  };
  const deleteHostCred = async (hostId) => {
    if (!confirm(t("credentials.deleteConfirm"))) return;
    await api.delete(`/credentials/${hostId}`);
    loadCreds();
  };
  const deleteGroupCred = async (groupId) => {
    if (!confirm(t("credentials.deleteConfirm"))) return;
    await api.delete(`/group-credentials/${groupId}`);
    loadCreds();
  };

  const q = search.toLowerCase();
  const filteredHosts = hosts.filter((h) => {
    const matchesSearch = !q || h.name.toLowerCase().includes(q) || h.hostname.toLowerCase().includes(q);
    const hasCred = !!credForHost(h.id);
    return matchesSearch && (!onlyWithCreds || hasCred);
  });

  const hostsWithCreds = hosts.filter((h) => credForHost(h.id)).length;

  const thCls = "text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider";
  const tdCls = "px-3 py-2 text-sm";

  return (
    <div className="p-6 max-w-4xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-white mb-1">{t("credentials.title")}</h1>
        <p className="text-xs text-gray-500">
          {t("credentials.priorityNote")}
        </p>
      </div>

      {/* Group credentials */}
      {groups.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-300 mb-3">{t("credentials.groupTitle")}</h2>
          <div className="rounded-lg border border-gray-800 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-900">
                <tr>
                  <th className={thCls}>{t("credentials.groupCol")}</th>
                  <th className={thCls}>{t("credentials.credCol")}</th>
                  <th className={thCls + " w-36"}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {groups.map((group) => {
                  const cred = credForGroup(group.id);
                  return (
                    <tr key={group.id} className="bg-gray-950 hover:bg-gray-900 transition-colors">
                      <td className={tdCls}>
                        <span className="font-medium text-white">👥 {group.name}</span>
                        {group.description && <div className="text-xs text-gray-500">{group.description}</div>}
                      </td>
                      <td className={tdCls}>
                        <CredBadge cred={cred} keys={keys} />
                      </td>
                      <td className={tdCls + " text-right"}>
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setEditingGroup(group)}
                            className="text-xs px-2.5 py-1 bg-gray-800 hover:bg-gray-700 rounded transition-colors">
                            {cred ? t("common.edit") : t("credentials.setCredential")}
                          </button>
                          {cred && (
                            <button onClick={() => deleteGroupCred(group.id)}
                              className="text-xs px-2.5 py-1 bg-gray-800 hover:bg-red-900 rounded transition-colors text-red-400">
                              ✕
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Host-specific credentials */}
      <section>
        <div className="flex items-center justify-between mb-3 gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-300">{t("credentials.hostTitle")}</h2>
            <span className="text-xs text-gray-600">
              {t("credentials.hostCount", { with: hostsWithCreds, total: hosts.length })}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("credentials.searchPlaceholder")}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-cyan-500 w-48"
            />
            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyWithCreds}
                onChange={(e) => setOnlyWithCreds(e.target.checked)}
                className="accent-cyan-500"
              />
              {t("credentials.onlyWithCreds")}
            </label>
          </div>
        </div>

        {filteredHosts.length === 0 ? (
          <p className="text-xs text-gray-600 py-4">
            {onlyWithCreds && hostsWithCreds === 0
              ? t("credentials.noCreds")
              : t("credentials.noHosts")}
          </p>
        ) : (
          <div className="rounded-lg border border-gray-800 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-900">
                <tr>
                  <th className={thCls}>{t("credentials.hostCol")}</th>
                  <th className={thCls + " hidden sm:table-cell"}>{t("credentials.hostnameCol")}</th>
                  <th className={thCls}>{t("credentials.credCol")}</th>
                  <th className={thCls + " w-36"}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filteredHosts.map((host) => {
                  const cred = credForHost(host.id);
                  return (
                    <tr key={host.id} className="bg-gray-950 hover:bg-gray-900 transition-colors">
                      <td className={tdCls}>
                        <span className="font-medium text-white">{host.name}</span>
                      </td>
                      <td className={tdCls + " hidden sm:table-cell"}>
                        <span className="text-xs text-gray-500 font-mono">{host.hostname}</span>
                      </td>
                      <td className={tdCls}>
                        <CredBadge cred={cred} keys={keys} />
                      </td>
                      <td className={tdCls + " text-right"}>
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setEditingHost(host)}
                            className="text-xs px-2.5 py-1 bg-gray-800 hover:bg-gray-700 rounded transition-colors">
                            {cred ? t("common.edit") : t("credentials.setCredential")}
                          </button>
                          {cred && (
                            <button onClick={() => deleteHostCred(host.id)}
                              className="text-xs px-2.5 py-1 bg-gray-800 hover:bg-red-900 rounded transition-colors text-red-400">
                              ✕
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editingGroup && (
        <CredForm
          title={`Gruppen-Credentials: ${editingGroup.name}`}
          onClose={() => setEditingGroup(null)}
          onSave={(data) => saveGroupCred(editingGroup.id, data)}
          existing={credForGroup(editingGroup.id)}
          keys={keys}
        />
      )}
      {editingHost && (
        <CredForm
          title={`Host-Credentials: ${editingHost.name}`}
          onClose={() => setEditingHost(null)}
          onSave={(data) => saveHostCred(editingHost.id, data)}
          existing={credForHost(editingHost.id)}
          keys={keys}
          defaultUsername={editingHost.username}
        />
      )}
    </div>
  );
}
