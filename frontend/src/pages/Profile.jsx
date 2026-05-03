import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import api from "../api/client";
import useAuth from "../store/auth";

function Section({ title, children }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
      <h2 className="text-white font-semibold mb-5">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

function input(extra = "") {
  return `w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 ${extra}`;
}

// ── Konto ─────────────────────────────────────────────────────────────────────

function AccountSection({ user, onUpdated }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState(user.email);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    try {
      const r = await api.patch("/auth/me", { email });
      onUpdated(r.data);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError(e.response?.data?.detail ?? t("profile.errorSaving"));
    }
  };

  return (
    <Section title={t("profile.accountTitle")}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t("login.username")}>
          <div className={input("text-gray-400 cursor-default")}>{user.username}</div>
        </Field>
        <Field label="E-Mail">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            className={input()} required />
        </Field>
        {error && <div className="text-red-400 text-xs">{error}</div>}
        {success && <div className="text-green-400 text-xs">{t("profile.saved")}</div>}
        <button type="submit"
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-sm transition-colors">
          {t("common.save")}
        </button>
      </form>
    </Section>
  );
}

// ── Passwort ──────────────────────────────────────────────────────────────────

function PasswordSection() {
  const { t } = useTranslation();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (form.next !== form.confirm) { setError(t("profile.passwordMismatch")); return; }
    if (form.next.length < 8) { setError(t("profile.passwordTooShort")); return; }
    try {
      await api.post("/auth/change-password", { current_password: form.current, new_password: form.next });
      setForm({ current: "", next: "", confirm: "" });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError(e.response?.data?.detail ?? t("profile.passwordError"));
    }
  };

  return (
    <Section title={t("profile.passwordTitle")}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t("profile.currentPassword")}>
          <input type="password" value={form.current}
            onChange={(e) => setForm({ ...form, current: e.target.value })}
            className={input()} required />
        </Field>
        <Field label={t("profile.newPassword")}>
          <input type="password" value={form.next}
            onChange={(e) => setForm({ ...form, next: e.target.value })}
            className={input()} required />
        </Field>
        <Field label={t("profile.confirmPassword")}>
          <input type="password" value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
            className={input()} required />
        </Field>
        {error && <div className="text-red-400 text-xs">{error}</div>}
        {success && <div className="text-green-400 text-xs">{t("profile.passwordChanged")}</div>}
        <button type="submit"
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-sm transition-colors">
          {t("profile.changeButton")}
        </button>
      </form>
    </Section>
  );
}

// ── 2FA ───────────────────────────────────────────────────────────────────────

