"use client";

import { useMemo } from "react";
import type { SalesActivityRow } from "@/lib/types";
import { inRange, bucketKey, parseDateOnly } from "@/lib/dates";
import {
  totalsOf,
  ratesOf,
  compositeScoreOf,
  detectCoachingFlags,
  lastActivityDate,
  daysSince,
  delta,
  type CloserTotals,
  type CloserRates,
} from "@/lib/scorecard";
import type { Benchmarks, ScorecardWeights } from "@/lib/benchmarks";
import { formatMoney, formatNumber, formatPercent } from "@/lib/money";
import KpiGrid from "./Kpi";
import BulletChart from "./BulletChart";
import { CoachingFlagList } from "./CoachingFlag";

interface Props {
  closerName: string;
  salesRows: SalesActivityRow[];
  from: Date | null;
  to: Date | null;
  daysInPeriod: number;
  bench: Benchmarks;
  weights: ScorecardWeights;
  /** When true, condenses layout for side-by-side comparison. */
  compact?: boolean;
  /** Optional other closer's totals/rates for inline delta display. */
  compareAgainst?: { totals: CloserTotals; rates: CloserRates; name: string } | null;
}

export interface CloserSnapshot {
  totals: CloserTotals;
  rates: CloserRates;
  compositeScore: number;
  rank: number | null;
  teamSize: number;
  lastActivity: string | null;
  daysSinceLast: number | null;
  sparklines: { cash: number[]; calls: number[]; sales: number[] };
}

