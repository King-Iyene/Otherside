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
import DrillDownModal from "../DrillDownModal";
import DataTable, { type Column } from "../DataTable";
import { formatDateShort } from "../MoneyCell";
import GhlName from "../GhlLink";

interface Props {
  cash: CashRow[];
  appointments: AppointmentRow[];
  applications: ApplicationRow[];
  salesActivity: SalesActivityRow[];
  challenge?: ChallengeRow[];
  hideOpsUI?: boolean;
}

const SHOWED_STATUSES = new Set(["Showed", "Client Won", "Finisher"]);

function isRealPerson(r: CashRow): boolean {
  return !!((r.email && r.email.trim()) || (r.name && r.name.trim()));
}

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

  const positiveCashRows = cashRows.filter((r) => r.transactionType !== "Refund");
  const refundCashRows = cashRows.filter((r) => r.transactionType === "Refund");

  const salesMade = sum(salesRows.map((r) => r.salesMade));
  const offersMade = sum(salesRows.map((r) => r.offersMade));
  const cashOnCall = sum(salesRows.map((r) => r.cashCollectedOnCall));
  const showedToCall = sum(salesRows.map((r) => r.showed));

  return {
    cashRows,
    apptRows,
    appRows,
    salesRows,
    grossCashCollected: sum(positiveCashRows.map((r) => r.cashCollected)),
    grossRevenue: sum(positiveCashRows.map((r) => r.revenue)),
    refundedCash: sum(refundCashRows.map((r) => r.cashCollected)),
    refundedRevenue: sum(refundCashRows.map((r) => r.revenue)),
    cashCollected: sum(positiveCashRows.map((r) => r.cashCollected)) - sum(refundCashRows.map((r) => r.cashCollected)),
    revenue: sum(positiveCashRows.map((r) => r.revenue)) - sum(refundCashRows.map((r) => r.revenue)),
    refundCount: refundCashRows.length,
    enrollments: uniqueEnrollments(positiveCashRows.filter((r) => r.transactionType !== "Dropout")),
    appointments: apptRows.length,
    showedCount,
    showRate: apptRows.length ? showedCount / apptRows.length : null,
    applications: appRows.length,
    purchasedApps,
    conversionRate: appRows.length ? purchasedApps / appRows.length : null,
    offersMade,
    salesMade,
    cashOnCall,
    showedToCall,
    closeRateOnShows: showedToCall > 0 ? salesMade / showedToCall : null,
    cashValuePerBooking: apptRows.length > 0 ? (sum(positiveCashRows.map((r) => r.cashCollected)) - sum(refundCashRows.map((r) => r.cashCollected))) / apptRows.length : null,
  };
}

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

  if (prev.applications > 0 && stats.applications < prev.applications * 0.8) {
    signals.push({
      severity: "warning",
      headline: `Application volume down ${((1 - stats.applications / prev.applications) * 100).toFixed(0)}% — top-of-funnel weakness`,
      detail: "Check ad spend, organic traffic, and challenge / lead-magnet performance in the Challenge tab.",
    });
  }

  return signals;
}

