"use client";

import { TAB_KEYS, type TabKey } from "@/lib/tabs";

export { TAB_KEYS };
export type { TabKey };

const LABELS: Record<TabKey, string> = {
  overview: "Overview",
  insights: "Insights ✦",
  cash: "Reborn Cash",
  payments: "Payments 🚩",
  appointments: "Appointments",
  applications: "Applications",
  sales: "Sales Activity",
  challenge: "Challenge",
  reconciliation: "Reconciliation",
  guide: "Guide 📖",
};

export default function Tabs({
  active,
  onChange,
  allowed,
}: {
  active: TabKey;
  onChange: (t: TabKey) => void;
  /** When provided, only these tabs render (role lens). Defaults to all. */
  allowed?: readonly TabKey[];
}) {
  const keys = allowed && allowed.length ? TAB_KEYS.filter((k) => allowed.includes(k)) : TAB_KEYS;
  return (
    <div className="tab-row">
      {keys.map((key) => (
        <button
          key={key}
          className={`tab-btn ${active === key ? "active" : ""}`}
          onClick={() => onChange(key)}
        >
          {LABELS[key]}
        </button>
      ))}
    </div>
  );
}
