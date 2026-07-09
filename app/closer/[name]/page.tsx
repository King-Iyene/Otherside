"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { DashboardPayload } from "@/lib/types";
import { resolveRange, type RangePreset } from "@/lib/dates";
import { getBenchmarks, getScorecardWeights } from "@/lib/benchmarks";
import PulseBar from "@/components/PulseBar";
import ScorecardView, { snapshotCloser } from "@/components/ScorecardView";

const RANGE_PRESETS: { key: RangePreset; label: string }[] = [
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "mtd", label: "MTD" },
  { key: "ytd", label: "YTD" },
  { key: "all", label: "All" },
];

export default function CloserScorecardPage({ params }: { params: { name: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const closerName = decodeURIComponent(params.name);
  const compareWith = searchParams.get("compareWith") || null;

  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [preset, setPreset] = useState<RangePreset>("30d");
  const [showComparePicker, setShowComparePicker] = useState(false);

  const load = useCallback(async (fresh: boolean) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard${fresh ? "?fresh=1" : ""}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: DashboardPayload = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  const bench = useMemo(() => getBenchmarks(), []);
  const weights = useMemo(() => getScorecardWeights(), []);
  const { from, to } = resolveRange(preset);
  const daysInPeriod = useMemo(() => {
    if (!from || !to) return 30;
    return Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));
  }, [from, to]);

  const salesRows = data?.salesActivity.rows ?? [];
  const cashCollectedTotal = data ? data.cash.rows.filter((r) => !r.isTest).reduce((s, r) => s + (r.cashCollected ?? 0), 0) : 0;
  const revenueBookedTotal = data ? data.cash.rows.filter((r) => !r.isTest).reduce((s, r) => s + (r.revenue ?? 0), 0) : 0;
  const outstandingTotal = data ? data.cash.rows.filter((r) => !r.isTest).reduce((s, r) => s + (r.balance ?? 0), 0) : 0;

  const closerNames = useMemo(() => {
    const s = new Set<string>();
    for (const r of salesRows) if (r.enrManager && r.enrManager !== closerName) s.add(r.enrManager);
    return Array.from(s).sort();
  }, [salesRows, closerName]);

  const currentSnapshot = data ? snapshotCloser(closerName, salesRows, from, to) : null;
  const compareSnapshot = compareWith && data ? snapshotCloser(compareWith, salesRows, from, to) : null;

  function pickCompare(name: string) {
    setShowComparePicker(false);
    router.push(`/closer/${encodeURIComponent(closerName)}?compareWith=${encodeURIComponent(name)}`);
  }
  function clearCompare() {
    router.push(`/closer/${encodeURIComponent(closerName)}`);
  }

  return (
    <div className="app-shell">
      <PulseBar
        cashCollected={cashCollectedTotal}
        revenueBooked={revenueBookedTotal}
        updatedAt={data?.generatedAt ?? null}
        loading={loading}
        onRefresh={() => load(true)}
      />
      <div className="app-body">
        {/* Nav + controls */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
          <Link href="/" style={{ color: "var(--muted)", fontSize: 12 }}>
            ← Back to dashboard
          </Link>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 4, background: "var(--surface-2)", padding: 3, borderRadius: 8, border: "1px solid var(--line)" }}>
              {RANGE_PRESETS.map((p) => (
                <button
                  key={p.key}
                  className={`preset-btn ${preset === p.key ? "active" : ""}`}
                  onClick={() => setPreset(p.key)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {compareWith ? (
              <button
                onClick={clearCompare}
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--line)",
                  color: "var(--text)",
                  borderRadius: 8,
                  padding: "7px 14px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                ✕ Exit compare
              </button>
            ) : (
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setShowComparePicker((x) => !x)}
                  disabled={!data || closerNames.length === 0}
                  className="refresh-btn"
                  style={{ opacity: !data || closerNames.length === 0 ? 0.5 : 1 }}
                >
                  + Compare with…
                </button>
                {showComparePicker && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      right: 0,
                      background: "var(--surface-2)",
                      border: "1px solid var(--line-strong)",
                      borderRadius: 10,
                      padding: 6,
                      minWidth: 220,
                      zIndex: 30,
                      boxShadow: "0 12px 30px -12px rgba(0,0,0,0.5)",
                    }}
                  >
                    {closerNames.map((n) => (
                      <button
                        key={n}
                        onClick={() => pickCompare(n)}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          padding: "8px 12px",
                          background: "transparent",
                          border: "none",
                          color: "var(--text)",
                          fontSize: 13,
                          cursor: "pointer",
                          borderRadius: 6,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {!data ? (
          <div className="empty-state">Loading scorecard…</div>
        ) : compareWith && compareSnapshot ? (
          // Side-by-side comparison
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <ScorecardView
                closerName={closerName}
                salesRows={salesRows}
                from={from}
                to={to}
                daysInPeriod={daysInPeriod}
                bench={bench}
                weights={weights}
                compact
                compareAgainst={compareSnapshot}
              />
            </div>
            <div>
              <ScorecardView
                closerName={compareWith}
                salesRows={salesRows}
                from={from}
                to={to}
                daysInPeriod={daysInPeriod}
                bench={bench}
                weights={weights}
                compact
                compareAgainst={currentSnapshot}
              />
            </div>
          </div>
        ) : (
          <ScorecardView
            closerName={closerName}
            salesRows={salesRows}
            from={from}
            to={to}
            daysInPeriod={daysInPeriod}
            bench={bench}
            weights={weights}
          />
        )}
      </div>
      <style>{`
        @media (max-width: 900px) {
          .app-body > div[style*="grid-template-columns: 1fr 1fr"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
