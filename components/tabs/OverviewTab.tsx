"use client";

import { useMemo, useState } from "react";
import type { AppointmentRow, ApplicationRow, CashRow, SalesActivityRow } from "@/lib/types";
import { resolveRange, inRange, type RangePreset } from "@/lib/dates";
import { sum } from "@/lib/filtering";
import { formatMoney, formatNumber, formatPercent } from "@/lib/money";
import Controls from "../Controls";
import KpiGrid from "../Kpi";
import TimeSeriesChart from "../TimeSeriesChart";
import BreakdownChart from "../BreakdownChart";

interface Props {
  cash: CashRow[];
  appointments: AppointmentRow[];
  applications: ApplicationRow[];
  salesActivity: SalesActivityRow[];
}

const SHOWED_STATUSES = new Set(["Showed", "Client Won", "Finisher"]);

export default function OverviewTab({ cash, appointments, applications, salesActivity }: Props) {
  const [preset, setPreset] = useState<RangePreset>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [includeTest, setIncludeTest] = useState(false);

  const { from, to } = resolveRange(preset, customFrom, customTo);

  const cashFiltered = useMemo(
    () => cash.filter((r) => (includeTest || !r.isTest) && inRange(r.enrollmentDate, from, to)),
    [cash, from, to, includeTest]
  );
  const apptFiltered = useMemo(
    () => appointments.filter((r) => (includeTest || !r.isTest) && inRange(r.appointmentTime, from, to)),
    [appointments, from, to, includeTest]
  );
  const appFiltered = useMemo(
    () => applications.filter((r) => (includeTest || !r.isTest) && inRange(r.dateCreated, from, to)),
    [applications, from, to, includeTest]
  );
  const salesFiltered = useMemo(
    () => salesActivity.filter((r) => (includeTest || !r.isTest) && inRange(r.date, from, to)),
    [salesActivity, from, to, includeTest]
  );

  const totalCashCollected = sum(cashFiltered.map((r) => r.cashCollected));
  const totalRevenue = sum(cashFiltered.map((r) => r.revenue));
  const totalBalance = sum(cashFiltered.map((r) => r.balance));
  const showedCount = apptFiltered.filter((r) => r.status && SHOWED_STATUSES.has(r.status)).length;
  const purchasedApps = appFiltered.filter((r) => r.purchased).length;
  const salesCashOnCall = sum(salesFiltered.map((r) => r.cashCollectedOnCall));

  const statuses = Array.from(new Set(apptFiltered.map((r) => r.status).filter(Boolean))) as string[];

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
          { label: "Cash Collected", value: formatMoney(totalCashCollected) },
          { label: "Revenue Booked", value: formatMoney(totalRevenue) },
          { label: "Outstanding", value: formatMoney(totalBalance) },
          { label: "Appointments", value: formatNumber(apptFiltered.length) },
          { label: "Show Rate", value: formatPercent(apptFiltered.length ? showedCount / apptFiltered.length : null) },
          { label: "Applications", value: formatNumber(appFiltered.length) },
          {
            label: "App Conversion",
            value: formatPercent(appFiltered.length ? purchasedApps / appFiltered.length : null),
          },
          { label: "Cash on Call (Sales Activity)", value: formatMoney(salesCashOnCall) },
        ]}
      />

      <div className="chart-grid">
        <TimeSeriesChart
          title="Cash Collected"
          points={cashFiltered.map((r) => ({ date: r.enrollmentDate, value: r.cashCollected ?? 0 }))}
          color="#45d093"
          valueFormatter={(v) => formatMoney(v)}
        />
        <BreakdownChart
          title="Appointments by Status"
          items={statuses.map((s) => ({ key: s, value: apptFiltered.filter((r) => r.status === s).length }))}
        />
      </div>
    </div>
  );
}
