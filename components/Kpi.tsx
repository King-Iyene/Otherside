export interface KpiItem {
  label: string;
  value: string;
}

export default function KpiGrid({ items }: { items: KpiItem[] }) {
  return (
    <div className="kpi-grid">
      {items.map((item) => (
        <div className="kpi-card" key={item.label}>
          <div className="kpi-label">{item.label}</div>
          <div className="kpi-value mono">{item.value}</div>
        </div>
      ))}
    </div>
  );
}
