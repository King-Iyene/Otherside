"use client";

import type { CoachingFlag as Flag } from "@/lib/scorecard";

const SEVERITY: Record<Flag["severity"], { color: string; bg: string; icon: string; label: string }> = {
  critical: { color: "var(--red)", bg: "rgba(240,112,112,0.12)", icon: "●", label: "CRITICAL" },
  warning: { color: "var(--accent)", bg: "rgba(242,182,60,0.10)", icon: "⚠", label: "COACHING" },
  positive: { color: "var(--green)", bg: "rgba(69,208,147,0.10)", icon: "✓", label: "STRENGTH" },
};

export default function CoachingFlagCard({ flag }: { flag: Flag }) {
  const s = SEVERITY[flag.severity];
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "12px 14px",
        borderLeft: `3px solid ${s.color}`,
        background: s.bg,
        borderRadius: 6,
        alignItems: "flex-start",
      }}
    >
      <div style={{ color: s.color, fontSize: 14, lineHeight: 1, paddingTop: 2 }}>{s.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span
            className="mono"
            style={{
              fontSize: 10,
              letterSpacing: 0.06,
              color: s.color,
              fontWeight: 600,
            }}
          >
            {s.label} · {flag.category.toUpperCase()}
          </span>
        </div>
        <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500, marginBottom: 3 }}>{flag.headline}</div>
        <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5 }}>{flag.detail}</div>
      </div>
    </div>
  );
}

export function CoachingFlagList({ flags }: { flags: Flag[] }) {
  if (flags.length === 0) {
    return (
      <div style={{ color: "var(--muted)", fontSize: 12, padding: 12 }}>
        No coaching flags in this period — stats look healthy.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {flags.map((f, i) => (
        <CoachingFlagCard key={i} flag={f} />
      ))}
    </div>
  );
}