export default function ScorecardView({
  closerName,
  salesRows,
  from,
  to,
  daysInPeriod,
  bench,
  weights,
  compact = false,
  compareAgainst = null,
}: Props) {
  const closerRows = useMemo(
    () => salesRows.filter((r) => r.enrManager === closerName && inRange(r.date, from, to)),
    [salesRows, closerName, from, to]
  );

  const totals = useMemo(() => totalsOf(closerRows), [closerRows]);
  const rates = useMemo(() => ratesOf(totals), [totals]);

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
    return { avgTotals, avgRates };
  }, [teamRows, closerNames]);

  const compositeScore = compositeScoreOf(totals, rates, bench, weights, daysInPeriod);
  const rankList = useMemo(
    () =>
      closerNames
        .map((n) => {
          const rows = teamRows.filter((r) => r.enrManager === n);
          const t = totalsOf(rows);
          const r = ratesOf(t);
          return { name: n, score: compositeScoreOf(t, r, bench, weights, daysInPeriod) };
        })
        .sort((a, b) => b.score - a.score),
    [teamRows, closerNames, bench, weights, daysInPeriod]
  );
  const rank = rankList.findIndex((r) => r.name === closerName) + 1 || null;

  // Week-over-week
  const weekAgo = to ? new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000) : null;
  const twoWeeksAgo = weekAgo ? new Date(weekAgo.getTime() - 7 * 24 * 60 * 60 * 1000) : null;
  const wowThis = useMemo(() => {
    if (!weekAgo || !to) return null;
    const rows = salesRows.filter((r) => r.enrManager === closerName && inRange(r.date, weekAgo, to));
    const t = totalsOf(rows);
    return { totals: t, rates: ratesOf(t) };
  }, [salesRows, closerName, weekAgo, to]);
  const wowLast = useMemo(() => {
    if (!twoWeeksAgo || !weekAgo) return null;
    const rows = salesRows.filter((r) => r.enrManager === closerName && inRange(r.date, twoWeeksAgo, weekAgo));
    const t = totalsOf(rows);
    return { totals: t, rates: ratesOf(t) };
  }, [salesRows, closerName, twoWeeksAgo, weekAgo]);

  const weekOverWeek = {
    cashOnCall: wowThis && wowLast ? delta(wowThis.totals.cashOnCall, wowLast.totals.cashOnCall) : null,
    showRate:
      wowLast?.rates.showPct != null && wowThis?.rates.showPct != null
        ? wowThis.rates.showPct - wowLast.rates.showPct
        : null,
    closeRateShows:
      wowLast?.rates.closePctShows != null && wowThis?.rates.closePctShows != null
        ? wowThis.rates.closePctShows - wowLast.rates.closePctShows
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
    const map = new Map<string, { cashOnCall: number; showed: number; newCalls: number; salesMade: number }>();
    for (const r of closerRows) {
      if (!r.date) continue;
      const d = parseDateOnly(r.date);
      if (!d) continue;
      const key = bucketKey(d, "day");
      const existing = map.get(key) || { cashOnCall: 0, showed: 0, newCalls: 0, salesMade: 0 };
      existing.cashOnCall += r.cashCollectedOnCall ?? 0;
      existing.showed += r.showed ?? 0;
      existing.newCalls += r.newCalls ?? 0;
      existing.salesMade += r.salesMade ?? 0;
      map.set(key, existing);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [closerRows]);

  const sparkCash = dailyBuckets.map(([, v]) => v.cashOnCall);
  const sparkCalls = dailyBuckets.map(([, v]) => v.newCalls);
  const sparkSales = dailyBuckets.map(([, v]) => v.salesMade);

  // Team-avg pip
  const teamPip = (value: number | null, teamValue: number | null, formatter: (v: number) => string) => {
    if (value === null || teamValue === null || teamValue === 0) return null;
    const diff = value - teamValue;
    const diffPct = diff / teamValue;
    const better = diffPct > 0.05;
    const worse = diffPct < -0.05;
    const color: "green" | "red" | "muted" = better ? "green" : worse ? "red" : "muted";
    const symbol = better ? "▲" : worse ? "▼" : "•";
    return { hint: `${symbol} team avg ${formatter(teamValue)}`, hintColor: color };
  };

  // Compare-against pip
  const comparePip = (
    value: number | null,
    compareValue: number | null,
    formatter: (v: number) => string,
    otherName: string
  ) => {
    if (value === null || compareValue === null || compareValue === 0) return null;
    const diff = value - compareValue;
    const diffPct = diff / compareValue;
    const better = diffPct > 0.05;
    const worse = diffPct < -0.05;
    const color: "green" | "red" | "muted" = better ? "green" : worse ? "red" : "muted";
    const symbol = better ? "▲" : worse ? "▼" : "•";
    return { hint: `${symbol} vs ${otherName}: ${formatter(compareValue)}`, hintColor: color };
  };

  const cashTarget = (bench.weeklyCashOnCall * daysInPeriod) / 7;
  const cashPace = daysSinceStart(from);
  const cashPaceValue = (bench.weeklyCashOnCall * cashPace) / 7;

  const showsHint = compareAgainst
    ? comparePip(rates.closePctShows, compareAgainst.rates.closePctShows, (v) => formatPercent(v), compareAgainst.name)
    : teamPip(rates.closePctShows, teamAvg.avgRates.closePctShows, (v) => formatPercent(v));

  const scoreColor = compositeScore >= 90 ? "var(--green)" : compositeScore >= 60 ? "var(--accent)" : "var(--red)";

  return (
    <div>
      {/* Header */}
      <div
        style={{
          background: "var(--gradient-surface)",
          border: "1px solid var(--line)",
          borderRadius: 14,
          padding: compact ? 18 : 24,
          marginBottom: 16,
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ color: "var(--muted)", fontSize: 10, letterSpacing: 0.1, textTransform: "uppercase" }}>
              Closer Scorecard
            </div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: compact ? 24 : 34,
                fontWeight: 700,
                marginTop: 2,
                background: "var(--gradient-accent)",
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {closerName}
            </div>
            <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 4 }}>
              Rank {rank ?? "—"} of {rankList.length}
              {lastActivity && ` · Last active ${lastActivity}`}
              {daysSinceLast !== null && daysSinceLast >= 1 && ` (${daysSinceLast}d ago)`}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: compact ? 34 : 48,
                fontWeight: 600,
                letterSpacing: "-0.03em",
                color: scoreColor,
                lineHeight: 1,
              }}
            >
              {compositeScore}
            </div>
            <div style={{ color: "var(--muted)", fontSize: 10, letterSpacing: 0.1, textTransform: "uppercase", marginTop: 4 }}>
              Score / 100
            </div>
          </div>
        </div>
      </div>

      {/* Attainment */}
      <div className="panel" style={{ marginBottom: 16, padding: compact ? 14 : 18 }}>
        <div className="panel-header" style={{ marginBottom: 10 }}>
          <div className="panel-title" style={{ fontSize: compact ? 14 : 16 }}>
            Cash-on-Call Attainment
          </div>
          <span style={{ color: "var(--muted)", fontSize: 11 }}>vs {formatMoney(bench.weeklyCashOnCall)}/wk</span>
        </div>
        <BulletChart current={totals.cashOnCall} target={cashTarget} pace={cashPaceValue} formatter={(v) => formatMoney(v)} />
      </div>

      {/* KPI cards */}
      <KpiGrid
        items={[
          {
            label: "Cash on Call",
            value: formatMoney(totals.cashOnCall),
            sparkline: sparkCash,
            sparklineColor: "var(--green)",
            source: {
              source: "Sales Activity Tracker (Notion)",
              field: "Cash Collected on Call ($)",
              formula: "SUM over date range, filtered by Enr Manager",
            },
            ...((compareAgainst
              ? comparePip(totals.cashOnCall, compareAgainst.totals.cashOnCall, (v) => formatMoney(v), compareAgainst.name)
              : teamPip(totals.cashOnCall, teamAvg.avgTotals.cashOnCall, (v) => formatMoney(v))) || {}),
          },
          {
            label: "Sales Made",
            value: formatNumber(totals.salesMade),
            sparkline: sparkSales,
            sparklineColor: "var(--accent)",
            source: { source: "Sales Activity Tracker (Notion)", field: "Sales Made", formula: "SUM" },
            ...((compareAgainst
              ? comparePip(totals.salesMade, compareAgainst.totals.salesMade, (v) => formatNumber(v), compareAgainst.name)
              : teamPip(totals.salesMade, teamAvg.avgTotals.salesMade, (v) => formatNumber(v))) || {}),
          },
          {
            label: "New Calls",
            value: formatNumber(totals.newCalls),
            sparkline: sparkCalls,
            sparklineColor: "var(--blue)",
            source: { source: "Sales Activity Tracker (Notion)", field: "New Calls in Calendar", formula: "SUM" },
            ...((compareAgainst
              ? comparePip(totals.newCalls, compareAgainst.totals.newCalls, (v) => formatNumber(v), compareAgainst.name)
              : teamPip(totals.newCalls, teamAvg.avgTotals.newCalls, (v) => formatNumber(v))) || {}),
          },
          {
            label: "Show %",
            value: formatPercent(rates.showPct),
            source: { source: "Sales Activity Tracker (Notion)", field: "Derived", formula: "Showed ÷ New Calls" },
            hint: compareAgainst
              ? `vs ${compareAgainst.name}: ${formatPercent(compareAgainst.rates.showPct)}`
              : `benchmark ${(bench.showPct * 100).toFixed(0)}%${
                  teamAvg.avgRates.showPct !== null ? ` · team ${(teamAvg.avgRates.showPct * 100).toFixed(1)}%` : ""
                }`,
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
            source: { source: "Sales Activity Tracker (Notion)", field: "Derived", formula: "Offers Made ÷ Showed" },
            hint: compareAgainst
              ? `vs ${compareAgainst.name}: ${formatPercent(compareAgainst.rates.offerPct)}`
              : `benchmark ${(bench.offerPct * 100).toFixed(0)}%${
                  teamAvg.avgRates.offerPct !== null ? ` · team ${(teamAvg.avgRates.offerPct * 100).toFixed(1)}%` : ""
                }`,
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
            source: { source: "Sales Activity Tracker (Notion)", field: "Derived", formula: "Sales Made ÷ Showed" },
            hint:
              (showsHint?.hint as string) ||
              `benchmark ${(bench.closePctShows * 100).toFixed(0)}%${
                teamAvg.avgRates.closePctShows !== null ? ` · team ${(teamAvg.avgRates.closePctShows * 100).toFixed(1)}%` : ""
              }`,
            hintColor: (showsHint?.hintColor as any) || "muted",
          },
          {
            label: "Close % (Offers)",
            value: formatPercent(rates.closePctOffers),
            source: { source: "Sales Activity Tracker (Notion)", field: "Derived", formula: "Sales Made ÷ Offers" },
            hint: `benchmark ${(bench.closePctOffers * 100).toFixed(0)}%`,
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
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <div className="panel-title" style={{ fontSize: compact ? 14 : 16 }}>
            Coaching Flags{" "}
            <span style={{ color: "var(--muted)", fontSize: 12, fontWeight: 400 }}>
              · {flags.length} signal{flags.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <CoachingFlagList flags={flags} />
      </div>
    </div>
  );
}

function daysSinceStart(from: Date | null): number {
  if (!from) return 1;
  const now = new Date();
  const diff = Math.ceil((now.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(1, diff);
}

/** Helper for the page that renders this — snapshot the current stats without JSX. */
export function snapshotCloser(
  closerName: string,
  salesRows: SalesActivityRow[],
  from: Date | null,
  to: Date | null
): { totals: CloserTotals; rates: CloserRates; name: string } {
  const rows = salesRows.filter((r) => r.enrManager === closerName && inRange(r.date, from, to));
  const totals = totalsOf(rows);
  const rates = ratesOf(totals);
  return { totals, rates, name: closerName };
}
