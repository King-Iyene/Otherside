"use client";

import { useMemo, useState } from "react";
import type { AppointmentRow, ApplicationRow, CashRow, SalesActivityRow } from "@/lib/types";
import { resolveRange, inRange, type RangePreset } from "@/lib/dates";
import { sum } from "@/lib/filtering";
import { previousPeriod, computeDelta } from "@/lib/comparison";
import { formatMoney, formatNumber, formatPercent } from "@/lib/money";
import Controls from "../Controls";
import KpiGrid from "../Kpi";
import TimeSeriesChart from "../TimeSeriesChart";
import BreakdownChart from "../BreakdownChart";
import FunnelChart from "../FunnelChart";

interface Props {
  cash: CashRow[];
  appointments: AppointmentRow[];
  applications: ApplicationRow[];
  salesActivity: SalesActivityRow[];
}

const SHOWED_STATUSES = new Set(["Showed", "Client Won", "Finisher"]);

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

export default function OverviewTab({ cash, appointments, applications, salesActivity }: Props) {
  const [preset, setPreset] = useState<RangePreset>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [includeTest, setIncludeTest] = useState(false);

  const { from, to } = resolveRange(preset, customFrom, customTo);
  const stats = useMemo(
    () => computeStats(cash, appointments, applications, salesActivity, from, to, includeTest),
    [cash, appointments, applications, salesActivity, from, to, includeTest]
  );

  const prevRange = previousPeriod(from, to);
  const prevStats = useMemo(() => {
    if (!prevRange) return null;
    return computeStats(cash, appointments, applications, salesActivity, prevRange.from, prevRange.to, includeTest);
  }, [cash, appointments, applications, salesActivity, prevRange, includeTest]);

  const statuses = Array.from(new Set(stats.apptRows.map((r) => r.status).filter(Boolean))) as string[];

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
      />

      <KpiGrid
        items={[
          { label: "Cash Collected", value: formatMoney(stats.cashCollected), delta: prevStats && computeDelta(stats.cashCollected, prevStats.cashCollected) },
          { label: "Revenue Booked", value: formatMoney(stats.revenue), delta: prevStats && computeDelta(stats.revenue, prevStats.revenue) },
          {
            label: "Outstanding",
            value: formatMoney(stats.balance),
            delta: prevStats && computeDelta(stats.balance, prevStats.balance),
            higherIsBetter: false,
          },
          { label: "Appointments", value: formatNumber(stats.appointments), delta: prevStats && computeDelta(stats.appointments, prevStats.appointments) },
          {
            label: "Show Rate",
            value: formatPercent(stats.showRate),
            delta: stats.showRate != null && prevStats?.showRate != null ? computeDelta(stats.showRate, prevStats.showRate) : null,
          },
          { label: "Applications", value: formatNumber(stats.applications), delta: prevStats && computeDelta(stats.applications, prevStats.applications) },
          {
            label: "App Conversion",
            value: formatPercent(stats.conversionRate),
            delta:
              stats.conversionRate != null && prevStats?.conversionRate != null
                ? computeDelta(stats.conversionRate, prevStats.conversionRate)
                : null,
          },
          {
            label: "Cash on Call (Sales Activity)",
            value: formatMoney(stats.cashOnCall),
            delta: prevStats && computeDelta(stats.cashOnCall, prevStats.cashOnCall),
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
    </div>
  );
}