function RecoveryCodes({ codes, onClose, title }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copyAll = () => {
    navigator.clipboard.writeText(codes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-3 pt-2 border-t border-gray-800">
      <div>
        <p className="text-white font-medium text-sm">{title ?? t("profile.recoveryCodesTitle")}</p>
        <p className="text-amber-400 text-xs mt-1">{t("profile.recoveryCodesWarning")}</p>
      </div>
      <div className="bg-gray-950 border border-gray-700 rounded p-3 grid grid-cols-2 gap-1.5">
        {codes.map((c) => (
          <code key={c} className="text-cyan-300 font-mono text-xs tracking-wider">{c}</code>
        ))}
      </div>
      <div className="flex gap-3">
        <button onClick={copyAll}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-xs transition-colors">
          {copied ? t("profile.copied") : t("profile.copyAll")}
        </button>
        {onClose && (
          <button onClick={onClose}
            className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 text-white rounded text-xs transition-colors">
            {t("profile.codesConfirm")}
          </button>
        )}
      </div>
    </div>
  );
}

function TwoFactorSection({ enabled: initialEnabled }) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [step, setStep] = useState("idle"); // idle | setup | recovery | disable | regenerate
  const [setup, setSetup] = useState(null);
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const codeRef = useRef(null);

  const startSetup = async () => {
    setError(null);
    const r = await api.post("/auth/totp/setup");
    setSetup(r.data);
    setCode("");
    setStep("setup");
    setTimeout(() => codeRef.current?.focus(), 50);
  };

  const confirmEnable = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/auth/totp/enable", { code });
      setEnabled(true);
      setRecoveryCodes(setup?.recovery_codes ?? []);
      setSetup(null);
      setStep("recovery");
    } catch (e) {
      setError(e.response?.data?.detail ?? t("login.invalidCode"));
      setCode("");
      codeRef.current?.focus();
    }
  };

  const confirmDisable = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/auth/totp/disable", { password });
      setEnabled(false);
      setStep("idle");
      setPassword("");
      setSuccess(t("profile.twoFactorDisabled"));
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setError(e.response?.data?.detail ?? t("profile.wrongPassword"));
      setPassword("");
    }
  };

  const startRegenerate = () => { setStep("regenerate"); setPassword(""); setError(null); };

  const confirmRegenerate = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const r = await api.post("/auth/totp/regenerate-recovery-codes", { password });
      setRecoveryCodes(r.data.recovery_codes);
      setPassword("");
      setStep("recovery");
    } catch (e) {
      setError(e.response?.data?.detail ?? t("profile.wrongPassword"));
      setPassword("");
    }
  };

  const cancel = () => { setStep("idle"); setError(null); setCode(""); setPassword(""); };

  return (
    <Section title={t("profile.twoFactorTitle")}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${enabled ? "bg-green-900 text-green-300" : "bg-gray-700 text-gray-400"}`}>
            {enabled ? t("profile.twoFactorActive") : t("profile.twoFactorInactive")}
          </span>
          <span className="text-gray-400 text-sm">
            {enabled ? t("profile.twoFactorEnabledMsg") : t("profile.twoFactorDisabledMsg")}
          </span>
        </div>

        {success && <div className="text-green-400 text-xs">{success}</div>}

        {step === "idle" && (
          <div className="flex flex-wrap gap-2">
            {enabled ? (
              <>
                <button onClick={startRegenerate}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-sm transition-colors">
                  {t("profile.regenerateButton")}
                </button>
                <button onClick={() => { setStep("disable"); setError(null); }}
                  className="px-4 py-2 bg-red-800 hover:bg-red-700 text-white rounded text-sm transition-colors">
                  {t("profile.disableButton")}
                </button>
              </>
            ) : (
              <button onClick={startSetup}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-sm transition-colors">
                {t("profile.setupButton")}
              </button>
            )}
          </div>
        )}

        {step === "setup" && setup && (
          <form onSubmit={confirmEnable} className="space-y-4 pt-2 border-t border-gray-800">
            <p className="text-gray-400 text-sm">{t("profile.setupScanQr")}</p>
            <div className="flex justify-center bg-white rounded p-3 w-fit"
              dangerouslySetInnerHTML={{ __html: setup.qr_svg }} />
            <Field label={t("profile.setupSecretLabel")}>
              <code className="block bg-gray-800 rounded px-3 py-2 text-xs text-cyan-300 break-all select-all">{setup.secret}</code>
            </Field>
            <Field label={t("profile.setupCodeLabel")}>
              <input ref={codeRef} type="text" inputMode="numeric" maxLength={6}
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="w-48 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-center text-xl font-mono tracking-widest focus:outline-none focus:border-cyan-500" />
            </Field>
            {error && <div className="text-red-400 text-xs">{error}</div>}
            <div className="flex gap-3">
              <button type="submit" disabled={code.length !== 6}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded text-sm transition-colors">
                {t("profile.activateButton")}
              </button>
              <button type="button" onClick={cancel}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm transition-colors">
                {t("common.cancel")}
              </button>
            </div>
          </form>
        )}

        {step === "recovery" && (
          <RecoveryCodes
            codes={recoveryCodes}
            title={t("profile.twoFactorSetupSuccess")}
            onClose={() => { setStep("idle"); setSuccess(t("profile.twoFactorSetupSuccess")); setTimeout(() => setSuccess(null), 4000); }}
          />
        )}

        {step === "regenerate" && (
          <form onSubmit={confirmRegenerate} className="space-y-4 pt-2 border-t border-gray-800">
            <p className="text-amber-400 text-xs">{t("profile.regenerateWarning")}</p>
            <Field label={t("profile.confirmPasswordLabel")}>
              <input type="password" autoFocus value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={input("w-64")} required />
            </Field>
            {error && <div className="text-red-400 text-xs">{error}</div>}
            <div className="flex gap-3">
              <button type="submit"
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-sm transition-colors">
                {t("profile.generateNewCodes")}
              </button>
              <button type="button" onClick={cancel}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm transition-colors">
                {t("common.cancel")}
              </button>
            </div>
          </form>
        )}

        {step === "disable" && (
          <form onSubmit={confirmDisable} className="space-y-4 pt-2 border-t border-gray-800">
            <Field label={t("profile.confirmPasswordLabel")}>
              <input type="password" autoFocus value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={input("w-64")} required />
            </Field>
            {error && <div className="text-red-400 text-xs">{error}</div>}
            <div className="flex gap-3">
              <button type="submit"
                className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded text-sm transition-colors">
                {t("profile.deactivateButton")}
              </button>
              <button type="button" onClick={cancel}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm transition-colors">
                {t("common.cancel")}
              </button>
            </div>
          </form>
        )}
      </div>
    </Section>
  );
}

// ── Sprache ───────────────────────────────────────────────────────────────────

function LanguageSection({ user, onUpdated }) {
  const { t } = useTranslation();
  const [lang, setLang] = useState(user.language ?? "de");
  const [saving, setSaving] = useState(false);

  const select = async (value) => {
    setLang(value);
    setSaving(true);
    try {
      const r = await api.patch("/auth/me", { language: value });
      i18n.changeLanguage(value);
      onUpdated(r.data);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title={t("profile.languageTitle")}>
      <p className="text-xs text-gray-400 mb-3">{t("profile.languageLabel")}</p>
      <div className="flex gap-2">
        {[{ code: "de", label: t("profile.languageDe") }, { code: "en", label: t("profile.languageEn") }].map(({ code, label }) => (
          <button
            key={code}
            disabled={saving}
            onClick={() => select(code)}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${lang === code ? "bg-cyan-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}
          >
            {label}
          </button>
        ))}
      </div>
    </Section>
  );
}

// ── Schnellbefehle ────────────────────────────────────────────────────────────

const emptyCmd = { label: "", command: "", hotkey: "", auto_enter: true };
const FKEYS = [
  "",
  "F2","F3","F4","F6","F7","F8","F9","F10",
  "Shift+F1","Shift+F2","Shift+F3","Shift+F4","Shift+F5","Shift+F6",
  "Shift+F7","Shift+F8","Shift+F9","Shift+F10","Shift+F11","Shift+F12",
];

function QuickCommandsSection() {
  const { t } = useTranslation();
  const [commands, setCommands] = useState([]);
  const [form, setForm] = useState(emptyCmd);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState(null);

  const load = () => api.get("/quick-commands").then((r) => setCommands(r.data));
  useEffect(() => { load(); }, []);

  const startEdit = (cmd) => { setEditId(cmd.id); setForm({ label: cmd.label, command: cmd.command, hotkey: cmd.hotkey ?? "", auto_enter: cmd.auto_enter ?? true }); setError(null); };
  const cancelEdit = () => { setEditId(null); setForm(emptyCmd); setError(null); };

  const save = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      if (editId) {
        await api.patch(`/quick-commands/${editId}`, { ...form, hotkey: form.hotkey || null });
      } else {
        await api.post("/quick-commands", { ...form, hotkey: form.hotkey || null, sort_order: commands.length });
      }
      cancelEdit();
      load();
    } catch (e) {
      setError(e.response?.data?.detail ?? t("profile.quickCommandError"));
    }
  };

  const remove = async (id) => {
    if (!confirm(t("profile.quickCommandDeleteConfirm"))) return;
    await api.delete(`/quick-commands/${id}`);
    load();
  };

  const move = async (index, dir) => {
    const next = [...commands];
    const swap = index + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    setCommands(next);
    await api.post("/quick-commands/reorder", next.map((c) => c.id));
  };

  return (
    <Section title={t("profile.quickCommandsTitle")}>
      <p className="text-xs text-gray-500 mb-4">
        {t("profile.quickCommandsSubtitle")}
      </p>
      <div className="space-y-2 mb-4">
        {commands.length === 0 && (
          <p className="text-gray-500 text-sm">{t("profile.quickCommandsNone")}</p>
        )}
        {commands.map((cmd, i) => (
          editId === cmd.id ? (
            <form key={cmd.id} onSubmit={save} className="flex gap-2 items-center flex-wrap">
              <input className={input("w-28 shrink-0")} placeholder={t("profile.quickCommandLabelPlaceholder")} value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })} required autoFocus />
              <input className={input("flex-1 min-w-0 font-mono text-xs")} placeholder={t("profile.quickCommandPlaceholder")} value={form.command}
                onChange={(e) => setForm({ ...form, command: e.target.value })} required />
              <select className={input("w-24 shrink-0")} value={form.hotkey}
                onChange={(e) => setForm({ ...form, hotkey: e.target.value })}>
                {FKEYS.map((k) => <option key={k} value={k}>{k || "—"}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-gray-400 shrink-0 cursor-pointer" title={t("terminal.noEnter").trim()}>
                <input type="checkbox" checked={form.auto_enter} onChange={(e) => setForm({ ...form, auto_enter: e.target.checked })} className="accent-cyan-500" />
                ⏎
              </label>
              <button type="submit" className="px-3 py-2 bg-cyan-600 hover:bg-cyan-500 rounded text-sm transition-colors">✓</button>
              <button type="button" onClick={cancelEdit} className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors">✕</button>
              {error && <p className="w-full text-red-400 text-xs">{error}</p>}
            </form>
          ) : (
            <div key={cmd.id} className="flex items-center gap-2 bg-gray-800 rounded px-3 py-2 group">
              <div className="flex flex-col gap-0.5 mr-1">
                <button onClick={() => move(i, -1)} disabled={i === 0}
                  className="text-gray-600 hover:text-gray-300 disabled:opacity-20 text-xs leading-none">▲</button>
                <button onClick={() => move(i, 1)} disabled={i === commands.length - 1}
                  className="text-gray-600 hover:text-gray-300 disabled:opacity-20 text-xs leading-none">▼</button>
              </div>
              <span className="text-white text-sm font-medium w-28 shrink-0 truncate">{cmd.label}</span>
              {cmd.hotkey && (
                <span className="text-xs px-1.5 py-0.5 bg-gray-700 text-gray-300 rounded font-mono shrink-0">{cmd.hotkey}</span>
              )}
              {!cmd.auto_enter && (
                <span className="text-xs text-gray-600 shrink-0" title={t("terminal.noEnter").trim()}>⏎̶</span>
              )}
              <span className="text-gray-400 font-mono text-xs flex-1 truncate">{cmd.command}</span>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => startEdit(cmd)} className="text-xs text-cyan-400 hover:text-cyan-300 px-2 py-1">✏</button>
                <button onClick={() => remove(cmd.id)} className="text-xs text-red-500 hover:text-red-400 px-2 py-1">✕</button>
              </div>
            </div>
          )
        ))}
      </div>

      {editId === null && (
        <form onSubmit={save} className="flex gap-2 items-center flex-wrap border-t border-gray-800 pt-4">
          <input className={input("w-28 shrink-0")} placeholder={t("profile.quickCommandLabelPlaceholder")} value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })} required />
          <input className={input("flex-1 min-w-0 font-mono text-xs")} placeholder={t("profile.quickCommandAddPlaceholder")}
            value={form.command} onChange={(e) => setForm({ ...form, command: e.target.value })} required />
          <select className={input("w-24 shrink-0")} value={form.hotkey}
            onChange={(e) => setForm({ ...form, hotkey: e.target.value })}>
            {FKEYS.map((k) => <option key={k} value={k}>{k || "—"}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-gray-400 shrink-0 cursor-pointer" title={t("terminal.noEnter").trim()}>
            <input type="checkbox" checked={form.auto_enter} onChange={(e) => setForm({ ...form, auto_enter: e.target.checked })} className="accent-cyan-500" />
            ⏎
          </label>
          <button type="submit" className="px-3 py-2 bg-cyan-600 hover:bg-cyan-500 rounded text-sm transition-colors">
            {t("profile.quickCommandAdd")}
          </button>
          {error && <p className="w-full text-red-400 text-xs">{error}</p>}
        </form>
      )}
    </Section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Profile() {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();

  const handleUpdated = async () => { await refreshUser(); };

  if (!user) return null;

  return (
    <div className="p-6 max-w-xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-white">{t("profile.title")}</h1>
      <AccountSection user={user} onUpdated={handleUpdated} />
      <PasswordSection />
      <TwoFactorSection enabled={user.totp_enabled ?? false} />
      <LanguageSection user={user} onUpdated={handleUpdated} />
      <QuickCommandsSection />
    </div>
  );
}
