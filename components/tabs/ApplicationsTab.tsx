"use client";

import { useMemo, useState } from "react";
import type { ApplicationRow } from "@/lib/types";
import { resolveRange, inRange, type RangePreset } from "@/lib/dates";
import { uniqueSorted, matchesSearch } from "@/lib/filtering";
import { formatNumber, formatPercent } from "@/lib/money";
import Controls from "../Controls";
import KpiGrid from "../Kpi";
import TimeSeriesChart from "../TimeSeriesChart";
import BreakdownChart from "../BreakdownChart";
import DataTable, { type Column } from "../DataTable";
import { DateCell } from "../MoneyCell";

export default function ApplicationsTab({ rows }: { rows: ApplicationRow[] }) {
  const [preset, setPreset] = useState<RangePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [status, setStatus] = useState("");
  const [earnings, setEarnings] = useState("");
  const [search, setSearch] = useState("");
  const [includeTest, setIncludeTest] = useState(false);

  const statuses = useMemo(() => uniqueSorted(rows.map((r) => r.applicationStatus)), [rows]);
  const earningsOptions = useMemo(() => uniqueSorted(rows.map((r) => r.annualEarnings)), [rows]);

  const filtered = useMemo(() => {
    const { from, to } = resolveRange(preset, customFrom, customTo);
    return rows.filter((r) => {
      if (!includeTest && r.isTest) return false;
      if (!inRange(r.dateCreated, from, to)) return false;
      if (status && r.applicationStatus !== status) return false;
      if (earnings && r.annualEarnings !== earnings) return false;
      if (!matchesSearch([r.firstName, r.lastName, r.email, r.phone], search)) return false;
      return true;
    });
  }, [rows, preset, customFrom, customTo, status, earnings, search, includeTest]);

  const purchasedCount = filtered.filter((r) => r.purchased).length;

  const columns: Column<ApplicationRow>[] = [
    { key: "firstName", label: "First Name", render: (r) => r.firstName, sortValue: (r) => r.firstName },
    { key: "lastName", label: "Last Name", render: (r) => r.lastName || "—", sortValue: (r) => r.lastName },
    { key: "email", label: "Email", render: (r) => r.email || "—", sortValue: (r) => r.email },
    { key: "phone", label: "Phone", render: (r) => r.phone || "—" },
    { key: "applicationStatus", label: "Status", render: (r) => r.applicationStatus || "—", sortValue: (r) => r.applicationStatus },
    { key: "annualEarnings", label: "Annual Earnings", render: (r) => r.annualEarnings || "—", sortValue: (r) => r.annualEarnings },
    {
      key: "dateCreated",
      label: "Date Created",
      render: (r) => <DateCell value={r.dateCreated} field="Date Created" health={r.health} />,
      sortValue: (r) => r.dateCreated,
    },
    {
      key: "purchased",
      label: "Purchased",
      render: (r) => (r.purchased ? <span className="badge" style={{ color: "var(--green)", border: "1px solid var(--green)" }}>YES</span> : "—"),
      sortValue: (r) => (r.purchased ? 1 : 0),
    },
  ];

  return (
    <div>
      <Controls
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
        dimensions={[
          { key: "status", label: "Status", options: statuses, value: status, onChange: setStatus },
          { key: "earnings", label: "Earnings", options: earningsOptions, value: earnings, onChange: setEarnings },
        ]}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name, email, phone…"
        includeTest={includeTest}
        onIncludeTestChange={setIncludeTest}
      />

      <KpiGrid
        items={[
          { label: "Applications", value: formatNumber(filtered.length) },
          { label: "Purchased", value: formatNumber(purchasedCount) },
          { label: "Conversion Rate", value: formatPercent(filtered.length ? purchasedCount / filtered.length : null) },
        ]}
      />

      <div className="chart-grid">
        <TimeSeriesChart
          title="Applications Over Time"
          points={filtered.map((r) => ({ date: r.dateCreated, value: 1 }))}
          color="#f2b63c"
        />
        <BreakdownChart
          title="By Annual Earnings"
          items={earningsOptions.map((e) => ({ key: e, value: filtered.filter((r) => r.annualEarnings === e).length }))}
        />
      </div>

      <DataTable columns={columns} rows={filtered} rowKey={(r) => r.id} isTestRow={(r) => r.isTest} />
    </div>
  );
}
