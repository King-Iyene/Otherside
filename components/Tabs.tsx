"use client";

export const TAB_KEYS = ["overview", "insights", "cash", "appointments", "applications", "sales", "challenge", "reconciliation", "guide"] as const;
export type TabKey = (typeof TAB_KEYS)[number];

const LABELS: Record<TabKey, string> = {
  overview: "Overview",
  insights: "Insights ✦",
  cash: "Cash",
  appointments: "Appointments",
  applications: "Applications",
  sales: "Sales Activity",
  challenge: "Challenge",
  reconciliation: "Reconciliation",
  guide: "Guide 📖",
};

export default function Tabs({ active, onChange }: { active: TabKey; onChange: (t: TabKey) => void }) {
  return (
    <div className="tab-row">
      {TAB_KEYS.map((key) => (
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
