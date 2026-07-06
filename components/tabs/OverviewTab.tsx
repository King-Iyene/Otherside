"use client";

import { useMemo, useState } from "react";
import type { AppointmentRow, ApplicationRow, CashRow, ChallengeRow, SalesActivityRow } from "@/lib/types";
import { analyzeChallengeToReborn } from "@/lib/crossSource";
import { resolveRange, inRange, type RangePreset, bucketKey, parseDateOnly } from "@/lib/dates";
import { sum } from "@/lib/filtering";
import { comparisonRange, comparisonLabel, computeDelta, type CompareMode } from "@/lib/comparison";
import { getBenchmarks } from "@/lib/benchmarks";
import { formatMoney, formatNumber, formatPercent } from "@/lib/money";
import Controls from "../Controls";
import KpiGrid from "../Kpi";
import TimeSeriesChart from "../TimeSeriesChart";
import BreakdownChart from "../BreakdownChart";
import FunnelChart from "../FunnelChart";
import BulletChart from "../BulletChart";
import Sparkline from "../Sparkline";

interface Props {
  cash: CashRow[];
  appointments: AppointmentRow[];
  applications: ApplicationRow[];
  salesActivity: SalesActivityRow[];
  challenge?: ChallengeRow[];
}

const SHOWED_STATUSES = new Set(["Showed", "Client Won", "Finisher"]);

/** A cash row is a real enrollment only if it names a person (email or name).
 *  Mirrors the funnel's isRealPerson so Overview's Enrollments count matches
 *  Cohort Funnels — blank stub rows never inflate it. */
function isRealPerson(r: CashRow): boolean {
  return !!((r.email && r.email.trim()) || (r.name && r.name.trim()));
}

/** Unique enrolled buyers: real people, deduped by email (blank-email rows with
 *  a name each count once). */
function uniqueEnrollments(rows: CashRow[]): number {
  const seen = new Set<string>();
  let count = 0;
  for (const r of rows) {
    if (!isRealPerson(r)) continue;
    const e = (r.email || "").trim().toLowerCase();
    if (e) {
      if (seen.has(e)) continue;
      seen.add(e);
    }
    count++;
  }
  return count;
}

function computeStats(
  cash: CashRow[],
  appointments: AppointmentRow[],
  applications: ApplicationRow[],
  salesActivity: SalesActivityRow[],
  from: Date | null,
  to: Date | null,
  includeTest: boolean
) {
  const cashRows = cash.filter((r) => (includeTest || !r.isTest) && inRange(r.enrollmentDate, from, to));
  const apptRows = appointments.filter((r) => (includeTest || !r.isTest) && inRange(r.appointmentTime, from, to));
  const appRows = applications.filter((r) => (includeTest || !r.isTest) && inRange(r.dateCreated, from, to));
  const salesRows = salesActivity.filter((r) => (includeTest || !r.isTest) && inRange(r.date, from, to));

  const showedCount = apptRows.filter((r) => r.status && SHOWED_STATUSES.has(r.status)).length;
  const purchasedApps = appRows.filter((r) => r.purchased).length;

  return {
    cashRows,
    apptRows,
    appRows,
    salesRows,
    cashCollected: sum(cashRows.map((r) => r.cashCollected)),
    revenue: sum(cashRows.map((r) => r.revenue)),
    balance: sum(cashRows.map((r) => r.balance)),
    enrollments: uniqueEnrollments(cashRows),
    appointments: apptRows.length,
    showedCount,
    showRate: apptRows.length ? showedCount / apptRows.length : null,
    applications: appRows.length,
    purchasedApps,
    conversionRate: appRows.length ? purchasedApps / appRows.length : null,
    offersMade: sum(salesRows.map((r) => r.offersMade)),
    salesMade: sum(salesRows.map((r) => r.salesMade)),
    cashOnCall: sum(salesRows.map((r) => r.cashCollectedOnCall)),
  };
}

/** Buckets a metric by day over the given rows using a date accessor + value accessor. */
function dailySeries<T>(rows: T[], date: (r: T) => string | null, value: (r: T) => number): number[] {
  const buckets = new Map<string, number>();
  for (const r of rows) {
    const dStr = date(r);
    if (!dStr) continue;
    const d = parseDateOnly(dStr);
    if (!d) continue;
    const key = bucketKey(d, "day");
    buckets.set(key, (buckets.get(key) || 0) + value(r));
  }
  return Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, v]) => v);
}

