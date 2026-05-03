import { create } from "zustand";
import { persist } from "zustand/middleware";

const useTabs = create(
  persist(
    (set, get) => ({
      tabs: [],
      activeId: null,
      _nextId: 1,

      openTab: (host, mode, initialCommand = null, options = {}) => {
        const id = get()._nextId;
        const sftpRoot = options.sftpRoot || false;
        const initialPath = options.initialPath || null;
        const tmuxResume = options.tmuxResume || null;
        const label = mode === "sftp" && sftpRoot
          ? `SFTP✦ · ${host.name}`
          : `${mode.toUpperCase()} · ${host.name}`;
        set((s) => ({
          tabs: [...s.tabs, { id, hostId: host.id, hostName: host.name, mode, label, sessionKey: null, tmuxName: null, initialCommand, sftpRoot, initialPath, tmuxResume }],
          activeId: id,
          _nextId: s._nextId + 1,
        }));
      },

      setSessionKey: (tabId, key, tmuxName = null) => {
        set((s) => ({
          tabs: s.tabs.map((t) => t.id === tabId ? { ...t, sessionKey: key, tmuxName: tmuxName ?? t.tmuxName } : t),
        }));
      },

      closeTab: (id) => {
        set((s) => {
          const tabs = s.tabs.filter((t) => t.id !== id);
          const activeId =
            s.activeId === id
              ? tabs.length > 0 ? tabs[tabs.length - 1].id : null
              : s.activeId;
          return { tabs, activeId };
        });
      },

      clearTabs: () => set({ tabs: [], activeId: null }),

      setActive: (id) => set({ activeId: id }),
    }),
    { name: "overterm-tabs" }
  )
);

export default useTabs;
