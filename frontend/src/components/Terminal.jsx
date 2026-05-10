import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import api from "../api/client";

import { isMobile } from "../utils/device";

const NORMAL_KEYS = [
  { label: "Esc",  data: "\x1b" },
  { label: "Tab",  data: "\t" },
  { label: "Ctrl", ctrl: true },
  { label: "↑",   data: "\x1b[A" },
  { label: "↓",   data: "\x1b[B" },
  { label: "←",   data: "\x1b[D" },
  { label: "→",   data: "\x1b[C" },
  { label: "|",   data: "|" },
  { label: "~",   data: "~" },
  { label: "#",   data: "#" },
  { label: "/",   data: "/" },
  { label: "!",   data: "!" },
];

const CTRL_KEYS = ["C","D","Z","L","W","A","E","R","U","K"].map((k) => ({
  label: `^${k}`,
  data: String.fromCharCode(k.charCodeAt(0) - 64),
}));

function MobileToolbar({ wsRef, broadcastInputRef, termRef }) {
  const [ctrlActive, setCtrlActive] = useState(false);

  const send = (data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "input", data }));
      broadcastInputRef?.current?.(data);
    }
  };

  const keys = ctrlActive ? CTRL_KEYS : NORMAL_KEYS;

  return (
    <div className="shrink-0 flex items-center overflow-x-auto bg-gray-900 border-t border-gray-700 px-1 py-1 gap-1 select-none">
      <button
        onPointerDown={(e) => {
          e.preventDefault();
          const term = termRef?.current;
          if (!term) return;
          if (term.buffer?.active?.type === "alternate") {
            // In tmux/full-screen app: Ctrl+B + PageUp enters copy-mode and scrolls up
            if (wsRef.current?.readyState === WebSocket.OPEN)
              wsRef.current.send(JSON.stringify({ type: "input", data: "\x02\x1b[5~" }));
          } else {
            term.scrollLines(-5);
          }
        }}
        className="text-xs px-2.5 py-2 rounded bg-gray-800 text-gray-300 active:bg-gray-600 shrink-0"
      >↑↑</button>
      <button
        onPointerDown={(e) => {
          e.preventDefault();
          const term = termRef?.current;
          if (!term) return;
          if (term.buffer?.active?.type === "alternate") {
            if (wsRef.current?.readyState === WebSocket.OPEN)
              wsRef.current.send(JSON.stringify({ type: "input", data: "\x02\x1b[6~" }));
          } else {
            term.scrollLines(5);
          }
        }}
        className="text-xs px-2.5 py-2 rounded bg-gray-800 text-gray-300 active:bg-gray-600 shrink-0"
      >↓↓</button>
      <div className="w-px h-5 bg-gray-700 shrink-0 mx-0.5" />
      {ctrlActive && (
        <button
          onPointerDown={(e) => { e.preventDefault(); setCtrlActive(false); }}
          className="text-xs px-2.5 py-2 rounded bg-gray-700 text-gray-400 shrink-0"
        >✕</button>
      )}
      {keys.map((key) => (
        <button
          key={key.label}
          onPointerDown={(e) => {
            e.preventDefault();
            if (key.ctrl) { setCtrlActive((o) => !o); return; }
            send(key.data);
            if (ctrlActive) setCtrlActive(false);
          }}
          className={`text-xs px-2.5 py-2 rounded shrink-0 transition-colors ${
            key.ctrl && ctrlActive
              ? "bg-cyan-600 text-white"
              : key.ctrl
              ? "bg-gray-700 text-cyan-400"
              : "bg-gray-800 text-gray-300 active:bg-gray-600"
          }`}
        >
          {key.label}
        </button>
      ))}
    </div>
  );
}

function resolveEscapes(str) {
  return str
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\");
}

