"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { DashboardPayload, SalesActivityRow } from "@/lib/types";
import { resolveRange, inRange, type RangePreset, bucketKey, parseDateOnly } from "@/lib/dates";
import { getBenchmarks, getScorecardWeights } from "@/lib/benchmarks";
import {
  totalsOf,
  ratesOf,
  compositeScoreOf,
  detectCoachingFlags,
  lastActivityDate,
  daysSince,
  delta,
} from "@/lib/scorecard";
import { formatMoney, formatNumber, formatPercent } from "@/lib/money";
import KpiGrid from "@/components/Kpi";
import Sparkline from "@/components/Sparkline";
import BulletChart from "@/components/BulletChart";
import { CoachingFlagList } from "@/components/CoachingFlag";
import PulseBar from "@/components/PulseBar";

const RANGE_PRESETS: { key: RangePreset; label: string }[] = [
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "mtd", label: "MTD" },
  { key: "ytd", label: "YTD" },
  { key: "all", label: "All" },
];

export default function CloserScorecardPage({ params }: { params: { name: string } }) {
  const closerName = decodeURIComponent(params.name);
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [preset, setPreset] = useState<RangePreset>("30d");

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
    if (!from || !to) return 30; // "All" — approximate for cadence math
    return Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));
  }, [from, to]);

  const salesRows = data?.salesActivity.rows ?? [];

  const closerRows = useMemo(
    () => salesRows.filter((r) => r.enrManager === closerName && inRange(r.date, from, to)),
    [salesRows, closerName, from, to]
  );

  const totals = useMemo(() => totalsOf(closerRows), [closerRows]);
  const rates = useMemo(() => ratesOf(totals), [totals]);

  // Team-wide stats (all closers except unassigned) for this period
  const teamRows = useMemo(() => salesRows.filter((r) => r.enrManager && inRange(r.date, from, to)), [salesRows, from, to]);
  const closerNames = useMemo(() => {
    const s = new Set<string>();
    for (const r of teamRows) if (r.enrManager) s.add(r.enrManager);
    return Array.from(s).sort();
  }, [teamRows]);

  const teamAvg = useMemo(() => {
    const perCloser = closerNames.map((n) => {
      const t = totalsOf(teamRows.filter((r) => r.enrManager === n));
      return { totals: t, rates: ratesOf(t) };
    });
    const n = perCloser.length || 1;
    const avgTotals = {
      cashOnCall: perCloser.reduce((s, p) => s + p.totals.cashOnCall, 0) / n,
      salesMade: perCloser.reduce((s, p) => s + p.totals.salesMade, 0) / n,
      newCalls: perCloser.reduce((s, p) => s + p.totals.newCalls, 0) / n,
    };
    const validRate = (getter: (p: (typeof perCloser)[number]) => number | null) => {
      const vs = perCloser.map(getter).filter((v): v is number => v !== null);
      return vs.length ? vs.reduce((s, v) => s + v, 0) / vs.length : null;
    };
    const avgRates = {
      showPct: validRate((p) => p.rates.showPct),
      offerPct: validRate((p) => p.rates.offerPct),
      closePctShows: validRate((p) => p.rates.closePctShows),
      closePctOffers: validRate((p) => p.rates.closePctOffers),
      avgDealSize: validRate((p) => p.rates.avgDealSize),
    };
    return { avgTotals, avgRates, perCloser };
  }, [teamRows, closerNames]);

  // Composite score + rank
  const compositeScore = compositeScoreOf(totals, rates, bench, weights, daysInPeriod);
  const rankList = useMemo(() => {
    return closerNames
      .map((n) => {
        const rows = teamRows.filter((r) => r.enrManager === n);
        const t = totalsOf(rows);
        const r = ratesOf(t);
        return { name: n, score: compositeScoreOf(t, r, bench, weights, daysInPeriod), cashOnCall: t.cashOnCall };
      })
      .sort((a, b) => b.score - a.score);
  }, [teamRows, closerNames, bench, weights, daysInPeriod]);
  const rank = rankList.findIndex((r) => r.name === closerName) + 1 || null;

  // Week-over-week
  const weekAgo = useMemo(() => {
    if (!to) return null;
    const d = new Date(to);
    d.setDate(d.getDate() - 7);
    return d;
  }, [to]);
  const twoWeeksAgo = useMemo(() => {
    if (!weekAgo) return null;
    const d = new Date(weekAgo);
    d.setDate(d.getDate() - 7);
    return d;
  }, [weekAgo]);

  const wowThisWeek = useMemo(() => {
    if (!weekAgo || !to) return null;
    const rows = salesRows.filter(
      (r) => r.enrManager === closerName && inRange(r.date, weekAgo, to)
    );
    const t = totalsOf(rows);
    return { totals: t, rates: ratesOf(t) };
  }, [salesRows, closerName, weekAgo, to]);
  const wowLastWeek = useMemo(() => {
    if (!twoWeeksAgo || !weekAgo) return null;
    const rows = salesRows.filter(
      (r) => r.enrManager === closerName && inRange(r.date, twoWeeksAgo, weekAgo)
    );
    const t = totalsOf(rows);
    return { totals: t, rates: ratesOf(t) };
  }, [salesRows, closerName, twoWeeksAgo, weekAgo]);

  const weekOverWeek = {
    cashOnCall: wowLastWeek && wowThisWeek ? delta(wowThisWeek.totals.cashOnCall, wowLastWeek.totals.cashOnCall) : null,
    showRate: wowLastWeek?.rates.showPct != null && wowThisWeek?.rates.showPct != null
      ? wowThisWeek.rates.showPct - wowLastWeek.rates.showPct
      : null,
    closeRateShows: wowLastWeek?.rates.closePctShows != null && wowThisWeek?.rates.closePctShows != null
      ? wowThisWeek.rates.closePctShows - wowLastWeek.rates.closePctShows
      : null,
  };

  const lastActivity = lastActivityDate(closerRows);
  const daysSinceLast = daysSince(lastActivity);

  const flags = useMemo(
    () =>
      detectCoachingFlags(
        totals,
        rates,
        bench,
        {
          showPct: teamAvg.avgRates.showPct,
          offerPct: teamAvg.avgRates.offerPct,
          closePctShows: teamAvg.avgRates.closePctShows,
          closePctOffers: teamAvg.avgRates.closePctOffers,
          avgDealSize: teamAvg.avgRates.avgDealSize,
        },
        teamAvg.avgTotals.cashOnCall,
        weekOverWeek,
        daysSinceLast
      ),
    [totals, rates, bench, teamAvg, weekOverWeek, daysSinceLast]
  );

  // Sparklines by day
  const dailyBuckets = useMemo(() => {
    const map = new Map<string, { cashOnCall: number; showed: number; newCalls: number; salesMade: number; offers: number }>();
    for (const r of closerRows) {
      if (!r.date) continue;
      const d = parseDateOnly(r.date);
      if (!d) continue;
      const key = bucketKey(d, "day");
      const existing = map.get(key) || { cashOnCall: 0, showed: 0, newCalls: 0, salesMade: 0, offers: 0 };
      existing.cashOnCall += r.cashCollectedOnCall ?? 0;
      existing.showed += r.showed ?? 0;
      existing.newCalls += r.newCalls ?? 0;
      existing.salesMade += r.salesMade ?? 0;
      existing.offers += r.offersMade ?? 0;
      map.set(key, existing);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [closerRows]);

  const sparkCash = dailyBuckets.map(([, v]) => v.cashOnCall);
  const sparkCalls = dailyBuckets.map(([, v]) => v.newCalls);
  const sparkSales = dailyBuckets.map(([, v]) => v.salesMade);

  // Team-avg pip helper — returns hint text + color for a KPI card
  const teamPip = (value: number | null, teamValue: number | null, formatter: (v: number) => string) => {
    if (value === null || teamValue === null) return null;
    if (teamValue === 0) return null;
    const diff = value - teamValue;
    const diffPct = diff / teamValue;
    const better = diffPct > 0.05;
    const worse = diffPct < -0.05;
    const color: "green" | "red" | "muted" = better ? "green" : worse ? "red" : "muted";
    const symbol = better ? "▲" : worse ? "▼" : "•";
    return { hint: `${symbol} team avg ${formatter(teamValue)}`, hintColor: color };
  };

  // Pace-to-benchmark calc — weekly cash-on-call target scaled to current period
  const cashTarget = (bench.weeklyCashOnCall * daysInPeriod) / 7;
  const cashPace = (bench.weeklyCashOnCall * Math.min(daysInPeriod, daysSinceStart(from))) / 7;

  const cashCollectedTotal = salesRows.filter((r) => !r.isTest).reduce((s, r) => s + (r.cashCollectedOnCall ?? 0), 0);
  const revenueBookedTotal = data?.cash.rows.filter((r) => !r.isTest).reduce((s, r) => s + (r.revenue ?? 0), 0) ?? 0;
  const outstandingTotal = data?.cash.rows.filter((r) => !r.isTest).reduce((s, r) => s + (r.balance ?? 0), 0) ?? 0;

  return (
    <div className="app-shell">
      <PulseBar
        cashCollected={cashCollectedTotal}
        revenueBooked={revenueBookedTotal}
        outstanding={outstandingTotal}
        updatedAt={data?.generatedAt ?? null}
        loading={loading}
        onRefresh={() => load(true)}
      />
      <div className="app-body">
        <div style={{ marginBottom: 20 }}>
          <Link href="/" style={{ color: "var(--muted)", fontSize: 12 }}>
            ← Back to dashboard
          </Link>
        </div>

        {!data ? (
          <div className="empty-state">Loading scorecard…</div>
        ) : (
          <>
            {/* Header */}
            <div
              style={{
                background: "var(--gradient-surface)",
                border: "1px solid var(--line)",
                borderRadius: 14,
                padding: 24,
                marginBottom: 20,
                boxShadow: "var(--shadow-card)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
                <div>
                  <div style={{ color: "var(--muted)", fontSize: 11, letterSpacing: 0.1, textTransform: "uppercase" }}>
                    Closer Scorecard
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 34,
                      fontWeight: 700,
                      marginTop: 2,
                      background: "var(--gradient-accent)",
                      backgroundClip: "text",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}
                  >
                    {closerName}
                  </div>
                  <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
                    Rank {rank ?? "—"} of {rankList.length} on team ·{" "}
                    {lastActivity ? `Last active ${lastActivity}` : "No activity logged"}
                    {daysSinceLast !== null && daysSinceLast >= 1 && ` (${daysSinceLast}d ago)`}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 48,
                      fontWeight: 600,
                      letterSpacing: "-0.03em",
                      color: compositeScore >= 90 ? "var(--green)" : compositeScore >= 60 ? "var(--accent)" : "var(--red)",
                      lineHeight: 1,
                    }}
                  >
                    {compositeScore}
                  </div>
                  <div style={{ color: "var(--muted)", fontSize: 10, letterSpacing: 0.1, textTransform: "uppercase" }}>
                    Composite score / 100
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 4, marginTop: 18, background: "var(--surface-2)", padding: 3, borderRadius: 8, border: "1px solid var(--line)", width: "fit-content" }}>
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
            </div>

            {/* Attainment (bullet chart) */}
            <div className="panel" style={{ marginBottom: 20 }}>
              <div className="panel-header">
                <div className="panel-title">Cash-on-Call Attainment</div>
                <span style={{ color: "var(--muted)", fontSize: 11 }}>
                  vs benchmark {formatMoney(bench.weeklyCashOnCall)}/wk (editable in env)
                </span>
              </div>
              <BulletChart
                current={totals.cashOnCall}
                target={cashTarget}
                pace={cashPace}
                formatter={(v) => formatMoney(v)}
              />
            </div>

            {/* KPI cards with sparklines + team pips */}
            <KpiGrid
              items={[
                {
                  label: "Cash on Call",
                  value: formatMoney(totals.cashOnCall),
                  sparkline: sparkCash,
                  sparklineColor: "var(--green)",
                  source: { source: "Sales Activity Tracker (Notion)", field: "Cash Collected on Call ($)", formula: "SUM over date range, filtered by Enr Manager" },
                  ...(teamPip(totals.cashOnCall, teamAvg.avgTotals.cashOnCall, (v) => formatMoney(v)) || {}),
                },
                {
                  label: "Sales Made",
                  value: formatNumber(totals.salesMade),
                  sparkline: sparkSales,
                  sparklineColor: "var(--accent)",
                  source: { source: "Sales Activity Tracker (Notion)", field: "Sales Made", formula: "SUM" },
                  ...(teamPip(totals.salesMade, teamAvg.avgTotals.salesMade, (v) => formatNumber(v)) || {}),
                },
                {
                  label: "New Calls",
                  value: formatNumber(totals.newCalls),
                  sparkline: sparkCalls,
                  sparklineColor: "var(--blue)",
                  source: { source: "Sales Activity Tracker (Notion)", field: "New Calls in Calendar", formula: "SUM" },
                  ...(teamPip(totals.newCalls, teamAvg.avgTotals.newCalls, (v) => formatNumber(v)) || {}),
                },
                {
                  label: "Show %",
                  value: formatPercent(rates.showPct),
                  source: { source: "Sales Activity Tracker (Notion)", field: "Derived", formula: "Showed to Call ÷ New Calls in Calendar" },
                  hint: `benchmark ${(bench.showPct * 100).toFixed(0)}%${teamAvg.avgRates.showPct !== null ? ` · team ${(teamAvg.avgRates.showPct * 100).toFixed(1)}%` : ""}`,
                  hintColor:
                    rates.showPct === null
                      ? "muted"
                      : rates.showPct >= bench.showPct
                      ? "green"
                      : rates.showPct < bench.showPct * 0.8
                      ? "red"
                      : "muted",
                },
                {
                  label: "Offer %",
                  value: formatPercent(rates.offerPct),
                  source: { source: "Sales Activity Tracker (Notion)", field: "Derived", formula: "Offers Made ÷ Showed to Call" },
                  hint: `benchmark ${(bench.offerPct * 100).toFixed(0)}%${teamAvg.avgRates.offerPct !== null ? ` · team ${(teamAvg.avgRates.offerPct * 100).toFixed(1)}%` : ""}`,
                  hintColor:
                    rates.offerPct === null
                      ? "muted"
                      : rates.offerPct >= bench.offerPct
                      ? "green"
                      : rates.offerPct < bench.offerPct * 0.8
                      ? "red"
                      : "muted",
                },
                {
                  label: "Close % (Shows)",
                  value: formatPercent(rates.closePctShows),
                  source: { source: "Sales Activity Tracker (Notion)", field: "Derived", formula: "Sales Made ÷ Showed to Call" },
                  hint: `benchmark ${(bench.closePctShows * 100).toFixed(0)}%${teamAvg.avgRates.closePctShows !== null ? ` · team ${(teamAvg.avgRates.closePctShows * 100).toFixed(1)}%` : ""}`,
                  hintColor:
                    rates.closePctShows === null
                      ? "muted"
                      : rates.closePctShows >= bench.closePctShows
                      ? "green"
                      : rates.closePctShows < bench.closePctShows * 0.8
                      ? "red"
                      : "muted",
                },
                {
                  label: "Close % (Offers)",
                  value: formatPercent(rates.closePctOffers),
                  source: { source: "Sales Activity Tracker (Notion)", field: "Derived", formula: "Sales Made ÷ Offers Made" },
                  hint: `benchmark ${(bench.closePctOffers * 100).toFixed(0)}%`,
                  hintColor:
                    rates.closePctOffers === null
                      ? "muted"
                      : rates.closePctOffers >= bench.closePctOffers
                      ? "green"
                      : "red",
                },
                {
                  label: "Avg Deal Size",
                  value: formatMoney(rates.avgDealSize),
                  source: { source: "Sales Activity Tracker (Notion)", field: "Derived", formula: "Sales Revenue ÷ Sales Made" },
                  hint: `benchmark ${formatMoney(bench.avgDealSize)}`,
                },
              ]}
            />

            {/* Coaching flags */}
            <div className="panel" style={{ marginBottom: 20 }}>
              <div className="panel-header">
                <div className="panel-title">
                  Coaching Flags <span style={{ color: "var(--muted)", fontSize: 12, fontWeight: 400 }}>· {flags.length} signal{flags.length === 1 ? "" : "s"} this period</span>
                </div>
              </div>
              <CoachingFlagList flags={flags} />
            </div>

            {/* Ranking on team */}
            <div className="panel" style={{ marginBottom: 20 }}>
              <div className="panel-header">
                <div className="panel-title">Composite Score — Team Ranking</div>
              </div>
              <table className="leaderboard">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Closer</th>
                    <th>Composite Score</th>
                    <th>Cash on Call</th>
                  </tr>
                </thead>
                <tbody>
                  {rankList.map((r, i) => (
                    <tr key={r.name} style={r.name === closerName ? { background: "rgba(242,182,60,0.06)" } : undefined}>
                      <td>
                        <span className="rank-pill">{i + 1}</span>
                      </td>
                      <td>
                        <Link href={`/closer/${encodeURIComponent(r.name)}`} style={{ color: "var(--text)" }}>
                          {r.name}
                        </Link>
                      </td>
                      <td className="mono">{r.score}</td>
                      <td className="mono">{formatMoney(r.cashOnCall)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Daily activity log */}
            <div className="panel">
              <div className="panel-header">
                <div className="panel-title">Daily Activity Log</div>
              </div>
              {closerRows.length === 0 ? (
                <div className="empty-state">No activity logged in this period.</div>
              ) : (
                <table className="leaderboard">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Launch</th>
                      <th>Calls</th>
                      <th>Showed</th>
                      <th>Offers</th>
                      <th>Sales</th>
                      <th>Cash on Call</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...closerRows]
                      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
                      .map((r) => (
                        <tr key={r.id}>
                          <td className="mono">{r.date || "—"}</td>
                          <td>{r.launch || "—"}</td>
                          <td className="mono">{formatNumber(r.newCalls)}</td>
                          <td className="mono">{formatNumber(r.showed)}</td>
                          <td className="mono">{formatNumber(r.offersMade)}</td>
                          <td className="mono">{formatNumber(r.salesMade)}</td>
                          <td className="mono">{formatMoney(r.cashCollectedOnCall)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Days from `from` to today (or today if from is null). Used to compute expected pace. */
function daysSinceStart(from: Date | null): number {
  if (!from) return 1;
  const now = new Date();
  const diff = Math.ceil((now.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(1, diff);
}
