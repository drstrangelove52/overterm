import { useEffect, useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { isMobile } from "../utils/device";
const isTouch = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import useAuth from "../store/auth";
import useTabs from "../store/tabs";
import TabBar from "./TabBar";
import Terminal from "./Terminal";
import SftpBrowser from "./SftpBrowser";
import api from "../api/client";

function NavItem({ to, icon, label, end, onClick, forceInactive }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors ${
          isActive && !forceInactive ? "bg-cyan-600 text-white" : "text-gray-400 hover:bg-gray-800 hover:text-white"
        }`
      }
    >
      <span>{icon}</span>
      {label}
    </NavLink>
  );
}

export default function Layout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { tabs, activeId, setActive, openTab, closeTab, clearTabs, setSessionKey } = useTabs();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [broadcastMode, setBroadcastMode] = useState(false);
  const [broadcastTargets, setBroadcastTargets] = useState(new Set());
  const broadcastTargetsRef = useRef(new Set());
  const termSendRefs = useRef({});
  const [tmuxSessions, setTmuxSessions] = useState([]);

  useEffect(() => {
    fetch("/health")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.hostname) document.title = `OverTerm - ${d.hostname}`; })
      .catch(() => {});
  }, []);

  const loadTmuxSessions = useCallback(() => {
    api.get("/sessions/active").then((r) => setTmuxSessions(r.data)).catch(() => {});
  }, []);

  const killTmuxSession = useCallback((id) => {
    setTmuxSessions((prev) => prev.filter((s) => s.id !== id));
    api.delete(`/sessions/active/${id}`).catch(() => {});
  }, []);

  useEffect(() => {
    loadTmuxSessions();
    const interval = setInterval(loadTmuxSessions, 15000);
    return () => clearInterval(interval);
  }, [loadTmuxSessions]);

  // open-tab-Namen der aktuell laufenden tmux-Sessions
  const openTmuxNames = new Set(tabs.map((t) => t.tmuxName).filter(Boolean));

  const sshTabs = tabs.filter((t) => t.mode === "ssh");

  const broadcastToOthers = useCallback((sourceTabId, data) => {
    broadcastTargetsRef.current.forEach((targetId) => {
      if (targetId !== sourceTabId) termSendRefs.current[targetId]?.(data);
    });
  }, []);

  const toggleBroadcastTarget = useCallback((tabId) => {
    setBroadcastTargets((prev) => {
      const next = new Set(prev);
      next.has(tabId) ? next.delete(tabId) : next.add(tabId);
      broadcastTargetsRef.current = next;
      return next;
    });
  }, []);

  const handleToggleBroadcast = useCallback(() => {
    setBroadcastMode((on) => {
      if (!on) {
        const all = new Set(sshTabs.map((t) => t.id));
        setBroadcastTargets(all);
        broadcastTargetsRef.current = all;
      }
      return !on;
    });
  }, [sshTabs]);

  useEffect(() => {
    if (broadcastMode && sshTabs.length < 2) {
      setBroadcastMode(false);
      setBroadcastTargets(new Set());
      broadcastTargetsRef.current = new Set();
    }
  }, [sshTabs.length, broadcastMode]);

  const handleLogout = async () => { clearTabs(); await logout(); navigate("/login"); };

  const closeSidebar = () => setSidebarOpen(false);
  const handleNavClick = () => { setActive(null); closeSidebar(); };

  useEffect(() => {
    const handler = (e) => {
      if (tabs.some((t) => t.mode === "ssh")) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [tabs]);

  const navItems = [
    { to: "/", label: t("nav.hosts"), icon: "🖥" },
    { to: "/keys", label: t("nav.keys"), icon: "🔑" },
    { to: "/credentials", label: t("nav.credentials"), icon: "🔐" },
  ];

  const sidebarContent = (
    <>
      <nav className="flex-1 min-h-0 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, label, icon }) => (
          <NavItem key={to} to={to} icon={icon} label={label} end={to === "/"} onClick={handleNavClick} forceInactive={activeId !== null} />
        ))}
        {user?.is_admin && (
          <>
            <NavItem to="/active-sessions" icon="▶" label={t("nav.activeSessions")} onClick={handleNavClick} forceInactive={activeId !== null} />
            <NavItem to="/admin" icon="⚙" label={t("nav.admin")} onClick={handleNavClick} forceInactive={activeId !== null} />
          </>
        )}
        {tmuxSessions.filter((s) => !openTmuxNames.has(s.tmux_name)).length > 0 && (
          <div className="pt-3 mt-3 border-t border-gray-800">
            <div className="px-3 mb-2">
              <span className="text-xs text-gray-600 uppercase tracking-wider">{t("sidebar.runningSessions")}</span>
            </div>
            {tmuxSessions.filter((s) => !openTmuxNames.has(s.tmux_name)).map((s) => (
              <div
                key={s.id}
                onClick={() => { openTab({ id: s.host_id, name: s.host_name }, "ssh", null, { tmuxResume: s.tmux_name }); closeSidebar(); loadTmuxSessions(); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-colors cursor-pointer text-green-500 hover:bg-gray-800 hover:text-green-400"
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.connected_clients?.length > 0 ? "bg-green-500" : "bg-yellow-500"}`} />
                <span className="truncate flex-1">{s.host_name}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); killTmuxSession(s.id); }}
                  className="text-current opacity-40 hover:opacity-100 hover:text-red-400 transition-all leading-none shrink-0"
                  title={t("sidebar.killSession")}
                >×</button>
              </div>
            ))}
          </div>
        )}

        {tabs.length > 0 && (
          <div className="pt-3 mt-3 border-t border-gray-800">
            <div className="px-3 mb-2 flex items-center justify-between">
              <span className="text-xs text-gray-600 uppercase tracking-wider">{t("sidebar.sessions")}</span>
              <div className="flex items-center gap-1">
                {sshTabs.length >= 2 && (
                  <button
                    onClick={handleToggleBroadcast}
                    className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                      broadcastMode ? "bg-orange-600 text-white" : "text-gray-600 hover:text-gray-300"
                    }`}
                  >
                    {broadcastMode ? "🔊" : "🔇"}
                  </button>
                )}
                <button
                  onClick={() => { if (confirm(t("sidebar.closeAllConfirm", { count: tabs.length }))) clearTabs(); }}
                  className="text-xs text-gray-600 hover:text-red-400 px-1.5 py-0.5 rounded transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
            {tabs.map((tab) => (
              <div
                key={tab.id}
                onClick={() => { setActive(tab.id); closeSidebar(); }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-colors cursor-pointer ${
                  tab.id === activeId ? "bg-cyan-600 text-white" : "text-gray-400 hover:bg-gray-800 hover:text-white"
                }`}
              >
                <span>{tab.mode === "ssh" ? "⌨" : "📁"}</span>
                <span className="truncate flex-1">{tab.hostName}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                  className="text-current opacity-40 hover:opacity-100 hover:text-red-400 transition-all leading-none shrink-0"
                >×</button>
              </div>
            ))}
          </div>
        )}
      </nav>
      <div className="px-3 py-3 border-t border-gray-800 space-y-1 shrink-0">
        <NavItem to="/about" icon="ℹ" label={t("nav.info")} onClick={handleNavClick} />
        <NavLink
          to="/profile"
          onClick={handleNavClick}
          className={({ isActive }) =>
            `flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors ${
              isActive ? "bg-cyan-600 text-white" : "text-gray-400 hover:bg-gray-800 hover:text-white"
            }`
          }
        >
          <span>👤</span>
          <span className="truncate">{user?.username}</span>
          {user?.is_admin && <span className="ml-auto text-xs text-cyan-400 shrink-0">{t("nav.admin")}</span>}
        </NavLink>
        {isTouch && (
          <button
            onClick={() => {
              if (isMobile) localStorage.setItem("overterm-force-desktop", "1");
              else localStorage.removeItem("overterm-force-desktop");
              location.reload();
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors w-full"
          >
            <span>{isMobile ? "🖥" : "📱"}</span>
            {isMobile ? t("sidebar.desktopView") : t("sidebar.mobileView")}
          </button>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-3 py-1.5 rounded text-sm text-gray-400 hover:bg-gray-800 hover:text-red-400 transition-colors w-full"
        >
          <span>↩</span> {t("nav.logout")}
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-20 lg:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar — fixed drawer on mobile/tablet, static on desktop */}
      <aside
        className={`
          fixed lg:relative inset-y-0 left-0 z-30
          h-dvh w-56 bg-sidebar flex flex-col shrink-0
          transition-transform duration-200 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="w-6 h-6" />
            <span className="text-cyan-400 font-mono font-bold text-lg">OverTerm</span>
          </div>
          <button
            className="lg:hidden text-gray-500 hover:text-white text-xl leading-none"
            onClick={closeSidebar}
          >
            ✕
          </button>
        </div>
        {sidebarContent}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile top bar with hamburger */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-2.5 border-b border-gray-800 bg-sidebar shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-400 hover:text-white"
            aria-label={t("sidebar.openMenu")}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3 5h14a1 1 0 010 2H3a1 1 0 010-2zm0 4h14a1 1 0 010 2H3a1 1 0 010-2zm0 4h14a1 1 0 010 2H3a1 1 0 010-2z" clipRule="evenodd" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="w-5 h-5" />
            <span className="text-cyan-400 font-mono font-bold">OverTerm</span>
          </div>
        </div>

        <TabBar
          broadcastMode={broadcastMode}
          broadcastTargets={broadcastTargets}
          onToggleBroadcastTarget={toggleBroadcastTarget}
        />
        {broadcastMode && broadcastTargets.size >= 2 && (
          <div className="shrink-0 flex items-center gap-2 px-3 py-1 bg-orange-950 border-b border-orange-800">
            <span className="text-orange-400 text-xs font-medium">{t("sidebar.broadcastActive", { count: broadcastTargets.size })}</span>
          </div>
        )}
        {broadcastMode && broadcastTargets.size < 2 && (
          <div className="shrink-0 flex items-center gap-2 px-3 py-1 bg-gray-900 border-b border-gray-700">
            <span className="text-gray-500 text-xs">{t("sidebar.broadcastSelectPrompt")}</span>
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          {tabs.map((tab) => (
            <div key={tab.id} className={`h-full ${tab.id === activeId ? "block" : "hidden"}`}>
              {tab.mode === "ssh" ? (
                <Terminal
                  hostId={tab.hostId}
                  tabId={tab.id}
                  initialSessionKey={tab.sessionKey}
                  initialTmuxName={tab.tmuxName}
                  tmuxResume={tab.tmuxResume}
                  onSessionKey={(key, tmuxName) => { setSessionKey(tab.id, key, tmuxName); if (tmuxName) loadTmuxSessions(); }}
                  onClose={() => { delete termSendRefs.current[tab.id]; closeTab(tab.id); loadTmuxSessions(); }}
                  initialCommand={tab.initialCommand}
                  onRegisterSend={(fn) => {
                    if (fn) termSendRefs.current[tab.id] = fn;
                    else delete termSendRefs.current[tab.id];
                  }}
                  onBroadcastInput={broadcastMode && broadcastTargets.has(tab.id) && broadcastTargets.size >= 2 ? (data) => broadcastToOthers(tab.id, data) : null}
                  onOpenSftp={async () => {
                    let initialPath = null;
                    if (tab.sessionKey) {
                      try {
                        const res = await api.get(`/sftp/${tab.hostId}/cwd`, { params: { session_key: tab.sessionKey } });
                        initialPath = res.data.path;
                      } catch {}
                    }
                    openTab({ id: tab.hostId, name: tab.hostName }, "sftp", null, { initialPath });
                  }}
                  onOpenSftpRoot={async () => {
                    let initialPath = null;
                    if (tab.sessionKey) {
                      try {
                        const res = await api.get(`/sftp/${tab.hostId}/cwd`, { params: { session_key: tab.sessionKey } });
                        initialPath = res.data.path;
                      } catch {}
                    }
                    openTab({ id: tab.hostId, name: tab.hostName }, "sftp", null, { initialPath, sftpRoot: true });
                  }}
                />
              ) : (
                <SftpBrowser
                  hostId={tab.hostId}
                  hostName={tab.hostName}
                  sftpRoot={tab.sftpRoot || false}
                  initialPath={tab.initialPath}
                  onClose={() => {}}
                  onOpenTerminal={(path) =>
                    openTab({ id: tab.hostId, name: tab.hostName }, "ssh", `cd ${path}\r`)
                  }
                />
              )}
            </div>
          ))}
          <div className={`h-full overflow-auto ${activeId === null ? "block" : "hidden"}`}>
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
