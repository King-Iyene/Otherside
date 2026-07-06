import type { Delta } from "@/lib/comparison";
import Sparkline from "./Sparkline";
import DataSourceChip, { type DataSourceInfo } from "./DataSourceChip";

export interface KpiItem {
  label: string;
  value: string;
  delta?: Delta | null;
  /** When false, a positive delta renders red and negative renders green (e.g. "Outstanding Balance"). */
  higherIsBetter?: boolean;
  /** Optional sparkline data — last N periods of the same metric. */
  sparkline?: number[];
  sparklineColor?: string;
  /** Optional data provenance for the ℹ tooltip. */
  source?: DataSourceInfo;
  /** Optional click handler for drill-down. */
  onClick?: () => void;
  /** Optional supplementary line under the delta (e.g. "vs team avg 58%"). */
  hint?: string;
  hintColor?: "green" | "red" | "muted";
  /** Label for the comparison baseline, e.g. "vs prev" / "vs year ago". */
  compareLabel?: string;
}

function DeltaBadge({
  delta,
  higherIsBetter = true,
  compareLabel = "vs prev",
}: {
  delta: Delta;
  higherIsBetter?: boolean;
  compareLabel?: string;
}) {
  if (delta.pct === null) return <span className="kpi-delta muted">{compareLabel} n/a</span>;
  const isFlat = Math.abs(delta.pct) < 0.001;
  const isUp = delta.pct > 0;
  const isGood = isFlat ? null : isUp === higherIsBetter;
  const cls = isFlat ? "muted" : isGood ? "green" : "red";
  const arrow = isFlat ? "→" : isUp ? "▲" : "▼";
  return (
    <span className={`kpi-delta ${cls}`}>
      {arrow} {Math.abs(delta.pct * 100).toFixed(1)}% {compareLabel}
    </span>
  );
}

/** Extracts a short source label for display under the KPI card. */
function shortSource(info: DataSourceInfo): string {
  const s = info.source;
  if (s.includes("Cash Tracker")) return "Cash Tracker";
  if (s.includes("Appointments")) return "Appointments";
  if (s.includes("Application")) return "Applications";
  if (s.includes("Sales Activity")) return "Sales Activity";
  if (s.includes("Challenge") || s.includes("Google Sheet")) return "Challenge Sheet";
  if (s.includes("Derived")) return "Derived";
  return s.split(" (")[0];
}

export default function KpiGrid({ items }: { items: KpiItem[] }) {
  return (
    <div className="kpi-grid">
      {items.map((item) => {
        const clickable = !!item.onClick;
        return (
          <div
            key={item.label}
            className="kpi-card"
            style={clickable ? { cursor: "pointer" } : undefined}
            onClick={item.onClick}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
            onKeyDown={
              clickable
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      item.onClick?.();
                    }
                  }
                : undefined
            }
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div className="kpi-label">{item.label}</div>
              {item.source && (
                <div onClick={(e) => e.stopPropagation()}>
                  <DataSourceChip info={item.source} />
                </div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8, marginTop: 2 }}>
              <div className="kpi-value mono">{item.value}</div>
              {item.sparkline && item.sparkline.length > 1 && (
                <Sparkline values={item.sparkline} color={item.sparklineColor || "var(--accent)"} />
              )}
            </div>
            {item.delta && (
              <DeltaBadge delta={item.delta} higherIsBetter={item.higherIsBetter ?? true} compareLabel={item.compareLabel} />
            )}
            {item.hint && (
              <div className={`kpi-delta ${item.hintColor || "muted"}`} style={{ display: "block", marginTop: 2 }}>
                {item.hint}
              </div>
            )}
            {item.source && (
              <div
                style={{
                  fontSize: 9,
                  color: "var(--muted)",
                  fontFamily: "var(--font-mono)",
                  marginTop: 6,
                  paddingTop: 6,
                  borderTop: "1px dashed var(--line)",
                  letterSpacing: 0.05,
                  textTransform: "uppercase",
                }}
              >
                Source: {shortSource(item.source)}
                {item.source.field && item.source.field !== "Derived" && ` · ${item.source.field}`}
                {clickable && " · click to drill down"}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
