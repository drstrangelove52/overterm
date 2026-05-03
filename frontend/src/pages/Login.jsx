import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import useAuth from "../store/auth";

export default function Login() {
  const { login, verifyTotp } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [partialToken, setPartialToken] = useState(null);
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const codeRef = useRef(null);

  const submitCredentials = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await login(form.username, form.password);
      if (res?.requires_totp) {
        setPartialToken(res.partial_token);
        setTimeout(() => codeRef.current?.focus(), 50);
      } else {
        navigate("/");
      }
    } catch (err) {
      setError(err.response?.data?.detail || t("login.loginFailed"));
    } finally {
      setLoading(false);
    }
  };

  const submitTotp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await verifyTotp(partialToken, code);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.detail || t("login.invalidCode"));
      setCode("");
      codeRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-cyan-400 font-mono font-bold text-4xl">OverTerm</span>
          <p className="text-gray-500 text-sm mt-1">{t("login.tagline")}</p>
        </div>

        {!partialToken ? (
          <form onSubmit={submitCredentials} className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">{t("login.username")}</label>
              <input
                type="text"
                autoFocus
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">{t("login.password")}</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
                required
              />
            </div>
            {error && (
              <div className="bg-red-950 border border-red-800 text-red-300 text-xs rounded px-3 py-2">{error}</div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded py-2 text-sm font-medium transition-colors"
            >
              {loading ? "..." : t("login.loginButton")}
            </button>
          </form>
        ) : (
          <form onSubmit={submitTotp} className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
            <div className="text-center">
              <div className="text-white font-medium mb-1">{t("login.twoFactorTitle")}</div>
              <div className="text-gray-400 text-xs">
                {useRecovery ? t("login.twoFactorRecoveryDesc") : t("login.twoFactorCodeDesc")}
              </div>
            </div>
            <div>
              {useRecovery ? (
                <input
                  ref={codeRef}
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-F0-9-]/g, ""))}
                  placeholder="XXXXXXXX-XXXXXXXX"
                  maxLength={17}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-3 text-center text-sm font-mono tracking-widest focus:outline-none focus:border-cyan-500"
                  required
                />
              ) : (
                <input
                  ref={codeRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-3 text-center text-2xl font-mono tracking-widest focus:outline-none focus:border-cyan-500"
                  required
                />
              )}
            </div>
            {error && (
              <div className="bg-red-950 border border-red-800 text-red-300 text-xs rounded px-3 py-2">{error}</div>
            )}
            <button
              type="submit"
              disabled={loading || (!useRecovery && code.length !== 6) || (useRecovery && code.length !== 17)}
              className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded py-2 text-sm font-medium transition-colors"
            >
              {loading ? "..." : t("common.confirm")}
            </button>
            <button
              type="button"
              onClick={() => { setUseRecovery(!useRecovery); setCode(""); setError(""); setTimeout(() => codeRef.current?.focus(), 50); }}
              className="w-full text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              {useRecovery ? t("login.useAuthenticator") : t("login.useRecovery")}
            </button>
            <button
              type="button"
              onClick={() => { setPartialToken(null); setError(""); setCode(""); setUseRecovery(false); }}
              className="w-full text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              {t("login.back")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
