import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import api from "../api/client";

const SPEEDS = [1, 2, 5, 10];

function duration(s, t) {
  if (!s.ended_at) return t('sessions.durationRunning');
  const ms = new Date(s.ended_at + "Z") - new Date(s.started_at + "Z");
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}m ${rem}s`;
}

function fmt(dt) {
  return new Date(dt + "Z").toLocaleString("de-CH");
}

function PlayerModal({ session, onClose }) {
  const { t } = useTranslation();
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [progress, setProgress] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [chunks, setChunks] = useState(null);
  const [error, setError] = useState(null);
  const playRef = useRef(null);
  const speedRef = useRef(1);
  speedRef.current = speed;

  useEffect(() => {
    api.get(`/sessions/${session.id}/recording`)
      .then((r) => {
        const data = JSON.parse(r.data.data);
        setChunks(data);
        if (data.length > 0) setTotalTime(data[data.length - 1][0]);
      })
      .catch(() => setError(t('sessions.recordingError')));
  }, [session.id]);

  useEffect(() => {
    if (!containerRef.current) return;
    const term = new XTerm({
      theme: { background: "#0a0a0a", foreground: "#e2e8f0", cursor: "#22d3ee" },
      fontFamily: "'Cascadia Code', 'Fira Code', monospace",
      fontSize: 13,
      scrollback: 10000,
      cursorBlink: false,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;
    return () => term.dispose();
  }, []);

  const stop = useCallback(() => {
    if (playRef.current) { clearTimeout(playRef.current); playRef.current = null; }
    setPlaying(false);
  }, []);

  const playFrom = useCallback((startIdx) => {
    if (!chunks || !termRef.current) return;
    stop();
    setPlaying(true);
    let idx = startIdx;
    const schedule = () => {
      if (idx >= chunks.length) { setPlaying(false); return; }
      const [offset, data] = chunks[idx];
      const prevOffset = idx === 0 ? 0 : chunks[idx - 1][0];
      const delay = ((offset - prevOffset) * 1000) / speedRef.current;
      termRef.current.write(data);
      setProgress(offset);
      idx++;
      playRef.current = setTimeout(schedule, Math.max(0, delay));
    };
    schedule();
  }, [chunks, stop]);

  const play = useCallback(() => {
    if (!termRef.current) return;
    termRef.current.clear();
    setProgress(0);
    playFrom(0);
  }, [playFrom]);

  const seekTo = useCallback((targetTime) => {
    if (!chunks || !termRef.current) return;
    stop();
    termRef.current.clear();
    let idx = 0;
    while (idx < chunks.length && chunks[idx][0] <= targetTime) {
      termRef.current.write(chunks[idx][1]);
      idx++;
    }
    setProgress(chunks[idx - 1]?.[0] ?? targetTime);
    playFrom(idx);
  }, [chunks, stop, playFrom]);

  const handleBarClick = useCallback((e) => {
    if (!totalTime) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekTo(ratio * totalTime);
  }, [totalTime, seekTo]);

  useEffect(() => () => stop(), [stop]);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg w-full max-w-4xl flex flex-col" style={{ height: "80vh" }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div className="text-sm">
            <span className="text-gray-300 font-medium">{session.host_name}</span>
            <span className="text-gray-500 mx-2">·</span>
            <span className="text-gray-400">{session.username}</span>
            <span className="text-gray-500 mx-2">·</span>
            <span className="text-gray-500">{fmt(session.started_at)}</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">✕</button>
        </div>
        <div className="flex-1 overflow-hidden p-1 bg-black">
          {error
            ? <div className="flex items-center justify-center h-full text-red-400 text-sm">{error}</div>
            : <div ref={containerRef} className="h-full" />
          }
        </div>
        {!error && (
          <div className="px-4 py-3 border-t border-gray-700 flex items-center gap-4">
            <div className="flex-1 cursor-pointer group" onClick={handleBarClick} title={t('sessions.playerSeek')}>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden group-hover:bg-gray-600 transition-colors">
                <div className="h-full bg-cyan-500" style={{ width: totalTime ? `${(progress / totalTime) * 100}%` : "0%" }} />
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1 select-none">
                <span>{progress.toFixed(1)}s</span>
                <span>{totalTime.toFixed(1)}s</span>
              </div>
            </div>
            {playing
              ? <button onClick={stop} className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white rounded text-sm whitespace-nowrap">{t('sessions.playerStop')}</button>
              : <button onClick={play} disabled={!chunks} className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded text-sm whitespace-nowrap">{t('sessions.playerPlay')}</button>
            }
            <div className="flex items-center gap-1">
              {SPEEDS.map((s) => (
                <button key={s} onClick={() => setSpeed(s)}
                  className={`px-2 py-1 rounded text-xs ${speed === s ? "bg-cyan-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>
                  {s}×
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Sessions() {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [playbackSession, setPlaybackSession] = useState(null);
  const [selected, setSelected] = useState(new Set());

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterRecording, setFilterRecording] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    api.get("/sessions?limit=500").then((r) => {
      setSessions(r.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return sessions.filter((s) => {
      if (q && !s.host_name?.toLowerCase().includes(q) && !s.username?.toLowerCase().includes(q)) return false;
      if (filterType !== "all" && s.session_type !== filterType) return false;
      if (filterRecording && !s.has_recording) return false;
      if (dateFrom && new Date(s.started_at + "Z") < new Date(dateFrom)) return false;
      if (dateTo && new Date(s.started_at + "Z") > new Date(dateTo + "T23:59:59Z")) return false;
      return true;
    });
  }, [sessions, search, filterType, filterRecording, dateFrom, dateTo]);

  const filteredIds = useMemo(() => new Set(filtered.map((s) => s.id)), [filtered]);
  const allSelected = filtered.length > 0 && filtered.every((s) => selected.has(s.id));
  const someSelected = selected.size > 0;

  const toggleAll = () => {
    if (allSelected) {
      setSelected((prev) => { const next = new Set(prev); filtered.forEach((s) => next.delete(s.id)); return next; });
    } else {
      setSelected((prev) => { const next = new Set(prev); filtered.forEach((s) => next.add(s.id)); return next; });
    }
  };

  const toggleOne = (id) => {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const deleteSelected = async () => {
    const ids = [...selected].filter((id) => filteredIds.has(id));
    if (!ids.length || !confirm(t("sessions.deleteConfirm"))) return;
    await api.post("/sessions/bulk-delete", { ids });
    setSessions((prev) => prev.filter((s) => !ids.includes(s.id)));
    setSelected(new Set());
  };

  const deleteAll = async () => {
    if (!confirm(t('sessions.deleteAllConfirm', { count: filtered.length }))) return;
    const ids = filtered.map((s) => s.id);
    await api.post("/sessions/bulk-delete", { ids });
    setSessions((prev) => prev.filter((s) => !ids.includes(s.id)));
    setSelected(new Set());
  };

  const clearFilters = () => { setSearch(""); setFilterType("all"); setFilterRecording(false); setDateFrom(""); setDateTo(""); };
  const hasFilters = search || filterType !== "all" || filterRecording || dateFrom || dateTo;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-xl font-bold text-white mb-4">{t('sessions.title')}</h1>

      {/* Filter bar */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 mb-4 flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder={t('sessions.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 w-56"
        />
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-cyan-500">
          <option value="all">{t('sessions.allTypes')}</option>
          <option value="ssh">SSH</option>
          <option value="sftp">SFTP</option>
        </select>
        <div className="flex items-center gap-2">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-cyan-500" />
          <span className="text-gray-500 text-sm">–</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-cyan-500" />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
          <input type="checkbox" checked={filterRecording} onChange={(e) => setFilterRecording(e.target.checked)} className="accent-cyan-500" />
          {t('sessions.withRecording')}
        </label>
        {hasFilters && (
          <button onClick={clearFilters} className="text-xs text-gray-400 hover:text-white transition-colors">
            {t('sessions.clearFilters')}
          </button>
        )}
        <span className="text-xs text-gray-500 ml-auto">{t('sessions.filterCount', { filtered: filtered.length, total: sessions.length })}</span>
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div className="flex items-center gap-3 mb-3 px-1">
          <span className="text-sm text-gray-400">{t('sessions.bulkSelected', { count: selected.size })}</span>
          <button onClick={deleteSelected}
            className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white rounded text-sm transition-colors">
            {t('sessions.bulkDelete')}
          </button>
          <button onClick={() => setSelected(new Set())}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
            {t('sessions.bulkDeselect')}
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-gray-400 text-sm">{t('sessions.loading')}</div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-500 text-sm">{t('sessions.noSessions')}</div>
      ) : (
        <div className="bg-gray-900 rounded-lg overflow-hidden border border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase">
                <th className="px-4 py-3 w-8">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-cyan-500 cursor-pointer" />
                </th>
                <th className="px-4 py-3 text-left">{t('sessions.colTime')}</th>
                <th className="px-4 py-3 text-left">{t('sessions.colHost')}</th>
                <th className="px-4 py-3 text-left">{t('sessions.colUser')}</th>
                <th className="px-4 py-3 text-left">{t('sessions.colType')}</th>
                <th className="px-4 py-3 text-left">{t('sessions.colDuration')}</th>
                <th className="px-4 py-3 text-right">
                  <button onClick={deleteAll}
                    className="text-xs text-red-500 hover:text-red-400 transition-colors normal-case font-normal tracking-normal">
                    {t('sessions.deleteAll')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}
                  className={`border-b border-gray-800/50 transition-colors ${selected.has(s.id) ? "bg-gray-800/60" : "hover:bg-gray-800/30"}`}>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleOne(s.id)}
                      className="accent-cyan-500 cursor-pointer" />
                  </td>
                  <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{fmt(s.started_at)}</td>
                  <td className="px-4 py-3 text-white font-medium">{s.host_name ?? <span className="text-gray-500">—</span>}</td>
                  <td className="px-4 py-3 text-gray-300">{s.username ?? <span className="text-gray-500">—</span>}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${s.session_type === "ssh" ? "bg-cyan-900 text-cyan-300" : "bg-purple-900 text-purple-300"}`}>
                      {s.session_type.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{duration(s, t)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {s.has_recording && (
                        <button onClick={() => setPlaybackSession(s)}
                          className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs transition-colors">
                          {t('sessions.playback')}
                        </button>
                      )}
                      <button onClick={async () => {
                        if (!confirm(t('sessions.deleteConfirm'))) return;
                        await api.delete(`/sessions/${s.id}`);
                        setSessions((prev) => prev.filter((x) => x.id !== s.id));
                        setSelected((prev) => { const next = new Set(prev); next.delete(s.id); return next; });
                      }} className="px-2 py-1 bg-gray-800 hover:bg-red-900 text-gray-400 hover:text-red-300 rounded text-xs transition-colors">
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {playbackSession && (
        <PlayerModal session={playbackSession} onClose={() => setPlaybackSession(null)} />
      )}
    </div>
  );
}
