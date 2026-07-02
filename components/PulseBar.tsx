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
}

export default function PulseBar({ cashCollected, revenueBooked, outstanding, updatedAt, loading, onRefresh }: Props) {
  return (
    <div className="pulse-bar">
      <div className="pulse-brand">
        <span className="pulse-brand-mark" />
        OTHERSIDE
      </div>
      <div className="pulse-metrics">
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