function QuickBar({ commands, wsRef, broadcastInputRef }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);

  if (commands.length === 0) return null;

  const send = (cmd) => {
    const ws = wsRef.current;
    if (ws?.readyState !== WebSocket.OPEN) return;
    const data = resolveEscapes(cmd.command) + (cmd.auto_enter ? "\r" : "");
    ws.send(JSON.stringify({ type: "input", data }));
    broadcastInputRef?.current?.(data);
  };

  return (
    <div className="shrink-0 bg-gray-950 border-b border-gray-800">
      <div className="flex items-center gap-1 px-2 py-1 flex-wrap">
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-xs text-gray-500 hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-800 transition-colors shrink-0"
          title={t("terminal.quickbarTitle")}
        >
          ⚡
        </button>
        {open && commands.map((cmd) => (
          <button
            key={cmd.id}
            onClick={() => send(cmd)}
            title={`${cmd.command}${cmd.hotkey ? ` [${cmd.hotkey}]` : ""}${!cmd.auto_enter ? t("terminal.noEnter") : ""}`}
            className="text-xs px-2.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors whitespace-nowrap"
          >
            {cmd.label}
            {cmd.hotkey && <span className="ml-1.5 text-gray-500 font-mono">{cmd.hotkey}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Terminal({ hostId, token, tabId, initialSessionKey, initialTmuxName, tmuxResume, onSessionKey, onClose, initialCommand, onRegisterSend, onBroadcastInput, onOpenSftp, onOpenSftpRoot }) {
  const { t } = useTranslation();
  const containerRef = useRef(null);
  const wsRef = useRef(null);
  const connectRef = useRef(null);
  const searchAddonRef = useRef(null);
  const termRef = useRef(null);
  const inactivityTimerRef = useRef(null);
  const broadcastInputRef = useRef(onBroadcastInput);
  useEffect(() => { broadcastInputRef.current = onBroadcastInput; }, [onBroadcastInput]);

  const [hostKeyAlert, setHostKeyAlert] = useState(null);
  const [quickCommands, setQuickCommands] = useState([]);
  const quickCommandsRef = useRef([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const searchInputRef = useRef(null);
  const [disconnected, setDisconnected] = useState(false);
  const [activeTmuxName, setActiveTmuxName] = useState(initialTmuxName || null);

  useEffect(() => {
    if (searchOpen) setTimeout(() => searchInputRef.current?.focus(), 50);
  }, [searchOpen]);

  useEffect(() => {
    api.get("/quick-commands").then((r) => {
      setQuickCommands(r.data);
      quickCommandsRef.current = r.data;
    }).catch(() => {});
  }, []);

  const doSearch = useCallback((term, direction = "next") => {
    const addon = searchAddonRef.current;
    if (!addon || !term) return;
    if (direction === "next") addon.findNext(term, { incremental: false, caseSensitive: false });
    else addon.findPrevious(term, { caseSensitive: false });
  }, []);

  const acceptHostKey = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify({ type: "accept_hostkey" }));
    setHostKeyAlert(null);
  };

  const rejectHostKey = () => {
    wsRef.current?.close();
    setHostKeyAlert(null);
  };

  useEffect(() => {
    const unmounting = { current: false };

    const term = new XTerm({
      theme: { background: "#0a0a0a", foreground: "#e2e8f0", cursor: "#22d3ee" },
      fontFamily: "'Cascadia Code', 'Fira Code', monospace",
      fontSize: 14,
      scrollback: 5000,
      cursorBlink: true,
    });
    const fit = new FitAddon();
    const search = new SearchAddon();
    searchAddonRef.current = search;
    term.loadAddon(fit);
    term.loadAddon(search);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    termRef.current = term;
    fit.fit();
    term.focus();

    const tmuxScroll = (up) => {
      if (wsRef.current?.readyState === WebSocket.OPEN)
        // \x02[ = Ctrl+B [ (enter copy mode), then PageUp/Down
        wsRef.current.send(JSON.stringify({ type: "input", data: up ? "\x02[\x1b[5~" : "\x02[\x1b[6~" }));
    };

    const isAltScreen = () => term.buffer?.active === term.buffer?.alternate;

    // Shift+Wheel scrolls viewport or triggers tmux copy-mode scroll
    const handleWheel = (e) => {
      if (!e.shiftKey) return;
      e.preventDefault();
      if (isAltScreen()) tmuxScroll(e.deltaY < 0);
      else term.scrollLines(e.deltaY > 0 ? 5 : -5);
    };
    term.element.addEventListener("wheel", handleWheel, { passive: false });

    // Copy selected text to clipboard on selection change (PuTTY-style)
    term.onSelectionChange(() => {
      const sel = term.getSelection();
      if (sel) navigator.clipboard.writeText(sel).catch(() => {});
    });

    // PuTTY-style right-click pastes from clipboard
    const handleContextMenu = (e) => {
      e.preventDefault();
      navigator.clipboard.readText().then((text) => {
        if (text && wsRef.current?.readyState === WebSocket.OPEN)
          wsRef.current.send(JSON.stringify({ type: "input", data: text }));
      }).catch(() => {});
    };
    term.element.addEventListener("contextmenu", handleContextMenu);

    term.attachCustomKeyEventHandler((ev) => {
      if (ev.type !== "keydown") return true;
      if (ev.key === "f" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); setSearchOpen((o) => !o); return false; }
      if (ev.key === "Escape") { setSearchOpen(false); return true; }
      // Shift+PageUp/Down scrolls viewport or triggers tmux copy-mode scroll
      if (ev.key === "PageUp" && ev.shiftKey) { ev.preventDefault(); if (isAltScreen()) tmuxScroll(true); else term.scrollPages(-1); return false; }
      if (ev.key === "PageDown" && ev.shiftKey) { ev.preventDefault(); if (isAltScreen()) tmuxScroll(false); else term.scrollPages(1); return false; }
      if (!/^F([1-9]|1[0-2])$/.test(ev.key)) return true;
      const hotkey = ev.shiftKey ? `Shift+${ev.key}` : ev.key;
      const cmd = quickCommandsRef.current.find((c) => c.hotkey === hotkey);
      if (cmd) {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const data = resolveEscapes(cmd.command) + (cmd.auto_enter ? "\r" : "");
          wsRef.current.send(JSON.stringify({ type: "input", data }));
          broadcastInputRef.current?.(data);
        }
        return false;
      }
      return true;
    });

    onRegisterSend?.((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN)
        wsRef.current.send(JSON.stringify({ type: "input", data }));
    });

    term.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN)
        wsRef.current.send(JSON.stringify({ type: "input", data }));
      broadcastInputRef.current?.(data);
      // reset inactivity timer on user input
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = setTimeout(() => {
        term.writeln(`\r\n\x1b[33m${i18n.t("terminal.inactivityMessage")}\x1b[0m`);
        wsRef.current?.close();
      }, 30 * 60 * 1000);
    });

    const doResize = () => {
      fit.fit();
      if (wsRef.current?.readyState === WebSocket.OPEN)
        wsRef.current.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    };
    const resizeObserver = new ResizeObserver(doResize);
    resizeObserver.observe(containerRef.current);

    // iOS: keyboard appearance changes visualViewport height → refit
    window.visualViewport?.addEventListener("resize", doResize);

    // WebSocket connect — called on mount and on reconnect
    // tmuxNameRef tracks the current tmux session name (may arrive after connect)
    const tmuxNameRef = { current: initialTmuxName || null };

    const connect = (resumeKey) => {
      setDisconnected(false);
      setHostKeyAlert(null);

      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      let params = `token=${encodeURIComponent(token)}`;
      if (resumeKey) {
        params += `&resume=${encodeURIComponent(resumeKey)}`;
        // Also pass tmux_name so backend can re-attach if ManagedSession expired
        if (tmuxNameRef.current) params += `&tmux_resume=${encodeURIComponent(tmuxNameRef.current)}`;
      } else if (tmuxResume) {
        params += `&tmux_resume=${encodeURIComponent(tmuxResume)}`;
      }
      const ws = new WebSocket(
        `${proto}://${window.location.host}/ws/ssh/${hostId}?${params}`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      };

      const atBottom = () => {
        const buf = term.buffer.active;
        return buf.viewportY + term.rows >= buf.length;
      };

      let scrollTimer;
      const scheduleScroll = () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => term.scrollToBottom(), 400);
      };

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === "output") {
          // reset inactivity timer on server output too
          clearTimeout(inactivityTimerRef.current);
          inactivityTimerRef.current = setTimeout(() => {
            term.writeln(`\r\n\x1b[33m${i18n.t("terminal.inactivityMessage")}\x1b[0m`);
            wsRef.current?.close();
          }, 30 * 60 * 1000);
          const shouldScroll = atBottom();
          term.write(msg.data);
          if (shouldScroll) term.scrollToBottom();
          else scheduleScroll();
        } else if (msg.type === "session_key") {
          if (msg.tmux_name) { tmuxNameRef.current = msg.tmux_name; setActiveTmuxName(msg.tmux_name); }
          onSessionKey?.(msg.key, msg.tmux_name || null);
          if (!resumeKey && !tmuxResume && initialCommand)
            ws.send(JSON.stringify({ type: "input", data: initialCommand }));
        } else if (msg.type === "error") {
          term.writeln(`\r\n\x1b[31m${msg.data}\x1b[0m`);
        } else if (msg.type === "hostkey_new") {
          term.writeln(`\r\n\x1b[36m${i18n.t("terminal.hostKeySaved", { fingerprint: msg.fingerprint })}\x1b[0m\r\n`);
        } else if (msg.type === "hostkey_changed") {
          setHostKeyAlert({ fingerprint: msg.fingerprint, storedFingerprint: msg.stored_fingerprint });
        }
      };

      ws.onclose = (event) => {
        clearTimeout(scrollTimer);
        if (unmounting.current) return;
        if (event.code === 1000) {
          onSessionKey?.(null);
          term.writeln(`\r\n\x1b[33m${i18n.t("terminal.sessionEnded")}\x1b[0m`);
          setTimeout(() => onClose(), 1500);
        } else {
          term.writeln(`\r\n\x1b[33m${i18n.t("terminal.connectionLost")}\x1b[0m`);
          setDisconnected(true);
        }
      };
    };

    connectRef.current = connect;
    connect(initialSessionKey);

    // start inactivity timer
    inactivityTimerRef.current = setTimeout(() => {
      term.writeln(`\r\n\x1b[33m${i18n.t("terminal.inactivityMessage")}\x1b[0m`);
      wsRef.current?.close();
    }, 30 * 60 * 1000);

    return () => {
      onRegisterSend?.(null);
      unmounting.current = true;
      clearTimeout(inactivityTimerRef.current);
      resizeObserver.disconnect();
      window.visualViewport?.removeEventListener("resize", doResize);
      term.element?.removeEventListener("wheel", handleWheel);
      term.element?.removeEventListener("contextmenu", handleContextMenu);
      wsRef.current?.close();
      term.dispose();
    };
  }, [hostId, token]);

  return (
    <div className="flex flex-col h-full bg-black relative">
      {(onOpenSftp || onOpenSftpRoot || activeTmuxName) && (
        <div className="shrink-0 flex items-center justify-between gap-1 px-2 py-0.5 bg-gray-950 border-b border-gray-800">
          <div className="flex items-center gap-1">
            {activeTmuxName && (
              <span className="text-xs text-green-600 px-1.5 py-0.5 rounded bg-green-950 border border-green-900" title={`tmux session: ${activeTmuxName}`}>
                tmux
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {onOpenSftp && (
              <button
                onClick={onOpenSftp}
                title={t("terminal.sftpTitle")}
                className="text-xs text-gray-500 hover:text-indigo-400 px-1.5 py-0.5 rounded hover:bg-gray-800 transition-colors"
              >
                📁 SFTP
              </button>
            )}
            {onOpenSftpRoot && (
              <button
                onClick={onOpenSftpRoot}
                title={t("terminal.sftpTitleRoot")}
                className="text-xs text-gray-500 hover:text-yellow-400 px-1.5 py-0.5 rounded hover:bg-gray-800 transition-colors"
              >
                📁 SFTP✦
              </button>
            )}
          </div>
        </div>
      )}
      {!isMobile && <QuickBar commands={quickCommands} wsRef={wsRef} broadcastInputRef={broadcastInputRef} />}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden"
        onClick={() => { if (isMobile) containerRef.current?.querySelector("textarea,canvas")?.focus(); }}
      />
      {isMobile && <MobileToolbar wsRef={wsRef} broadcastInputRef={broadcastInputRef} termRef={termRef} />}

      {searchOpen && (
        <div className="absolute top-10 right-4 z-20 flex items-center gap-1 bg-gray-900 border border-gray-700 rounded shadow-lg px-2 py-1.5">
          <input
            ref={searchInputRef}
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); doSearch(e.target.value); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") doSearch(searchTerm, e.shiftKey ? "prev" : "next");
              if (e.key === "Escape") setSearchOpen(false);
            }}
            placeholder={t("terminal.searchPlaceholder")}
            className="bg-gray-800 text-gray-200 text-sm px-2 py-0.5 rounded outline-none w-48"
          />
          <button onClick={() => doSearch(searchTerm, "prev")} className="text-gray-400 hover:text-white px-1 text-xs" title={t("terminal.searchPrev")}>▲</button>
          <button onClick={() => doSearch(searchTerm, "next")} className="text-gray-400 hover:text-white px-1 text-xs" title={t("terminal.searchNext")}>▼</button>
          <button onClick={() => setSearchOpen(false)} className="text-gray-500 hover:text-white px-1 text-xs">✕</button>
        </div>
      )}

      {disconnected && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 shadow-2xl flex flex-col items-center gap-4">
            <span className="text-yellow-400 text-2xl">⚡</span>
            <p className="text-gray-300 text-sm">{t("terminal.disconnectedTitle")}</p>
            <div className="flex gap-3">
              <button
                onClick={() => connectRef.current?.()}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-sm font-medium transition-colors"
              >
                {t("terminal.reconnect")}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
              >
                {t("common.close")}
              </button>
            </div>
          </div>
        </div>
      )}

      {hostKeyAlert && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-10">
          <div className="bg-gray-900 border border-red-500 rounded-lg p-6 max-w-lg w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-red-400 text-xl">⚠</span>
              <h2 className="text-red-400 font-bold text-lg">{t("terminal.hostkeyChangedTitle")}</h2>
            </div>
            <p className="text-gray-300 text-sm mb-4">
              {t("terminal.hostkeyWarning")}
            </p>
            <div className="space-y-2 mb-6 font-mono text-xs">
              <div className="bg-gray-800 rounded p-2">
                <div className="text-gray-500 mb-1">{t("terminal.hostkeyStored")}</div>
                <div className="text-yellow-400 break-all">{hostKeyAlert.storedFingerprint}</div>
              </div>
              <div className="bg-gray-800 rounded p-2">
                <div className="text-gray-500 mb-1">{t("terminal.hostkeyNew")}</div>
                <div className="text-red-400 break-all">{hostKeyAlert.fingerprint}</div>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={rejectHostKey} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors">
                {t("terminal.hostkeyDisconnect")}
              </button>
              <button onClick={acceptHostKey} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded text-sm transition-colors">
                {t("terminal.hostkeyAccept")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
