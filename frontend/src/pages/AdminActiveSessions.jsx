import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import api from "../api/client";
import useTabs from "../store/tabs";

function duration(startedAt) {
  const secs = Math.floor((Date.now() - new Date(startedAt + "Z")) / 1000);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function AdminActiveSessions() {
  const { t } = useTranslation();
  const { openTab } = useTabs();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [killing, setKilling] = useState(new Set());

  const load = useCallback(() => {
    api.get("/sessions/active")
      .then((r) => setSessions(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  const kill = async (id) => {
    setKilling((prev) => new Set(prev).add(id));
    setSessions((prev) => prev.filter((s) => s.id !== id));
    await api.delete(`/sessions/active/${id}`).catch(() => {});
    setKilling((prev) => { const n = new Set(prev); n.delete(id); return n; });
  };

  const connected = sessions.filter((s) => s.connected_clients.length > 0);
  const detached  = sessions.filter((s) => s.connected_clients.length === 0);

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">{t("activeSessions.title")}</h1>
          <p className="text-xs text-gray-500 mt-0.5">{t("activeSessions.subtitle")}</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5 text-gray-400">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            {t("activeSessions.connected", { count: connected.length })}
          </span>
          <span className="flex items-center gap-1.5 text-gray-400">
            <span className="w-2 h-2 rounded-full bg-yellow-500" />
            {t("activeSessions.detached", { count: detached.length })}
          </span>
          <button onClick={load} className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded transition-colors text-gray-400">
            {t("activeSessions.refresh")}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-gray-500 text-sm">{t("activeSessions.loading")}</div>
      ) : sessions.length === 0 ? (
        <div className="text-gray-500 text-sm bg-gray-900 border border-gray-800 rounded-lg p-8 text-center">
          {t("activeSessions.noSessions")}
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase border-b border-gray-800 bg-gray-950">
                <th className="text-left px-4 py-3 font-medium w-6"></th>
                <th className="text-left px-4 py-3 font-medium">{t("activeSessions.colUser")}</th>
                <th className="text-left px-4 py-3 font-medium">{t("activeSessions.colHost")}</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">{t("activeSessions.colTmux")}</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">{t("activeSessions.colStarted")}</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">{t("activeSessions.colDuration")}</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">{t("activeSessions.colConnectedFrom")}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-b border-gray-800/60 hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <span
                      className={`w-2 h-2 rounded-full inline-block ${s.connected_clients.length > 0 ? "bg-green-500" : "bg-yellow-500"}`}
                      title={s.connected_clients.length > 0 ? t("activeSessions.statusConnected", { count: s.connected_clients.length }) : t("activeSessions.statusDetached")}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-white font-medium">{s.username}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-white">{s.host_name}</div>
                    {s.host_hostname && (
                      <div className="text-xs text-gray-500 font-mono">{s.host_hostname}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="font-mono text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded">
                      {s.tmux_name}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-gray-400 text-xs">
                    {new Date(s.started_at + "Z").toLocaleString("de-CH", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-gray-400 text-xs font-mono">
                    {duration(s.started_at)}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {s.connected_clients.length === 0 ? (
                      <span className="text-xs text-gray-600">—</span>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {s.connected_clients.map((ip) => (
                          <span key={ip} className="font-mono text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded">{ip}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => openTab({ id: s.host_id, name: s.host_name }, "ssh", null, { tmuxResume: s.tmux_name })}
                        className="text-xs px-3 py-1 bg-gray-800 hover:bg-cyan-800 text-gray-300 hover:text-white rounded transition-colors"
                        title={t("activeSessions.openTitle")}
                      >
                        {t("activeSessions.openButton")}
                      </button>
                      <button
                        onClick={() => kill(s.id)}
                        disabled={killing.has(s.id)}
                        className="text-xs px-3 py-1 bg-gray-800 hover:bg-red-900 text-gray-400 hover:text-red-300 rounded transition-colors disabled:opacity-40"
                        title={t("activeSessions.killTitle")}
                      >
                        {t("activeSessions.killButton")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