export default function OverviewTab({ cash, appointments, applications, salesActivity, challenge = [], hideOpsUI }: Props) {
  const [preset, setPreset] = useState<RangePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [includeTest, setIncludeTest] = useState(false);
  const [compareMode, setCompareMode] = useState<CompareMode>("prev");
  const [closerFilter, setCloserFilter] = useState<string[]>([]);
  const [apptDrill, setApptDrill] = useState<{ title: string; rows: AppointmentRow[] } | null>(null);
  const [cashDrill, setCashDrill] = useState<{ title: string; subtitle?: string; rows: CashRow[] } | null>(null);
  const [appDrill, setAppDrill] = useState<{ title: string; subtitle?: string; rows: ApplicationRow[] } | null>(null);
  const [salesDrill, setSalesDrill] = useState<{ title: string; subtitle?: string; rows: SalesActivityRow[] } | null>(null);

  const closers = useMemo(() => {
    const set = new Set<string>();
    for (const r of cash) if (r.enrManager?.trim()) set.add(r.enrManager);
    for (const r of appointments) if (r.enrManager?.trim()) set.add(r.enrManager);
    for (const r of salesActivity) if (r.enrManager?.trim()) set.add(r.enrManager);
    return [...set].sort();
  }, [cash, appointments, salesActivity]);

  const closerMatch = <T extends { enrManager?: string | null }>(r: T) =>
    closerFilter.length === 0 || closerFilter.includes(r.enrManager ?? "");

  const fCash = useMemo(() => cash.filter(closerMatch), [cash, closerFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  const fAppts = useMemo(() => appointments.filter(closerMatch), [appointments, closerFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  const fSales = useMemo(() => salesActivity.filter(closerMatch), [salesActivity, closerFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const bench = useMemo(() => getBenchmarks(), []);
  const { from, to } = resolveRange(preset, customFrom, customTo);

  const stats = useMemo(
    () => computeStats(fCash, fAppts, applications, fSales, from, to, includeTest),
    [fCash, fAppts, applications, fSales, from, to, includeTest]
  );

  const prevRange = comparisonRange(compareMode, from, to);
  const prevStats = useMemo(() => {
    if (!prevRange) return null;
    return computeStats(fCash, fAppts, applications, fSales, prevRange.from, prevRange.to, includeTest);
  }, [fCash, fAppts, applications, fSales, prevRange, includeTest]);

  const statuses = Array.from(new Set(stats.apptRows.map((r) => r.status).filter(Boolean))) as string[];

  const sparkCash = dailySeries(stats.cashRows, (r) => r.enrollmentDate, (r) => r.transactionType === "Refund" ? -(r.cashCollected ?? 0) : (r.cashCollected ?? 0));
  const sparkRevenue = dailySeries(stats.cashRows, (r) => r.enrollmentDate, (r) => r.transactionType === "Refund" ? -(r.revenue ?? 0) : (r.revenue ?? 0));
  const sparkAppts = dailySeries(stats.apptRows, (r) => r.appointmentTime, () => 1);
  const sparkApps = dailySeries(stats.appRows, (r) => r.dateCreated, () => 1);

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
        dimensions={[
          { key: "closer", label: "Closer", options: closers, value: closerFilter, onChange: setCloserFilter },
        ]}
        includeTest={includeTest}
        onIncludeTestChange={setIncludeTest}
        compareMode={compareMode}
        onCompareModeChange={setCompareMode}
        hideOpsUI={hideOpsUI}
      />

      {/* HERO ROW */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 14,
          marginBottom: 18,
        }}
      >
        <HeroCard
          label={stats.refundCount > 0 ? "Net Cash Collected" : "Cash Collected"}
          sublabel={stats.refundCount > 0 ? `Gross ${formatMoney(stats.grossCashCollected)} − ${formatMoney(stats.refundedCash)} refunded` : "Reborn Cash Tracker (Notion)"}
          value={formatMoney(stats.cashCollected)}
          target={bench.monthlyCashCollected}
          current={stats.cashCollected}
          pace={cashPace}
          formatter={(v) => formatMoney(v)}
          sparkline={sparkCash}
          color="var(--green)"
          delta={prevStats && computeDelta(stats.cashCollected, prevStats.cashCollected)}
          compareLabel={compareLabel}
          onClick={() => setCashDrill({ title: stats.refundCount > 0 ? "Net Cash Collected" : "Cash Collected", subtitle: `${stats.cashRows.length} rows`, rows: stats.cashRows })}
        />
        <HeroCard
          label={stats.refundCount > 0 ? "Net Revenue" : "Revenue Booked"}
          sublabel={stats.refundCount > 0 ? `Gross ${formatMoney(stats.grossRevenue)} − ${formatMoney(stats.refundedRevenue)} refunded` : "Reborn Cash Tracker (Notion)"}
          value={formatMoney(stats.revenue)}
          target={bench.monthlyRevenueBooked}
          current={stats.revenue}
          pace={revenuePace}
          formatter={(v) => formatMoney(v)}
          sparkline={sparkRevenue}
          color="var(--blue)"
          delta={prevStats && computeDelta(stats.revenue, prevStats.revenue)}
          compareLabel={compareLabel}
          onClick={() => setCashDrill({ title: stats.refundCount > 0 ? "Net Revenue" : "Revenue Booked", subtitle: `${stats.cashRows.length} rows`, rows: stats.cashRows })}
        />
        <HeroCard
          label="Enrollments"
          sublabel="Reborn Cash Tracker (Notion)"
          value={formatNumber(stats.enrollments)}
          target={bench.monthlyEnrollments}
          current={stats.enrollments}
          pace={enrollmentPace}
          formatter={(v) => formatNumber(v)}
          sparkline={sparkCash.map(() => 1)}
          color="var(--accent)"
          delta={prevStats && computeDelta(stats.enrollments, prevStats.enrollments)}
          compareLabel={compareLabel}
          onClick={() => setCashDrill({ title: "Enrollments", subtitle: `${stats.enrollments} unique enrollees`, rows: stats.cashRows.filter((r) => !r.transactionType || r.transactionType === "Payment" || r.transactionType === "Deposit") })}
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

      {/* Secondary KPIs — reordered to funnel flow: Applications → Appointments → Show Rate → App→Purchase → Close Rate → Cash Collected → Cash Value per Booking */}
      <KpiGrid
        items={[
          {
            label: "Applications",
            value: formatNumber(stats.applications),
            sparkline: sparkApps,
            sparklineColor: "var(--accent)",
            delta: prevStats && computeDelta(stats.applications, prevStats.applications),
            source: { source: "REBORN Application Tracker (Notion)", field: "COUNT" },
            onClick: () => setAppDrill({ title: "All Applications", subtitle: `${stats.appRows.length} applications`, rows: stats.appRows }),
          },
          {
            label: "Appointments",
            value: formatNumber(stats.appointments),
            sparkline: sparkAppts,
            sparklineColor: "var(--blue)",
            delta: prevStats && computeDelta(stats.appointments, prevStats.appointments),
            source: { source: "Appointments Tracker (Notion)", field: "COUNT" },
            onClick: () => setApptDrill({ title: "All Appointments", rows: stats.apptRows }),
          },
          {
            label: "Show Rate",
            value: formatPercent(stats.showRate),
            delta: stats.showRate != null && prevStats?.showRate != null ? computeDelta(stats.showRate, prevStats.showRate) : null,
            source: { source: "Appointments Tracker (Notion)", field: "Showed ÷ Total Appointments", formula: "Automated from GHL — status ∈ {Showed, Client Won, Finisher} ÷ all booked appointments" },
            hint: stats.showRate !== null ? `${stats.showedCount} showed / ${stats.appointments} booked · benchmark ${(bench.showPct * 100).toFixed(0)}%` : `benchmark ${(bench.showPct * 100).toFixed(0)}%`,
            hintColor: stats.showRate === null ? "muted" : stats.showRate >= bench.showPct ? "green" : stats.showRate < bench.showPct * 0.8 ? "red" : "muted",
          },
          {
            label: "App → Purchase",
            value: formatPercent(stats.conversionRate),
            delta:
              stats.conversionRate != null && prevStats?.conversionRate != null
                ? computeDelta(stats.conversionRate, prevStats.conversionRate)
                : null,
            source: { source: "Derived", field: "Purchased ÷ Applications" },
            onClick: () => setAppDrill({ title: "Purchased Applications", subtitle: `${stats.purchasedApps} purchased`, rows: stats.appRows.filter((r) => r.purchased) }),
          },
          {
            label: "Close Rate (Show-ups)",
            value: formatPercent(stats.closeRateOnShows),
            delta:
              stats.closeRateOnShows != null && prevStats?.closeRateOnShows != null
                ? computeDelta(stats.closeRateOnShows, prevStats.closeRateOnShows)
                : null,
            source: { source: "Sales Activity Tracker (Notion)", field: "Sales Made ÷ Showed to Call", formula: "Close rate on people who actually showed up — both fields from closer's daily log" },
            hint: stats.closeRateOnShows !== null ? `${stats.salesMade} sales from ${stats.showedToCall} shows` : undefined,
            hintColor: stats.closeRateOnShows !== null && stats.closeRateOnShows >= 0.3 ? "green" : "muted",
          },
          {
            label: "Cash Collected",
            value: formatMoney(stats.cashOnCall),
            delta: prevStats && computeDelta(stats.cashOnCall, prevStats.cashOnCall),
            source: { source: "Sales Activity Tracker (Notion)", field: "SUM Cash Collected on Call" },
            onClick: () => setSalesDrill({ title: "Sales Activity", subtitle: `${stats.salesRows.length} entries`, rows: stats.salesRows }),
          },
          {
            label: "Cash Value per Booking",
            value: stats.cashValuePerBooking !== null ? formatMoney(stats.cashValuePerBooking) : "—",
            delta:
              stats.cashValuePerBooking != null && prevStats?.cashValuePerBooking != null
                ? computeDelta(stats.cashValuePerBooking, prevStats.cashValuePerBooking)
                : null,
            source: { source: "Derived", field: "Total Cash Collected ÷ Total Booked Appointments", formula: "Average cash value each booked call generates — includes no-shows" },
            hint: stats.cashValuePerBooking !== null ? `${formatMoney(stats.cashCollected)} ÷ ${stats.appointments} bookings` : undefined,
            hintColor: "muted",
          },
        ]}
      />

      <div className="chart-grid">
        <TimeSeriesChart
          title="Cash Collected"
          points={stats.cashRows.map((r) => ({ date: r.enrollmentDate || r.createdDate || null, value: r.transactionType === "Refund" ? -(r.cashCollected ?? 0) : (r.cashCollected ?? 0) }))}
          color="#45d093"
          valueFormatter={(v) => formatMoney(v)}
        />
        <BreakdownChart
          title="Appointments by Status"
          subtitle={<>Live from GHL via Make &mdash; pipeline stage changes trigger Make workflows that update leads in Notion</>}
          items={statuses.map((s) => ({ key: s, value: stats.apptRows.filter((r) => r.status === s).length }))}
          onSelect={(s) =>
            setApptDrill({ title: `Appointments — ${s}`, rows: stats.apptRows.filter((r) => r.status === s) })
          }
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
          onStageClick={(label) => {
            if (label === "Applications") setAppDrill({ title: "All Applications", subtitle: `${stats.appRows.length} applications`, rows: stats.appRows });
            else if (label === "Appointments Booked") setApptDrill({ title: "All Appointments", rows: stats.apptRows });
            else if (label === "Showed") setApptDrill({ title: "Showed Appointments", rows: stats.apptRows.filter((r) => r.status && SHOWED_STATUSES.has(r.status)) });
            else if (label === "Offers Made") setSalesDrill({ title: "Entries with Offers", subtitle: `${stats.offersMade} offers`, rows: stats.salesRows.filter((r) => (r.offersMade ?? 0) > 0) });
            else if (label === "Sales Closed") setSalesDrill({ title: "Entries with Sales", subtitle: `${stats.salesMade} sales`, rows: stats.salesRows.filter((r) => (r.salesMade ?? 0) > 0) });
          }}
        />
        <p style={{ color: "var(--muted)", fontSize: 11, marginTop: 8 }}>
          Stages pull from separate systems (Applications, Appointments, Sales Activity), so this is a directional view of
          the pipeline rather than a strict per-lead conversion trace.
        </p>
      </div>

      <ChallengeToRebornPanel challenge={challenge} cash={cash} />

      <DrillDownModal
        open={!!apptDrill}
        onClose={() => setApptDrill(null)}
        title={apptDrill?.title || ""}
        subtitle={apptDrill ? `${apptDrill.rows.length} appointments` : ""}
      >
        <DataTable
          columns={APPT_COLUMNS}
          rows={apptDrill?.rows || []}
          rowKey={(r) => r.id}
          isTestRow={(r) => r.isTest}
          searchable
          searchPlaceholder="Search name, email, phone, cohort, closer, status…"
        />
      </DrillDownModal>

      <DrillDownModal
        open={!!cashDrill}
        onClose={() => setCashDrill(null)}
        title={cashDrill?.title || ""}
        subtitle={cashDrill?.subtitle || ""}
      >
        <DataTable
          columns={CASH_COLUMNS}
          rows={cashDrill?.rows || []}
          rowKey={(r) => r.id}
          isTestRow={(r) => r.isTest}
          searchable
          searchPlaceholder="Search name, email, cohort, product…"
        />
      </DrillDownModal>

      <DrillDownModal
        open={!!appDrill}
        onClose={() => setAppDrill(null)}
        title={appDrill?.title || ""}
        subtitle={appDrill?.subtitle || ""}
      >
        <DataTable
          columns={APP_COLUMNS}
          rows={appDrill?.rows || []}
          rowKey={(r) => r.id}
          isTestRow={(r) => r.isTest}
          searchable
          searchPlaceholder="Search name, email, phone, status…"
        />
      </DrillDownModal>

      <DrillDownModal
        open={!!salesDrill}
        onClose={() => setSalesDrill(null)}
        title={salesDrill?.title || ""}
        subtitle={salesDrill?.subtitle || ""}
      >
        <DataTable
          columns={SALES_COLUMNS}
          rows={salesDrill?.rows || []}
          rowKey={(r) => r.id}
          isTestRow={(r) => r.isTest}
          searchable
          searchPlaceholder="Search entry, closer, launch…"
        />
      </DrillDownModal>
    </div>
  );
}

const APPT_COLUMNS: Column<AppointmentRow>[] = [
  { key: "name", label: "Name", render: (r) => <GhlName name={r.name} ghlUrl={r.ghlUrl} />, sortValue: (r) => r.name },
  { key: "email", label: "Email", render: (r) => r.email || "—", sortValue: (r) => r.email },
  { key: "phone", label: "Phone", render: (r) => r.phone || "—" },
  { key: "appointmentTime", label: "Appointment Date", render: (r) => formatDateShort(r.appointmentTime), sortValue: (r) => r.appointmentTime },
  { key: "status", label: "Status", render: (r) => r.status || "—", sortValue: (r) => r.status },
  { key: "cohort", label: "Cohort", render: (r) => r.cohort || "—", sortValue: (r) => r.cohort },
  { key: "enrManager", label: "Closer", render: (r) => r.enrManager || "—", sortValue: (r) => r.enrManager },
];

const CASH_COLUMNS: Column<CashRow>[] = [
  { key: "name", label: "Name", render: (r) => r.name, sortValue: (r) => r.name },
  { key: "email", label: "Email", render: (r) => r.email || "—", sortValue: (r) => r.email },
  { key: "transactionType", label: "Type", render: (r) => {
    const t = r.transactionType || "Payment";
    const color = t === "Refund" ? "var(--red)" : t === "Dropout" ? "var(--accent)" : t === "Deposit" ? "var(--blue)" : "var(--green)";
    return <span style={{ color, fontWeight: 500 }}>{t}</span>;
  }, sortValue: (r) => r.transactionType },
  { key: "cashCollected", label: "Cash", render: (r) => <span className="mono">{formatMoney(r.cashCollected)}</span>, sortValue: (r) => r.cashCollected },
  { key: "revenue", label: "Revenue", render: (r) => <span className="mono">{formatMoney(r.revenue)}</span>, sortValue: (r) => r.revenue },
  { key: "enrollmentDate", label: "Date", render: (r) => formatDateShort(r.enrollmentDate), sortValue: (r) => r.enrollmentDate },
  { key: "product", label: "Product", render: (r) => r.product || "—", sortValue: (r) => r.product },
  { key: "cohort", label: "Cohort", render: (r) => r.cohort || "—", sortValue: (r) => r.cohort },
  { key: "enrManager", label: "Closer", render: (r) => r.enrManager || "—", sortValue: (r) => r.enrManager },
];

const APP_COLUMNS: Column<ApplicationRow>[] = [
  { key: "firstName", label: "First Name", render: (r) => <GhlName name={r.firstName} ghlUrl={r.ghlUrl} />, sortValue: (r) => r.firstName },
  { key: "lastName", label: "Last Name", render: (r) => r.lastName || "—", sortValue: (r) => r.lastName },
  { key: "email", label: "Email", render: (r) => r.email || "—", sortValue: (r) => r.email },
  { key: "phone", label: "Phone", render: (r) => r.phone || "—" },
  { key: "applicationStatus", label: "Status", render: (r) => r.applicationStatus || "—", sortValue: (r) => r.applicationStatus },
  { key: "dateCreated", label: "Date", render: (r) => formatDateShort(r.dateCreated), sortValue: (r) => r.dateCreated },
  { key: "purchased", label: "Purchased", render: (r) => r.purchased ? "Yes" : "No", sortValue: (r) => (r.purchased ? 1 : 0) },
  { key: "annualEarnings", label: "Earnings", render: (r) => r.annualEarnings || "—", sortValue: (r) => r.annualEarnings },
];

const SALES_COLUMNS: Column<SalesActivityRow>[] = [
  { key: "entry", label: "Entry", render: (r) => r.entry, sortValue: (r) => r.entry },
  { key: "date", label: "Date", render: (r) => formatDateShort(r.date), sortValue: (r) => r.date },
  { key: "enrManager", label: "Closer", render: (r) => r.enrManager || "—", sortValue: (r) => r.enrManager },
  { key: "launch", label: "Launch", render: (r) => r.launch || "—", sortValue: (r) => r.launch },
  { key: "newCalls", label: "Calls", render: (r) => formatNumber(r.newCalls), sortValue: (r) => r.newCalls },
  { key: "showed", label: "Showed", render: (r) => formatNumber(r.showed), sortValue: (r) => r.showed },
  { key: "offersMade", label: "Offers", render: (r) => formatNumber(r.offersMade), sortValue: (r) => r.offersMade },
  { key: "salesMade", label: "Sales", render: (r) => formatNumber(r.salesMade), sortValue: (r) => r.salesMade },
  { key: "cashCollectedOnCall", label: "Cash Collected", render: (r) => formatMoney(r.cashCollectedOnCall), sortValue: (r) => r.cashCollectedOnCall },
];

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
  sublabel?: string;
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
  onClick?: () => void;
}

function HeroCard({
  label,
  sublabel,
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
  onClick,
}: HeroCardProps) {
  const deltaText = delta?.pct === null || delta === null ? null : delta;
  const deltaGood = deltaText?.pct === null || deltaText === null || Math.abs(deltaText.pct) < 0.001 ? null : deltaText.pct > 0 === higherIsBetter;
  const deltaColor = deltaGood === null ? "var(--muted)" : deltaGood ? "var(--green)" : "var(--red)";

  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      style={{
        background: "var(--gradient-surface)",
        border: "1px solid var(--line)",
        borderRadius: 14,
        padding: 18,
        boxShadow: "var(--shadow-card)",
        position: "relative",
        overflow: "hidden",
        cursor: onClick ? "pointer" : undefined,
        transition: onClick ? "border-color 0.15s" : undefined,
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: color, opacity: 0.7 }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div>
          <div style={{ color: "var(--muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.1 }}>{label}</div>
          {sublabel && (
            <div style={{ color: "var(--accent, #10b981)", fontSize: 9.5, fontWeight: 700, marginTop: 1, letterSpacing: 0.03 }}>
              {sublabel}
            </div>
          )}
        </div>
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
