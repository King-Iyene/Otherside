"use client";

import { formatMoney } from "@/lib/money";
import ThemeToggle from "./ThemeToggle";

interface Props {
  cashCollected: number;
  revenueBooked: number;
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
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 11,
              fontWeight: 800,
              color: "#ffcf33",
              textTransform: "uppercase",
              letterSpacing: 0.04,
              alignSelf: "center",
              marginRight: 10,
              whiteSpace: "nowrap",
              textShadow: "0 0 10px rgba(255,196,0,0.35)",
            }}
            title="Cash Collected in this top bar is the all-time total across BOTH revenue streams — Reborn + Challenge. Revenue Booked is Reborn only."
          >
            {scopeNote}
            <span aria-hidden="true" style={{ fontSize: 20, fontWeight: 900, lineHeight: 1 }}>⟶</span>
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
