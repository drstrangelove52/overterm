import { useState, useEffect, useRef, useMemo } from "react";
import api from "../api/client";

const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const FS_SUPPORTED = !isMobile && "showDirectoryPicker" in window;

function formatDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(dt.getDate())}.${p(dt.getMonth() + 1)}.${dt.getFullYear()} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

function formatSize(bytes) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatPerms(p) {
  if (!p) return "—";
  const map = ["---","--x","-w-","-wx","r--","r-x","rw-","rwx"];
  const oct = p.slice(-3);
  return map[parseInt(oct[0])] + map[parseInt(oct[1])] + map[parseInt(oct[2])];
}

function SortTh({ label, col, sortCol, sortDir, onSort, className = "" }) {
  const active = sortCol === col;
  return (
    <th
      onClick={() => onSort(col)}
      className={`px-3 py-1.5 cursor-pointer select-none hover:text-gray-300 whitespace-nowrap ${active ? "text-cyan-400" : "text-gray-500"} ${className}`}
    >
      {label}{active ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
    </th>
  );
}

// ── Local pane ────────────────────────────────────────────────────────────────

function LocalPane({ stateRef, refreshRef }) {
  const [dirStack, setDirStack] = useState([]);
  const [entries, setEntries] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const currentHandle = dirStack.length ? dirStack[dirStack.length - 1].handle : null;
  const path = dirStack.length ? dirStack.map((d) => d.name).join("/") : null;

  useEffect(() => { stateRef.current = { selected, entries, dirStack }; });

  const readEntries = async (handle) => {
    setLoading(true); setError(""); setSelected(new Set());
    try {
      const result = [];
      for await (const [name, h] of handle.entries()) {
        const entry = { name, handle: h, is_dir: h.kind === "directory", size: null, modified: null };
        if (!entry.is_dir) {
          try { const f = await h.getFile(); entry.size = f.size; entry.modified = new Date(f.lastModified); } catch {}
        }
        result.push(entry);
      }
      result.sort((a, b) => (a.is_dir !== b.is_dir ? (a.is_dir ? -1 : 1) : a.name.localeCompare(b.name)));
      setEntries(result);
    } catch { setError("Fehler beim Lesen des Verzeichnisses"); }
    finally { setLoading(false); }
  };

  refreshRef.current = () => currentHandle && readEntries(currentHandle);

  const pickDirectory = async () => {
    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      const stack = [{ name: handle.name, handle }];
      setDirStack(stack);
      await readEntries(handle);
    } catch (e) { if (e.name !== "AbortError") setError("Zugriff verweigert oder abgebrochen"); }
  };

  const navigate = async (entry) => {
    const newStack = [...dirStack, { name: entry.name, handle: entry.handle }];
    setDirStack(newStack);
    await readEntries(entry.handle);
  };

  const goUp = async () => {
    if (dirStack.length <= 1) return;
    const newStack = dirStack.slice(0, -1);
    setDirStack(newStack);
    await readEntries(newStack[newStack.length - 1].handle);
  };

  const toggleSelect = (e, entry) => {
    e.stopPropagation();
    setSelected((prev) => { const next = new Set(prev); next.has(entry.name) ? next.delete(entry.name) : next.add(entry.name); return next; });
  };

  return (
    <div className="flex flex-col h-full flex-1 min-w-0">
      <div className="flex items-center gap-1 px-2 py-1.5 bg-gray-900 border-b border-gray-700 shrink-0">
        <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider mr-1">Lokal</span>
        <button onClick={goUp} disabled={dirStack.length <= 1}
          className="text-gray-400 hover:text-white px-1.5 py-0.5 rounded hover:bg-gray-800 disabled:opacity-30 text-xs">↑</button>
        <button onClick={() => currentHandle && readEntries(currentHandle)} disabled={!currentHandle}
          className="text-gray-400 hover:text-white px-1.5 py-0.5 rounded hover:bg-gray-800 disabled:opacity-30 text-xs">↻</button>
        <span className="font-mono text-cyan-400 truncate flex-1 text-xs px-1">{path ?? "—"}</span>
        <button onClick={pickDirectory}
          className="text-xs px-2 py-0.5 bg-gray-700 hover:bg-gray-600 rounded whitespace-nowrap shrink-0">
          Ordner…
        </button>
      </div>
      {error && <div className="px-3 py-1 text-red-400 text-xs bg-red-950/30">{error}</div>}
      <div className="flex-1 overflow-auto">
        {!currentHandle ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
            {!FS_SUPPORTED ? (
              <p className="text-amber-400 text-sm">
                Dieser Browser unterstützt die File System API nicht.<br />
                <span className="text-gray-500 text-xs">Bitte Chrome oder Edge verwenden.</span>
              </p>
            ) : (
              <>
                <p className="text-gray-500 text-sm">Kein lokaler Ordner geöffnet.</p>
                <button onClick={pickDirectory}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors">
                  Lokalen Ordner wählen
                </button>
              </>
            )}
          </div>
        ) : loading ? (
          <div className="p-4 text-gray-500 text-xs">Lädt...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 border-b border-gray-800 sticky top-0 bg-gray-950">
              <tr>
                <th className="text-left px-3 py-1.5">Name</th>
                <th className="text-right px-3 py-1.5">Größe</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.name}
                  className={`border-b border-gray-900 cursor-pointer select-none ${selected.has(entry.name) ? "bg-cyan-900/40" : "hover:bg-gray-900"}`}
                  onClick={(e) => entry.is_dir ? navigate(entry) : toggleSelect(e, entry)}
                >
                  <td className="px-3 py-1 flex items-center gap-2">
                    <span className="text-sm">{entry.is_dir ? "📁" : "📄"}</span>
                    <span className={entry.is_dir ? "text-cyan-300" : "text-gray-200"}>{entry.name}</span>
                  </td>
                  <td className="px-3 py-1 text-right text-gray-500 text-xs">{entry.is_dir ? "—" : formatSize(entry.size)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Remote pane ───────────────────────────────────────────────────────────────

function RemotePane({ hostId, sftpRoot, initialPath, stateRef, refreshRef, onOpenTerminal }) {
  const [path, setPath] = useState(initialPath || "/");
  const [entries, setEntries] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newDirName, setNewDirName] = useState("");
  const [showNewDir, setShowNewDir] = useState(false);
  const [uploads, setUploads] = useState([]);
  const [sortCol, setSortCol] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [renaming, setRenaming] = useState(null);
  const [clipboard, setClipboard] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [lastSelected, setLastSelected] = useState(null);
  const fileInputRef = useRef();
  const renameInputRef = useRef();
  const selectAllRef = useRef();

  useEffect(() => { stateRef.current = { selected, entries, path }; });

  const r = sftpRoot ? { root: true } : {};

  const load = async (p) => {
    setLoading(true); setError(""); setSelected(new Set()); setLastSelected(null);
    try {
      const res = await api.get(`/sftp/${hostId}/list`, { params: { path: p, ...r } });
      setEntries(res.data);
      setPath(p);
    } catch (e) { setError(e.response?.data?.detail || "Fehler beim Laden"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(initialPath || "/"); }, [hostId]);
  refreshRef.current = () => load(path);

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      let cmp = 0;
      if (sortCol === "name") cmp = a.name.localeCompare(b.name);
      else if (sortCol === "size") cmp = (a.size || 0) - (b.size || 0);
      else if (sortCol === "modified") cmp = new Date(a.modified || 0) - new Date(b.modified || 0);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [entries, sortCol, sortDir]);

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  };

  const allSelected = sortedEntries.length > 0 && selected.size === sortedEntries.length;
  const someSelected = selected.size > 0 && !allSelected;
  useEffect(() => { if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected; }, [someSelected]);

  const toggleSelectAll = () =>
    allSelected ? setSelected(new Set()) : setSelected(new Set(sortedEntries.map((e) => e.name)));

  const toggleSelect = (e, entry) => {
    if (e.shiftKey && lastSelected) {
      const names = sortedEntries.map((e) => e.name);
      const from = names.indexOf(lastSelected);
      const to = names.indexOf(entry.name);
      if (from !== -1) {
        const range = names.slice(Math.min(from, to), Math.max(from, to) + 1);
        setSelected((prev) => { const next = new Set(prev); range.forEach((n) => next.add(n)); return next; });
        return;
      }
    } else if (e.ctrlKey || e.metaKey) {
      setSelected((prev) => { const next = new Set(prev); next.has(entry.name) ? next.delete(entry.name) : next.add(entry.name); return next; });
    } else {
      setSelected((prev) => (prev.size === 1 && prev.has(entry.name) ? new Set() : new Set([entry.name])));
    }
    setLastSelected(entry.name);
  };

  const goUp = () => {
    if (path === "/") return;
    load(path.split("/").slice(0, -1).join("/") || "/");
  };

  const deleteEntry = async (entry) => {
    if (!confirm(`Löschen: ${entry.path}?`)) return;
    try { await api.delete(`/sftp/${hostId}/delete`, { params: { path: entry.path, ...r } }); load(path); }
    catch (e) { setError(e.response?.data?.detail || "Löschen fehlgeschlagen"); }
  };

  const deleteSelected = async () => {
    if (!selected.size || !confirm(`${selected.size} Element(e) löschen?`)) return;
    for (const entry of entries.filter((e) => selected.has(e.name))) {
      try { await api.delete(`/sftp/${hostId}/delete`, { params: { path: entry.path, ...r } }); } catch {}
    }
    load(path);
  };

  const createDir = async () => {
    if (!newDirName.trim()) return;
    await api.post(`/sftp/${hostId}/mkdir`, null, { params: { path: `${path.replace(/\/$/, "")}/${newDirName}`, ...r } });
    setNewDirName(""); setShowNewDir(false); load(path);
  };

  const uploadFileList = async (files) => {
    if (!files.length) return;
    const queue = Array.from(files);
    setUploads(queue.map((f) => ({ name: f.name, done: false, error: false })));
    for (let i = 0; i < queue.length; i++) {
      const form = new FormData();
      form.append("file", queue[i]);
      try {
        await api.post(`/sftp/${hostId}/upload`, form, { params: { path, ...r } });
        setUploads((prev) => prev.map((u, idx) => idx === i ? { ...u, done: true } : u));
      } catch {
        setUploads((prev) => prev.map((u, idx) => idx === i ? { ...u, done: true, error: true } : u));
      }
    }
    load(path);
    setTimeout(() => setUploads([]), 3000);
  };

  const uploadFiles = async (e) => {
    const files = Array.from(e.target.files);
    e.target.value = "";
    await uploadFileList(files);
  };

  // Rename
  useEffect(() => { if (renaming) setTimeout(() => renameInputRef.current?.focus(), 30); }, [renaming?.name]);

  const confirmRename = async () => {
    if (!renaming) return;
    const newName = renaming.value.trim();
    if (newName && newName !== renaming.name) {
      const oldPath = `${path.replace(/\/$/, "")}/${renaming.name}`;
      const newPath = `${path.replace(/\/$/, "")}/${newName}`;
      try { await api.post(`/sftp/${hostId}/rename`, null, { params: { old_path: oldPath, new_path: newPath, ...r } }); load(path); }
      catch (e) { setError(e.response?.data?.detail || "Umbenennen fehlgeschlagen"); }
    }
    setRenaming(null);
  };

  // Clipboard
  const handleCopy = () => {
    const paths = entries.filter((e) => selected.has(e.name)).map((e) => e.path);
    if (paths.length) setClipboard({ paths, op: "copy" });
  };
  const handleCut = () => {
    const paths = entries.filter((e) => selected.has(e.name)).map((e) => e.path);
    if (paths.length) setClipboard({ paths, op: "cut" });
  };
  const handlePaste = async () => {
    if (!clipboard) return;
    try {
      for (const srcPath of clipboard.paths) {
        const name = srcPath.split("/").pop();
        const dstPath = `${path.replace(/\/$/, "")}/${name}`;
        if (clipboard.op === "copy") {
          await api.post(`/sftp/${hostId}/copy`, null, { params: { src: srcPath, dst: dstPath, ...r } });
        } else {
          await api.post(`/sftp/${hostId}/rename`, null, { params: { old_path: srcPath, new_path: dstPath, ...r } });
        }
      }
      if (clipboard.op === "cut") setClipboard(null);
      load(path);
    } catch (e) { setError(e.response?.data?.detail || "Einfügen fehlgeschlagen"); }
  };

  // D&D upload
  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false); };
  const handleDrop = async (e) => {
    e.preventDefault(); setIsDragging(false);
    await uploadFileList(Array.from(e.dataTransfer.files));
  };

  // Download selected files to browser
  const downloadSelected = async () => {
    const token = JSON.parse(localStorage.getItem("overterm-auth") || "{}").state?.token;
    for (const entry of entries.filter((e) => selected.has(e.name) && !e.is_dir)) {
      try {
        const res = await fetch(`/api/sftp/${hostId}/download?path=${encodeURIComponent(entry.path)}${sftpRoot ? "&root=true" : ""}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) continue;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = entry.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        await new Promise((r) => setTimeout(r, 200));
      } catch {}
    }
  };

  const btn = "text-xs px-2 py-0.5 rounded shrink-0 transition-colors";

  return (
    <div className="flex flex-col h-full flex-1 min-w-0">
      {/* Main toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 bg-gray-900 border-b border-gray-700 shrink-0 flex-wrap">
        <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider mr-1">
          Remote{sftpRoot && <span className="ml-1 text-purple-400" title="Root-SFTP aktiv">✦</span>}
        </span>
        <button onClick={goUp} className={`${btn} text-gray-400 hover:text-white hover:bg-gray-800`}>↑</button>
        <button onClick={() => load(path)} className={`${btn} text-gray-400 hover:text-white hover:bg-gray-800`}>↻</button>
        <span className="font-mono text-cyan-400 truncate flex-1 text-xs px-1 min-w-0">{path}</span>
        {onOpenTerminal && (
          <button onClick={() => onOpenTerminal(path)} title="Im Terminal öffnen"
            className={`${btn} bg-gray-700 hover:bg-gray-600`}>⌨</button>
        )}
        {clipboard && (
          <button onClick={handlePaste} title={clipboard.op === "cut" ? "Hierher verschieben" : "Hierher kopieren"}
            className={`${btn} bg-cyan-800 hover:bg-cyan-700 text-cyan-200`}>
            📋 {clipboard.op === "cut" ? "Verschieben" : "Einfügen"}
          </button>
        )}
        <button onClick={() => setShowNewDir((v) => !v)} className={`${btn} bg-gray-700 hover:bg-gray-600`}>+ Ordner</button>
        <button onClick={() => fileInputRef.current.click()} className={`${btn} bg-cyan-700 hover:bg-cyan-600`}>Upload</button>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={uploadFiles} />
      </div>

      {/* Selection action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-1 px-2 py-1 bg-gray-900/80 border-b border-gray-700 shrink-0 flex-wrap">
          <span className="text-xs text-gray-400 mr-1">{selected.size} ausgewählt</span>
          <button onClick={handleCopy} className={`${btn} bg-gray-700 hover:bg-gray-600 text-gray-200`}>Kopieren</button>
          <button onClick={handleCut} className={`${btn} bg-gray-700 hover:bg-gray-600 text-gray-200`}>Ausschneiden</button>
          <button onClick={downloadSelected} title="Nur Dateien, keine Ordner"
            className={`${btn} bg-gray-700 hover:bg-gray-600 text-gray-200`}>⬇ Download</button>
          <button onClick={deleteSelected} className={`${btn} bg-red-900 hover:bg-red-800 text-red-200`}>✕ Löschen</button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-gray-500 hover:text-gray-300 px-1">✕</button>
        </div>
      )}

      {/* New folder input */}
      {showNewDir && (
        <div className="flex gap-2 px-3 py-1.5 bg-gray-900 border-b border-gray-700 shrink-0">
          <input className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs"
            placeholder="Ordnername" value={newDirName}
            onChange={(e) => setNewDirName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createDir()} autoFocus />
          <button onClick={createDir} className="px-3 py-1 bg-cyan-700 hover:bg-cyan-600 rounded text-xs">Erstellen</button>
        </div>
      )}

      {/* Upload progress */}
      {uploads.length > 0 && (
        <div className="px-3 py-1.5 bg-gray-900 border-b border-gray-700 space-y-0.5 shrink-0">
          {uploads.map((u, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className={u.error ? "text-red-400" : u.done ? "text-green-400" : "text-gray-400"}>
                {u.error ? "✕" : u.done ? "✓" : "⟳"}
              </span>
              <span className="truncate text-gray-300">{u.name}</span>
            </div>
          ))}
        </div>
      )}

      {error && <div className="px-3 py-1 text-red-400 text-xs bg-red-950/30 shrink-0">{error}</div>}

      {/* File list with D&D */}
      <div
        className={`flex-1 overflow-auto relative ${isDragging ? "ring-2 ring-cyan-500 ring-inset" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="absolute inset-0 bg-cyan-900/30 flex items-center justify-center z-10 pointer-events-none">
            <span className="text-cyan-300 text-sm font-medium">Dateien hier ablegen zum Hochladen</span>
          </div>
        )}
        {loading ? (
          <div className="p-4 text-gray-500 text-xs">Lädt...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs border-b border-gray-800 sticky top-0 bg-gray-950">
              <tr>
                <th className="px-3 py-1.5 w-8">
                  <input ref={selectAllRef} type="checkbox" checked={allSelected} onChange={toggleSelectAll}
                    className="accent-cyan-500 cursor-pointer" />
                </th>
                <SortTh label="Name" col="name" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} className="text-left" />
                <SortTh label="Größe" col="size" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} className="text-right hidden sm:table-cell" />
                <th className="text-left px-3 py-1.5 text-gray-500 hidden lg:table-cell">Rechte</th>
                <th className="text-left px-3 py-1.5 text-gray-500 hidden xl:table-cell">Owner</th>
                <SortTh label="Geändert" col="modified" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} className="text-right hidden md:table-cell" />
                <th className="px-3 py-1.5 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {(path !== "/" ? [{ name: "..", is_dir: true, virtual: true }, ...sortedEntries] : sortedEntries).map((entry) => {
                if (entry.virtual) return (
                  <tr key=".." className="border-b border-gray-900 hover:bg-gray-900 cursor-pointer select-none"
                    onClick={goUp}>
                    <td className="px-3 py-1 w-8" />
                    <td className="px-3 py-1" colSpan={7}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">📁</span>
                        <span className="text-gray-500">..</span>
                      </div>
                    </td>
                  </tr>
                );
                const isCut = clipboard?.op === "cut" && clipboard.paths.includes(entry.path);
                const isSelected = selected.has(entry.name);
                const isRenaming = renaming?.name === entry.name;
                return (
                  <tr key={entry.path}
                    onClick={(e) => entry.is_dir ? load(entry.path) : toggleSelect(e, entry)}
                    className={`border-b border-gray-900 select-none cursor-pointer ${isSelected ? "bg-cyan-900/40" : "hover:bg-gray-900"} ${isCut ? "opacity-40" : ""}`}
                  >
                    {/* Checkbox */}
                    <td className="px-3 py-1 w-8" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={isSelected}
                        onChange={() => {
                          setSelected((prev) => { const next = new Set(prev); next.has(entry.name) ? next.delete(entry.name) : next.add(entry.name); return next; });
                          setLastSelected(entry.name);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="accent-cyan-500 cursor-pointer" />
                    </td>
                    {/* Name */}
                    <td className="px-3 py-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm shrink-0">{entry.is_dir ? "📁" : "📄"}</span>
                        {isRenaming ? (
                          <input
                            ref={renameInputRef}
                            value={renaming.value}
                            onChange={(e) => setRenaming((r) => ({ ...r, value: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === "Enter") confirmRename(); if (e.key === "Escape") setRenaming(null); }}
                            onBlur={confirmRename}
                            onClick={(e) => { e.stopPropagation(); }}
                            className="bg-gray-800 border border-cyan-600 rounded px-1 text-xs text-white outline-none flex-1 min-w-0"
                          />
                        ) : (
                          <span className={entry.is_dir ? "text-cyan-300" : "text-gray-200"}>{entry.name}</span>
                        )}
                      </div>
                    </td>
                    {/* Size */}
                    <td className="px-3 py-1 text-right text-gray-500 text-xs hidden sm:table-cell">
                      {entry.is_dir ? "—" : formatSize(entry.size)}
                    </td>
                    {/* Permissions */}
                    <td className="px-3 py-1 text-gray-600 text-xs font-mono hidden lg:table-cell">
                      {formatPerms(entry.permissions)}
                    </td>
                    {/* Owner:Group */}
                    <td className="px-3 py-1 text-gray-400 text-xs font-mono hidden xl:table-cell">
                      {entry.owner ? `${entry.owner}:${entry.group ?? "?"}` : "—"}
                    </td>
                    {/* Modified */}
                    <td className="px-3 py-1 text-right text-gray-500 text-xs hidden md:table-cell">
                      {formatDate(entry.modified)}
                    </td>
                    {/* Actions */}
                    <td className="px-3 py-1 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setRenaming({ name: entry.name, value: entry.name })}
                        title="Umbenennen" className="text-xs text-gray-500 hover:text-gray-300 px-1">✎</button>
                      <button onClick={() => deleteEntry(entry)}
                        className="text-xs text-red-500 hover:text-red-400 px-1">✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SftpBrowser({ hostId, hostName, sftpRoot = false, initialPath, onOpenTerminal }) {
  const localStateRef = useRef({});
  const remoteStateRef = useRef({});
  const localRefreshRef = useRef(null);
  const remoteRefreshRef = useRef(null);
  const [transfers, setTransfers] = useState([]);

  const addTransfer = (name, direction, status) =>
    setTransfers((prev) => {
      const next = prev.filter((t) => !(t.name === name && t.direction === direction));
      return [...next, { name, direction, status }];
    });

  const copyToRemote = async () => {
    const { selected, entries } = localStateRef.current;
    const { path } = remoteStateRef.current;
    if (!selected?.size) return;
    for (const entry of entries.filter((e) => selected.has(e.name) && !e.is_dir)) {
      addTransfer(entry.name, "→", "pending");
      try {
        const file = await entry.handle.getFile();
        const form = new FormData();
        form.append("file", file);
        await api.post(`/sftp/${hostId}/upload`, form, { params: { path, ...(sftpRoot ? { root: true } : {}) } });
        addTransfer(entry.name, "→", "done");
      } catch { addTransfer(entry.name, "→", "error"); }
    }
    remoteRefreshRef.current?.();
  };

  const copyToLocal = async () => {
    const { selected, entries } = remoteStateRef.current;
    const { dirStack } = localStateRef.current;
    if (!selected?.size) return;
    if (!dirStack?.length) { alert("Bitte zuerst einen lokalen Ordner öffnen."); return; }
    const dirHandle = dirStack[dirStack.length - 1].handle;
    const token = JSON.parse(localStorage.getItem("overterm-auth") || "{}").state?.token;
    for (const entry of entries.filter((e) => selected.has(e.name) && !e.is_dir)) {
      addTransfer(entry.name, "←", "pending");
      try {
        const res = await fetch(`/api/sftp/${hostId}/download?path=${encodeURIComponent(entry.path)}${sftpRoot ? "&root=true" : ""}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(res.statusText);
        const blob = await res.blob();
        const fh = await dirHandle.getFileHandle(entry.name, { create: true });
        const writable = await fh.createWritable();
        await writable.write(blob);
        await writable.close();
        addTransfer(entry.name, "←", "done");
      } catch { addTransfer(entry.name, "←", "error"); }
    }
    localRefreshRef.current?.();
  };

  if (!FS_SUPPORTED) {
    return (
      <div className="flex flex-col h-full bg-gray-950 text-sm">
        <RemotePane
          hostId={hostId}
          sftpRoot={sftpRoot}
          initialPath={initialPath}
          stateRef={remoteStateRef}
          refreshRef={remoteRefreshRef}
          onOpenTerminal={onOpenTerminal}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-950 text-sm">
      <div className="flex flex-1 min-h-0">
        <LocalPane stateRef={localStateRef} refreshRef={localRefreshRef} />

        {/* Transfer column */}
        <div className="flex flex-col items-center justify-center gap-4 px-1 bg-gray-900 border-x border-gray-700 shrink-0 w-10">
          <button onClick={copyToRemote} title="Markierte lokale Dateien → Remote"
            className="text-xl text-cyan-400 hover:text-white transition-colors leading-none">→</button>
          <button onClick={copyToLocal} title="Markierte Remote-Dateien → Lokal"
            className="text-xl text-cyan-400 hover:text-white transition-colors leading-none">←</button>
        </div>

        <RemotePane
          hostId={hostId}
          sftpRoot={sftpRoot}
          initialPath={initialPath}
          stateRef={remoteStateRef}
          refreshRef={remoteRefreshRef}
          onOpenTerminal={onOpenTerminal}
        />
      </div>

      {/* Transfer status bar */}
      {transfers.length > 0 && (
        <div className="shrink-0 border-t border-gray-700 bg-gray-900 px-3 py-1 flex items-center gap-1 flex-wrap max-h-12 overflow-auto">
          {transfers.slice(-10).map((t, i) => (
            <span key={i} className={`text-xs flex items-center gap-1 ${
              t.status === "error" ? "text-red-400" : t.status === "done" ? "text-green-400" : "text-gray-400"
            }`}>
              <span>{t.direction}</span>
              <span className="truncate max-w-32">{t.name}</span>
              <span>{t.status === "done" ? "✓" : t.status === "error" ? "✗" : "…"}</span>
            </span>
          ))}
          <button onClick={() => setTransfers([])} className="ml-auto text-gray-600 hover:text-gray-400 text-xs">✕</button>
        </div>
      )}
    </div>
  );
}
