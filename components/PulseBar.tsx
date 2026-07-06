"use client";

import { formatMoney } from "@/lib/money";
import ThemeToggle from "./ThemeToggle";

interface Props {
  cashCollected: number;
  revenueBooked: number;
  outstanding: number;
  updatedAt: number | null;
  loading: boolean;
  onRefresh: () => void;
  /** Number of data-quality issues detected. Shown as a clickable chip that scrolls to the panel.
   *  Omit to hide the chip (e.g. on the closer scorecard page where there's no health panel). */
  dataQualityIssues?: number;
  /** Small caption clarifying the scope of these totals (e.g. "All-time · incl. Challenge"). */
  scopeNote?: string;
}

export default function PulseBar({
  cashCollected,
  revenueBooked,
  outstanding,
  updatedAt,
  loading,
  onRefresh,
  dataQualityIssues,
  scopeNote,
}: Props) {
  const scrollToHealth = () => {
    const el = document.querySelector(".health-panel");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const issues = dataQualityIssues ?? 0;
  const qualityTone = issues === 0 ? "green" : issues < 20 ? "amber" : "red";
  const qualityLabel = issues === 0 ? "All clean" : `${issues} issue${issues === 1 ? "" : "s"}`;

  return (
    <div className="pulse-bar">
      <div className="pulse-brand">
        <span className="pulse-brand-mark" />
        OTHERSIDE
      </div>
      <div className="pulse-metrics">
        {scopeNote && (
          <span
            className="pulse-scope-note"
            style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.06, alignSelf: "center", marginRight: 4 }}
            title="Cash Collected here is the all-time total across Reborn + Challenge. Revenue Booked and Outstanding are Reborn only."
          >
            {scopeNote}
          </span>
        )}
        <div className="pulse-metric">
          <span className="pulse-metric-label">Cash Collected</span>
          <span className="pulse-metric-value green mono">{formatMoney(cashCollected)}</span>
        </div>
        <div className="pulse-metric">
          <span className="pulse-metric-label">Revenue Booked</span>
          <span className="pulse-metric-value blue mono">{formatMoney(revenueBooked)}</span>
        </div>
        <div className="pulse-metric">
          <span className="pulse-metric-label">Outstanding</span>
          <span className="pulse-metric-value red mono">{formatMoney(outstanding)}</span>
        </div>
        {dataQualityIssues !== undefined && (
          <button
            type="button"
            className={`pulse-metric pulse-quality pulse-quality-${qualityTone}`}
            onClick={scrollToHealth}
            title="Click to see the Data Health details"
          >
            <span className="pulse-metric-label">Data Quality</span>
            <span className={`pulse-metric-value mono ${qualityTone}`}>{qualityLabel}</span>
          </button>
        )}
      </div>
      <div className="pulse-actions">
        <span className="pulse-updated">
          {updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString()}` : "Loading..."}
        </span>
        <ThemeToggle />
        <button className="refresh-btn" onClick={onRefresh} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
    </div>
  );
}
