import { useState, useRef, useLayoutEffect, useEffect } from "react";
import { createPortal } from "react-dom";
import useTabs from "../store/tabs";

export default function TabBar({ broadcastMode, broadcastTargets, onToggleBroadcastTarget }) {
  const { tabs, activeId, setActive, closeTab } = useTabs();
  const [overflowIdx, setOverflowIdx] = useState(tabs.length);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const containerRef = useRef(null);
  const tabRefs = useRef([]);
  const tabWidths = useRef({});
  const dropdownRef = useRef(null);
  const overflowBtnRef = useRef(null);

  // Cache tab widths while tabs are visible
  useLayoutEffect(() => {
    tabRefs.current.forEach((el, i) => {
      if (el && tabs[i] && el.offsetWidth > 0) {
        tabWidths.current[tabs[i].id] = el.offsetWidth;
      }
    });
  });

  // Recalculate which tabs fit on resize
  useLayoutEffect(() => {
    if (!containerRef.current) return;

    const calc = () => {
      const available = containerRef.current.offsetWidth - 72; // reserve for "+N" button
      let used = 0;
      let breakAt = tabs.length;
      for (let i = 0; i < tabs.length; i++) {
        used += (tabWidths.current[tabs[i].id] ?? 140) + 4;
        if (used > available) { breakAt = i; break; }
      }
      setOverflowIdx(breakAt);
    };

    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [tabs]);

  const openDropdown = () => {
    const rect = overflowBtnRef.current?.getBoundingClientRect();
    if (rect) setDropdownPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    setDropdownOpen((o) => !o);
  };

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e) => {
      if (!dropdownRef.current?.contains(e.target) && !overflowBtnRef.current?.contains(e.target))
        setDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  if (tabs.length === 0) return null;

  // Ensure active tab is always in visible range
  let visibleIds = new Set(tabs.slice(0, overflowIdx).map((t) => t.id));
  const activeInOverflow = activeId !== null && !visibleIds.has(activeId) && overflowIdx < tabs.length;
  if (activeInOverflow && overflowIdx > 0) {
    // Swap last visible tab with active tab
    const lastVisibleId = tabs[overflowIdx - 1].id;
    visibleIds.delete(lastVisibleId);
    visibleIds.add(activeId);
  }

  const visibleTabs = tabs.filter((t) => visibleIds.has(t.id));
  const hiddenTabs = tabs.filter((t) => !visibleIds.has(t.id));

  const renderTab = (tab, ref) => {
    const isActive = tab.id === activeId;
    const isSsh = tab.mode === "ssh";
    const isTarget = broadcastMode && isSsh && broadcastTargets?.has(tab.id);
    return (
      <div
        key={tab.id}
        ref={ref}
        onClick={() => { setActive(tab.id); setDropdownOpen(false); }}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-t text-xs cursor-pointer select-none whitespace-nowrap border-t border-l border-r transition-colors ${
          isActive
            ? "bg-gray-950 border-t-2 border-t-cyan-500 border-l-gray-700 border-r-gray-700 text-white font-medium"
            : "bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300 hover:bg-gray-900"
        }`}
      >
        <span className={isSsh ? (isActive ? "text-cyan-400" : "text-gray-500") : (isActive ? "text-indigo-400" : "text-gray-600")}>
          {isSsh ? "⌨" : "📁"}
        </span>
        <span>{tab.label}</span>
        {broadcastMode && isSsh && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleBroadcastTarget(tab.id); }}
            title={isTarget ? "Aus Broadcast entfernen" : "Zu Broadcast hinzufügen"}
            className={`leading-none transition-colors ${isTarget ? "text-orange-400 hover:text-orange-300" : "text-gray-600 hover:text-gray-400"}`}
          >
            {isTarget ? "●" : "○"}
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
          className="text-gray-500 hover:text-red-400 transition-colors leading-none"
        >
          ×
        </button>
      </div>
    );
  };

  return (
    <div ref={containerRef} className="flex items-end gap-1 px-2 pt-1 bg-gray-900 border-b border-gray-700 overflow-hidden shrink-0">
      {visibleTabs.map((tab, i) => renderTab(tab, (el) => { tabRefs.current[tabs.indexOf(tab)] = el; }))}

      {hiddenTabs.length > 0 && (
        <button
          ref={overflowBtnRef}
          onClick={openDropdown}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-t text-xs border-t border-l border-r transition-colors whitespace-nowrap shrink-0 ${
            dropdownOpen
              ? "bg-gray-950 border-gray-600 text-white"
              : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:bg-gray-900"
          }`}
        >
          +{hiddenTabs.length}
        </button>
      )}
      {dropdownOpen && hiddenTabs.length > 0 && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: "fixed", top: dropdownPos.top, right: dropdownPos.right, zIndex: 9999 }}
          className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl min-w-48 py-1 max-h-80 overflow-y-auto"
        >
          {hiddenTabs.map((tab) => {
            const isActive = tab.id === activeId;
            const isSsh = tab.mode === "ssh";
            return (
              <div
                key={tab.id}
                onClick={() => { setActive(tab.id); setDropdownOpen(false); }}
                className={`flex items-center gap-2 px-3 py-2 text-xs cursor-pointer transition-colors ${
                  isActive ? "bg-cyan-900/40 text-white" : "text-gray-400 hover:bg-gray-800 hover:text-white"
                }`}
              >
                <span className={isSsh ? "text-cyan-400" : "text-indigo-400"}>{isSsh ? "⌨" : "📁"}</span>
                <span className="flex-1 truncate">{tab.label}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                  className="text-gray-600 hover:text-red-400 transition-colors ml-1"
                >×</button>
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
