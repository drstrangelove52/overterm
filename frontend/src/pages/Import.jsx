import { useState } from "react";
import { useTranslation } from "react-i18next";
import Proxmox from "./Proxmox";

const SOURCES = [
  {
    id: "proxmox",
    labelKey: "import.proxmox",
    component: Proxmox,
  },
  // Weitere Quellen hier ergänzen
];

export default function Import() {
  const { t } = useTranslation();
  const [active, setActive] = useState(SOURCES[0].id);
  const ActiveComponent = SOURCES.find((s) => s.id === active)?.component ?? null;

  return (
    <div className="p-6">
      <div className="flex gap-1 mb-6 border-b border-gray-800">
        {SOURCES.map((s) => (
          <button
            key={s.id}
            onClick={() => setActive(s.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors rounded-t ${
              active === s.id
                ? "bg-gray-900 text-white border border-b-gray-900 border-gray-800 -mb-px"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {t(s.labelKey)}
          </button>
        ))}
      </div>
      {ActiveComponent && <ActiveComponent />}
    </div>
  );
}