interface DiagnosticSignal {
  severity: "positive" | "warning" | "critical";
  headline: string;
  detail: string;
}

function generateDiagnostics(stats: ReturnType<typeof computeStats>, prev: ReturnType<typeof computeStats> | null): DiagnosticSignal[] {
  const signals: DiagnosticSignal[] = [];
  if (!prev) return signals;

  // Cash collected drop
  if (prev.cashCollected > 0) {
    const delta = (stats.cashCollected - prev.cashCollected) / prev.cashCollected;
    if (delta <= -0.2) {
      signals.push({
        severity: "critical",
        headline: `Cash collected down ${(Math.abs(delta) * 100).toFixed(1)}% vs previous period`,
        detail: prev.showRate !== null && stats.showRate !== null && stats.showRate < prev.showRate * 0.9
          ? `Likely driver: show rate dropped from ${(prev.showRate * 100).toFixed(1)}% to ${(stats.showRate * 100).toFixed(1)}%.`
          : "Check enrollments, average deal size, and appointment volume for the driver.",
      });
    } else if (delta >= 0.2) {
      signals.push({
        severity: "positive",
        headline: `Cash collected up ${(delta * 100).toFixed(1)}% vs previous period`,
        detail: "Momentum is strong. Reinforce whatever changed — new offer, better lead source, or improved close rate.",
      });
    }
  }

  // Show rate change
  if (prev.showRate !== null && stats.showRate !== null) {
    const showDelta = stats.showRate - prev.showRate;
    if (showDelta <= -0.1) {
      signals.push({
        severity: "warning",
        headline: `Show rate dropped ${(Math.abs(showDelta) * 100).toFixed(1)}pts (${(prev.showRate * 100).toFixed(1)}% → ${(stats.showRate * 100).toFixed(1)}%)`,
        detail: "Check confirmation flow, deposit-at-booking rate, or lead-source quality.",
      });
    }
  }

  // Application conversion drop
  if (prev.conversionRate !== null && stats.conversionRate !== null) {
    const convDelta = stats.conversionRate - prev.conversionRate;
    if (convDelta <= -0.05) {
      signals.push({
        severity: "warning",
        headline: `App-to-purchase conversion dropped ${(Math.abs(convDelta) * 100).toFixed(1)}pts`,
        detail: "Either lead quality shifted or sales flow lost efficiency. Cross-reference with Sales Activity closer stats.",
      });
    }
  }

  // Sales pipeline drop
  if (prev.applications > 0 && stats.applications < prev.applications * 0.8) {
    signals.push({
      severity: "warning",
      headline: `Application volume down ${((1 - stats.applications / prev.applications) * 100).toFixed(0)}% — top-of-funnel weakness`,
      detail: "Check ad spend, organic traffic, and challenge / lead-magnet performance in the Challenge tab.",
    });
  }

  return signals;
}

