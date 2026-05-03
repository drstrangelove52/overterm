import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "../api/client";

const emptyForm = {
  name: "",
  hostname: "",
  port: 22,
  username: "",
  description: "",
  notes: "",
  auth_method: "none",
  password: "",
  ssh_key_id: "",
  web_links: [],
  group_ids: [],
  use_tmux: false,
};

export default function HostForm() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const [form, setForm] = useState(emptyForm);
  const [keys, setKeys] = useState([]);
  const [groups, setGroups] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [knownHost, setKnownHost] = useState(null);
  const [knownHostLoading, setKnownHostLoading] = useState(false);

  const loadKnownHost = useCallback(() => {
    if (!isEdit) return;
    api.get(`/hosts/${id}/known-host`).then((r) => setKnownHost(r.data)).catch(() => setKnownHost(null));
  }, [id, isEdit]);

  useEffect(() => {
    api.get("/ssh-keys").then((r) => setKeys(r.data));
    api.get("/groups").then((r) => setGroups(r.data));
    if (isEdit) {
      api.get(`/hosts/${id}`).then((r) =>
        setForm({ ...emptyForm, ...r.data, username: r.data.username ?? "", password: "", ssh_key_id: "", web_links: r.data.web_links ?? [], group_ids: r.data.group_ids ?? [] })
      );
      loadKnownHost();
    }
  }, [id]);

  const resetKnownHost = async () => {
    if (!confirm(t('hostForm.knownHostResetConfirm'))) return;
    setKnownHostLoading(true);
    await api.delete(`/hosts/${id}/known-host`).catch(() => {});
    setKnownHost(null);
    setKnownHostLoading(false);
  };

  const toggleGroup = (gid) => {
    setForm((f) => ({
      ...f,
      group_ids: f.group_ids.includes(gid) ? f.group_ids.filter((x) => x !== gid) : [...f.group_ids, gid],
    }));
  };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        port: Number(form.port),
        username: form.username.trim() || null,
        ssh_key_id: form.ssh_key_id ? Number(form.ssh_key_id) : undefined,
        password: form.auth_method === "password" ? form.password || null : null,
        web_links: form.web_links.filter(l => l.url.trim()).map((l, i) => ({ label: l.label || "Web", url: l.url.trim(), sort_order: i })),
        group_ids: form.group_ids,
      };
      if (isEdit) await api.patch(`/hosts/${id}`, payload);
      else await api.post("/hosts", payload);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.detail || t('hostForm.errorSaving'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-xl font-semibold text-white mb-6">
        {isEdit ? t('hostForm.titleEdit') : t('hostForm.titleNew')}
      </h1>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('common.name')}>
          <input className={input} value={form.name} onChange={(e) => set("name", e.target.value)} required />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label={t('hostForm.hostname')} className="col-span-2">
            <input className={input} value={form.hostname} onChange={(e) => set("hostname", e.target.value)} required />
          </Field>
          <Field label={t('hostForm.port')}>
            <input type="number" className={input} value={form.port} onChange={(e) => set("port", e.target.value)} />
          </Field>
        </div>
        <Field label={t('common.description')}>
          <input className={input} value={form.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <Field label={t('hostForm.notes')}>
          <textarea
            className={`${input} resize-none`}
            rows={3}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder={t('hostForm.notesPlaceholder')}
          />
        </Field>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-400">{t('hostForm.webLinks')}</label>
            <button type="button"
              onClick={() => set("web_links", [...form.web_links, { label: "", url: "", sort_order: form.web_links.length }])}
              className="text-xs text-cyan-400 hover:text-cyan-300">
              {t('hostForm.webLinksAdd')}
            </button>
          </div>
          {form.web_links.length === 0 && (
            <p className="text-xs text-gray-600">{t('hostForm.webLinksNone')}</p>
          )}
          <div className="space-y-2">
            {form.web_links.map((lnk, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  className="w-24 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-500"
                  placeholder={t('hostForm.webLinksLabelPlaceholder')}
                  value={lnk.label}
                  onChange={(e) => {
                    const updated = [...form.web_links];
                    updated[i] = { ...updated[i], label: e.target.value };
                    set("web_links", updated);
                  }}
                />
                <input
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-500"
                  placeholder={t('hostForm.webLinksUrlPlaceholder')}
                  value={lnk.url}
                  onChange={(e) => {
                    const updated = [...form.web_links];
                    updated[i] = { ...updated[i], url: e.target.value };
                    set("web_links", updated);
                  }}
                />
                <button type="button"
                  onClick={() => set("web_links", form.web_links.filter((_, j) => j !== i))}
                  className="text-red-500 hover:text-red-400 text-sm px-1">
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <Field label={t('hostForm.authMethod')}>
          <select className={input} value={form.auth_method} onChange={(e) => set("auth_method", e.target.value)}>
            <option value="none">{t('hostForm.authNone')}</option>
            <option value="password">{t('hostForm.authPassword')}</option>
            <option value="key">{t('hostForm.authKey')}</option>
          </select>
        </Field>

        {form.auth_method !== "none" && (
          <Field label={t('hostForm.sshUsername')}>
            <input
              className={input}
              value={form.username}
              onChange={(e) => set("username", e.target.value)}
              required
              placeholder={t('hostForm.sshUsernamePlaceholder')}
            />
          </Field>
        )}

        {form.auth_method === "password" && (
          <Field label={isEdit ? t('hostForm.passwordEdit') : t('hostForm.passwordNew')}>
            <input
              type="password"
              className={input}
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              required={!isEdit}
            />
          </Field>
        )}

        {form.auth_method === "key" && (
          <Field label={t('hostForm.sshKeyShared')}>
            <select className={input} value={form.ssh_key_id} onChange={(e) => set("ssh_key_id", e.target.value)}>
              <option value="">{t('hostForm.sshKeySelect')}</option>
              {keys.map((k) => (
                <option key={k.id} value={k.id}>{k.name} ({k.fingerprint.slice(-16)})</option>
              ))}
            </select>
          </Field>
        )}

        {form.auth_method === "none" && (
          <div className="text-xs text-amber-400 bg-amber-950 border border-amber-800 rounded px-3 py-2">
            {t('hostForm.authNoneWarning')}
          </div>
        )}

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.use_tmux}
            onChange={(e) => set("use_tmux", e.target.checked)}
            className="accent-cyan-500 mt-0.5"
          />
          <div>
            <div className="text-sm text-gray-300">{t('hostForm.tmux')}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {t('hostForm.tmuxHint')}
            </div>
          </div>
        </label>


        {groups.length > 0 && (
          <Field label={t('common.groups')}>
            <div className="space-y-1">
              {groups.map((g) => (
                <label key={g.id} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.group_ids.includes(g.id)}
                    onChange={() => toggleGroup(g.id)}
                    className="accent-cyan-500"
                  />
                  {g.name}
                  {g.description && <span className="text-gray-500 text-xs">— {g.description}</span>}
                </label>
              ))}
            </div>
          </Field>
        )}

        {isEdit && (
          <div className="border border-gray-800 rounded-lg p-4 space-y-2">
            <div className="text-xs text-gray-400 font-medium uppercase tracking-wider">{t('hostForm.knownHostTitle')}</div>
            {knownHost ? (
              <>
                <div className="font-mono text-xs text-gray-300 break-all bg-gray-800 rounded px-3 py-2">
                  {knownHost.key_type} {knownHost.fingerprint}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    {t('hostForm.knownHostStored', { date: new Date(knownHost.added_at + "Z").toLocaleString("de-CH") })}
                  </span>
                  <button type="button" onClick={resetKnownHost} disabled={knownHostLoading}
                    className="text-xs px-3 py-1 bg-red-900 hover:bg-red-800 text-red-300 rounded transition-colors disabled:opacity-50">
                    {t('hostForm.knownHostReset')}
                  </button>
                </div>
              </>
            ) : (
              <div className="text-xs text-gray-500">{t('hostForm.knownHostEmpty')}</div>
            )}
          </div>
        )}

        {error && <p className="text-red-400 text-xs">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving}
            className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded text-sm font-medium transition-colors">
            {saving ? t('common.saving') : t('common.save')}
          </button>
          <button type="button" onClick={() => navigate("/")}
            className="px-5 py-2 bg-gray-800 hover:bg-gray-700 rounded text-sm transition-colors">
            {t('common.cancel')}
          </button>
        </div>
      </form>
    </div>
  );
}

const input = "w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-cyan-500";

function Field({ label, children, className = "" }) {
  return (
    <div className={className}>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  );
}
