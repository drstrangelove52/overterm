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

export default function Keys() {
  const { t } = useTranslation();
  const [keys, setKeys] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", public_key: "", private_key: "", passphrase: "" });
  const [privateFile, setPrivateFile] = useState(null);
  const [publicFile, setPublicFile] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => api.get("/ssh-keys").then((r) => setKeys(r.data));
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = { ...form };
      if (privateFile) payload.private_key = (await readFileAsText(privateFile)).trim();
      if (publicFile) payload.public_key = (await readFileAsText(publicFile)).trim();
      await api.post("/ssh-keys", payload);
      setShowModal(false);
      setForm({ name: "", public_key: "", private_key: "", passphrase: "" });
      setPrivateFile(null);
      setPublicFile(null);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || t("common.error"));
    } finally {
      setSaving(false);
    }
  };

  const deleteKey = async (id) => {
    if (!confirm(t("keys.deleteConfirm"))) return;
    await api.delete(`/ssh-keys/${id}`);
    load();
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-white">{t("keys.title")}</h1>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded text-sm font-medium transition-colors"
        >
          {t("keys.import")}
        </button>
      </div>

      {keys.length === 0 ? (
        <p className="text-gray-500 text-sm">{t("keys.noKeys")}</p>
      ) : (
        <div className="space-y-3">
          {keys.map((k) => (
            <div key={k.id} className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 flex items-center justify-between">
              <div>
                <div className="font-medium text-white text-sm">{k.name}</div>
                <div className="font-mono text-xs text-gray-500 mt-0.5">{k.fingerprint}</div>
                <div className="text-xs text-gray-600 mt-0.5">
                  {new Date(k.created_at).toLocaleDateString("de")}
                </div>
              </div>
              <button
                onClick={() => deleteKey(k.id)}
                className="text-sm text-red-500 hover:text-red-400 transition-colors ml-4"
              >
                {t("common.delete")}
              </button>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title={t("keys.modalTitle")} onClose={() => setShowModal(false)}>
          <form onSubmit={save} className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">{t("common.name")}</label>
              <input
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">{t("keys.privateKeyLabel")}</label>
              <input type="file" accept=".pem,.key,*"
                className="w-full text-sm text-gray-300 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-gray-700 file:text-gray-300 hover:file:bg-gray-600 cursor-pointer"
                onChange={(e) => setPrivateFile(e.target.files[0] || null)} />
              {!privateFile && (
                <textarea
                  className="w-full mt-2 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-xs font-mono focus:outline-none focus:border-cyan-500 h-24 resize-none"
                  value={form.private_key}
                  onChange={(e) => setForm({ ...form, private_key: e.target.value })}
                  placeholder={t("keys.privateKeyPlaceholder")}
                />
              )}
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">{t("keys.publicKeyLabel")}</label>
              <input type="file" accept=".pub,*"
                className="w-full text-sm text-gray-300 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-gray-700 file:text-gray-300 hover:file:bg-gray-600 cursor-pointer"
                onChange={(e) => setPublicFile(e.target.files[0] || null)} />
              {!publicFile && (
                <textarea
                  className="w-full mt-2 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-xs font-mono focus:outline-none focus:border-cyan-500 h-16 resize-none"
                  value={form.public_key}
                  onChange={(e) => setForm({ ...form, public_key: e.target.value })}
                  placeholder={t("keys.publicKeyPlaceholder")}
                />
              )}
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                {t("keys.passphraseLabel")}
              </label>
              <input
                type="password"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-xs font-mono focus:outline-none focus:border-cyan-500"
                value={form.passphrase}
                onChange={(e) => setForm({ ...form, passphrase: e.target.value })}
                placeholder={t("keys.passphrasePlaceholder")}
              />
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded text-sm font-medium transition-colors"
              >
                {saving ? "..." : t("keys.importButton")}
              </button>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-sm transition-colors"
              >
                {t("common.cancel")}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