export default function OverviewTab({ cash, appointments, applications, salesActivity, challenge = [] }: Props) {
  const [preset, setPreset] = useState<RangePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [includeTest, setIncludeTest] = useState(false);
  const [compareMode, setCompareMode] = useState<CompareMode>("prev");

  const bench = useMemo(() => getBenchmarks(), []);
  const { from, to } = resolveRange(preset, customFrom, customTo);

  const stats = useMemo(
    () => computeStats(cash, appointments, applications, salesActivity, from, to, includeTest),
    [cash, appointments, applications, salesActivity, from, to, includeTest]
  );

  const prevRange = comparisonRange(compareMode, from, to);
  const prevStats = useMemo(() => {
    if (!prevRange) return null;
    return computeStats(cash, appointments, applications, salesActivity, prevRange.from, prevRange.to, includeTest);
  }, [cash, appointments, applications, salesActivity, prevRange, includeTest]);

  const statuses = Array.from(new Set(stats.apptRows.map((r) => r.status).filter(Boolean))) as string[];

  // Sparklines
  const sparkCash = dailySeries(stats.cashRows, (r) => r.enrollmentDate, (r) => r.cashCollected ?? 0);
  const sparkRevenue = dailySeries(stats.cashRows, (r) => r.enrollmentDate, (r) => r.revenue ?? 0);
  const sparkAppts = dailySeries(stats.apptRows, (r) => r.appointmentTime, () => 1);
  const sparkApps = dailySeries(stats.appRows, (r) => r.dateCreated, () => 1);

  // Pace calc — how far through the "target period" (month, for the MTD preset)
  const daysElapsed = from && to ? Math.max(1, Math.ceil((Math.min(Date.now(), to.getTime()) - from.getTime()) / (24 * 60 * 60 * 1000))) : 30;
  const daysInMonth = 30;
  const paceRatio = Math.min(1, daysElapsed / daysInMonth);
  const cashPace = bench.monthlyCashCollected * paceRatio;
  const revenuePace = bench.monthlyRevenueBooked * paceRatio;
  const enrollmentPace = bench.monthlyEnrollments * paceRatio;

  const diagnostics = useMemo(() => generateDiagnostics(stats, prevStats), [stats, prevStats]);
  const compareLabel = comparisonLabel(compareMode);

  return (
    <div>
      <Controls
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
        search=""
        onSearchChange={() => {}}
        dimensions={[]}
        includeTest={includeTest}
        onIncludeTestChange={setIncludeTest}
        compareMode={compareMode}
        onCompareModeChange={setCompareMode}
      />

      {/* HERO ROW — 4 big cards with pace bars and sparklines */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 14,
          marginBottom: 18,
        }}
      >
        <HeroCard
          label="Cash Collected"
          value={formatMoney(stats.cashCollected)}
          target={bench.monthlyCashCollected}
          current={stats.cashCollected}
          pace={cashPace}
          formatter={(v) => formatMoney(v)}
          sparkline={sparkCash}
          color="var(--green)"
          delta={prevStats && computeDelta(stats.cashCollected, prevStats.cashCollected)}
          compareLabel={compareLabel}
        />
        <HeroCard
          label="Revenue Booked"
          value={formatMoney(stats.revenue)}
          target={bench.monthlyRevenueBooked}
          current={stats.revenue}
          pace={revenuePace}
          formatter={(v) => formatMoney(v)}
          sparkline={sparkRevenue}
          color="var(--blue)"
          delta={prevStats && computeDelta(stats.revenue, prevStats.revenue)}
          compareLabel={compareLabel}
        />
        <HeroCard
          label="Enrollments"
          value={formatNumber(stats.enrollments)}
          target={bench.monthlyEnrollments}
          current={stats.enrollments}
          pace={enrollmentPace}
          formatter={(v) => formatNumber(v)}
          sparkline={sparkCash.map(() => 1)}
          color="var(--accent)"
          delta={prevStats && computeDelta(stats.enrollments, prevStats.enrollments)}
          compareLabel={compareLabel}
        />
        <HeroCard
          label="Outstanding"
          value={formatMoney(stats.balance)}
          target={0}
          current={stats.balance}
          pace={null}
          formatter={(v) => formatMoney(v)}
          sparkline={[]}
          color="var(--red)"
          delta={prevStats && computeDelta(stats.balance, prevStats.balance)}
          higherIsBetter={false}
          hidePaceBar
          compareLabel={compareLabel}
        />
      </div>


      {/* DIAGNOSTIC BAND */}
      {diagnostics.length > 0 && (
        <div style={{ marginBottom: 18, display: "flex", flexDirection: "column", gap: 6 }}>
          {diagnostics.map((sig, i) => {
            const color = sig.severity === "critical" ? "var(--red)" : sig.severity === "warning" ? "var(--accent)" : "var(--green)";
            const bg =
              sig.severity === "critical"
                ? "rgba(240,112,112,0.08)"
                : sig.severity === "warning"
                ? "rgba(242,182,60,0.06)"
                : "rgba(69,208,147,0.06)";
            const icon = sig.severity === "critical" ? "🔴" : sig.severity === "warning" ? "⚠" : "✓";
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "10px 14px",
                  borderLeft: `3px solid ${color}`,
                  background: bg,
                  borderRadius: 6,
                  alignItems: "flex-start",
                }}
              >
                <div style={{ color, fontSize: 13, lineHeight: 1.2 }}>{icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>{sig.headline}</div>
                  <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>{sig.detail}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Secondary KPIs — smaller cards */}
      <KpiGrid
        items={[
          {
            label: "Appointments",
            value: formatNumber(stats.appointments),
            sparkline: sparkAppts,
            sparklineColor: "var(--blue)",
            delta: prevStats && computeDelta(stats.appointments, prevStats.appointments),
            source: { source: "Appointments Tracker (Notion)", field: "COUNT" },
          },
          {
            label: "Show Rate",
            value: formatPercent(stats.showRate),
            delta: stats.showRate != null && prevStats?.showRate != null ? computeDelta(stats.showRate, prevStats.showRate) : null,
            source: { source: "Derived", field: "Showed ÷ Appointments" },
            hint: `benchmark ${(bench.showPct * 100).toFixed(0)}%`,
            hintColor: stats.showRate === null ? "muted" : stats.showRate >= bench.showPct ? "green" : stats.showRate < bench.showPct * 0.8 ? "red" : "muted",
          },
          {
            label: "Applications",
            value: formatNumber(stats.applications),
            sparkline: sparkApps,
            sparklineColor: "var(--accent)",
            delta: prevStats && computeDelta(stats.applications, prevStats.applications),
            source: { source: "REBORN Application Tracker (Notion)", field: "COUNT" },
          },
          {
            label: "App → Purchase",
            value: formatPercent(stats.conversionRate),
            delta:
              stats.conversionRate != null && prevStats?.conversionRate != null
                ? computeDelta(stats.conversionRate, prevStats.conversionRate)
                : null,
            source: { source: "Derived", field: "Purchased ÷ Applications" },
          },
          {
            label: "Cash on Call",
            value: formatMoney(stats.cashOnCall),
            delta: prevStats && computeDelta(stats.cashOnCall, prevStats.cashOnCall),
            source: { source: "Sales Activity Tracker (Notion)", field: "SUM Cash Collected on Call" },
          },
        ]}
      />

      <div className="chart-grid">
        <TimeSeriesChart
          title="Cash Collected"
          points={stats.cashRows.map((r) => ({ date: r.enrollmentDate, value: r.cashCollected ?? 0 }))}
          color="#45d093"
          valueFormatter={(v) => formatMoney(v)}
        />
        <BreakdownChart
          title="Appointments by Status"
          items={statuses.map((s) => ({ key: s, value: stats.apptRows.filter((r) => r.status === s).length }))}
        />
      </div>

      <div style={{ marginBottom: 8 }}>
        <FunnelChart
          title="Pipeline Funnel (Applications → Appointments → Showed → Offers → Sales)"
          stages={[
            { label: "Applications", value: stats.applications, color: "#f2b63c" },
            { label: "Appointments Booked", value: stats.appointments, color: "#61aaf2" },
            { label: "Showed", value: stats.showedCount, color: "#45d093" },
            { label: "Offers Made", value: stats.offersMade, color: "#a48bf2" },
            { label: "Sales Closed", value: stats.salesMade, color: "#f07070" },
          ]}
        />
        <p style={{ color: "var(--muted)", fontSize: 11, marginTop: 8 }}>
          Stages pull from separate systems (Applications, Appointments, Sales Activity), so this is a directional view of
          the pipeline rather than a strict per-lead conversion trace.
        </p>
      </div>

      <ChallengeToRebornPanel challenge={challenge} cash={cash} />
    </div>
  );
}

function ChallengeToRebornPanel({ challenge, cash }: { challenge: ChallengeRow[]; cash: CashRow[] }) {
  const analysis = useMemo(() => analyzeChallengeToReborn(challenge, cash), [challenge, cash]);

  if (challenge.length === 0) {
    return null;
  }

  const totalRebornRevenue = analysis.matches.reduce((s, m) => s + (m.rebornCashCollected ?? 0), 0);

  return (
    <div className="panel" style={{ marginTop: 20 }}>
      <div className="panel-header">
        <div className="panel-title">Challenge → Reborn Conversion</div>
        <span style={{ color: "var(--muted)", fontSize: 11 }}>
          Cross-source join · Challenge Sheet email ↔ Reborn Cash Tracker email
        </span>
      </div>
      <div className="kpi-grid" style={{ marginBottom: 14 }}>
        <div className="kpi-card">
          <div className="kpi-label">Unique Challenge Emails</div>
          <div className="kpi-value mono">{formatNumber(analysis.challengeUniqueEmails)}</div>
          <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 6, paddingTop: 6, borderTop: "1px dashed var(--line)", fontFamily: "var(--font-mono)", textTransform: "uppercase" }}>
            Source: Challenge Sheet · Email column
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Bought Reborn</div>
          <div className="kpi-value mono" style={{ color: "var(--green)" }}>
            {formatNumber(analysis.challengeBoughtReborn)}
          </div>
          <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 6, paddingTop: 6, borderTop: "1px dashed var(--line)", fontFamily: "var(--font-mono)", textTransform: "uppercase" }}>
            Source: Challenge ∩ Cash Tracker · matched by email
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Conversion Rate</div>
          <div className="kpi-value mono" style={{ color: analysis.conversionRate !== null && analysis.conversionRate >= 0.05 ? "var(--green)" : "var(--accent)" }}>
            {formatPercent(analysis.conversionRate)}
          </div>
          <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 6, paddingTop: 6, borderTop: "1px dashed var(--line)", fontFamily: "var(--font-mono)", textTransform: "uppercase" }}>
            Bought Reborn ÷ Unique Challenge Emails
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Revenue From Converters</div>
          <div className="kpi-value mono" style={{ color: "var(--green)" }}>
            {formatMoney(totalRebornRevenue)}
          </div>
          <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 6, paddingTop: 6, borderTop: "1px dashed var(--line)", fontFamily: "var(--font-mono)", textTransform: "uppercase" }}>
            Sum of Cash Collected for matched emails
          </div>
        </div>
      </div>
      {analysis.matches.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Top converters (by Reborn cash collected)</div>
          <table className="leaderboard">
            <thead>
              <tr>
                <th>Email</th>
                <th>Challenge Product</th>
                <th>Reborn Product</th>
                <th>Cash Collected</th>
              </tr>
            </thead>
            <tbody>
              {analysis.matches.slice(0, 15).map((m) => (
                <tr key={m.email}>
                  <td className="mono" style={{ fontSize: 11 }}>{m.email}</td>
                  <td>{m.challengeProduct || "—"}</td>
                  <td>{m.rebornProduct || "—"}</td>
                  <td className="mono">{formatMoney(m.rebornCashCollected)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {analysis.matches.length > 15 && (
            <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 8 }}>
              +{analysis.matches.length - 15} more converters
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface HeroCardProps {
  label: string;
  value: string;
  target: number;
  current: number;
  pace: number | null;
  formatter: (v: number) => string;
  sparkline: number[];
  color: string;
  delta: { pct: number | null; current: number; previous: number } | null;
  higherIsBetter?: boolean;
  hidePaceBar?: boolean;
  compareLabel?: string;
}

function HeroCard({
  label,
  value,
  target,
  current,
  pace,
  formatter,
  sparkline,
  color,
  delta,
  higherIsBetter = true,
  hidePaceBar,
  compareLabel = "vs prev",
}: HeroCardProps) {
  const deltaText = delta?.pct === null || delta === null ? null : delta;
  const deltaGood = deltaText?.pct === null || deltaText === null || Math.abs(deltaText.pct) < 0.001 ? null : deltaText.pct > 0 === higherIsBetter;
  const deltaColor = deltaGood === null ? "var(--muted)" : deltaGood ? "var(--green)" : "var(--red)";

  return (
    <div
      style={{
        background: "var(--gradient-surface)",
        border: "1px solid var(--line)",
        borderRadius: 14,
        padding: 18,
        boxShadow: "var(--shadow-card)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: color, opacity: 0.7 }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div style={{ color: "var(--muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.1 }}>{label}</div>
        {sparkline.length > 1 && <Sparkline values={sparkline} color={color} width={70} height={22} />}
      </div>
      <div className="mono" style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text)" }}>
        {value}
      </div>
      {deltaText && deltaText.pct !== null && (
        <div className="mono" style={{ fontSize: 11, marginTop: 4, color: deltaColor }}>
          {deltaText.pct >= 0 ? "▲" : "▼"} {Math.abs(deltaText.pct * 100).toFixed(1)}% {compareLabel}
        </div>
      )}
      {!hidePaceBar && target > 0 && (
        <div style={{ marginTop: 10 }}>
          <BulletChart current={current} target={target} pace={pace} formatter={formatter} height={14} />
        </div>
      )}
    </div>
  );
}
