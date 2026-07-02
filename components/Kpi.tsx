import type { Delta } from "@/lib/comparison";

export interface KpiItem {
  label: string;
  value: string;
  delta?: Delta | null;
  /** When false, a positive delta renders red and negative renders green (e.g. "Outstanding Balance"). */
  higherIsBetter?: boolean;
}

function DeltaBadge({ delta, higherIsBetter = true }: { delta: Delta; higherIsBetter?: boolean }) {
  if (delta.pct === null) return <span className="kpi-delta muted">vs prev n/a</span>;
  const isFlat = Math.abs(delta.pct) < 0.001;
  const isUp = delta.pct > 0;
  const isGood = isFlat ? null : isUp === higherIsBetter;
  const cls = isFlat ? "muted" : isGood ? "green" : "red";
  const arrow = isFlat ? "→" : isUp ? "▲" : "▼";
  return (
    <span className={`kpi-delta ${cls}`}>
      {arrow} {Math.abs(delta.pct * 100).toFixed(1)}% vs prev
    </span>
  );
}

export default function KpiGrid({ items }: { items: KpiItem[] }) {
  return (
    <div className="kpi-grid">
      {items.map((item) => (
        <div className="kpi-card" key={item.label}>
          <div className="kpi-label">{item.label}</div>
          <div className="kpi-value mono">{item.value}</div>
          {item.delta && <DeltaBadge delta={item.delta} higherIsBetter={item.higherIsBetter ?? true} />}
        </div>
      ))}
    </div>
  );
}
