"use client";

import { useMemo, useState } from "react";
import type { AppointmentRow } from "@/lib/types";
import { resolveRange, inRange, type RangePreset } from "@/lib/dates";
import { uniqueSorted, matchesSearch } from "@/lib/filtering";
import { formatNumber, formatPercent } from "@/lib/money";
import Controls from "../Controls";
import KpiGrid from "../Kpi";
import TimeSeriesChart from "../TimeSeriesChart";
import BreakdownChart from "../BreakdownChart";
import DataTable, { type Column } from "../DataTable";
import { DateCell } from "../MoneyCell";

const SHOWED_STATUSES = new Set(["Showed", "Client Won", "Finisher"]);

export default function AppointmentsTab({ rows }: { rows: AppointmentRow[] }) {
  const [preset, setPreset] = useState<RangePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [cohort, setCohort] = useState("");
  const [enrManager, setEnrManager] = useState("");
  const [search, setSearch] = useState("");
  const [includeTest, setIncludeTest] = useState(false);

  const statuses = useMemo(() => uniqueSorted(rows.map((r) => r.status)), [rows]);
  const types = useMemo(() => uniqueSorted(rows.map((r) => r.appointmentType)), [rows]);
  const cohorts = useMemo(() => uniqueSorted(rows.map((r) => r.cohort)), [rows]);
  const managers = useMemo(() => uniqueSorted(rows.map((r) => r.enrManager)), [rows]);

  const filtered = useMemo(() => {
    const { from, to } = resolveRange(preset, customFrom, customTo);
    return rows.filter((r) => {
      if (!includeTest && r.isTest) return false;
      if (!inRange(r.appointmentTime, from, to)) return false;
      if (status && r.status !== status) return false;
      if (type && r.appointmentType !== type) return false;
      if (cohort && r.cohort !== cohort) return false;
      if (enrManager && r.enrManager !== enrManager) return false;
      if (!matchesSearch([r.name, r.email, r.phone, r.notes], search)) return false;
      return true;
    });
  }, [rows, preset, customFrom, customTo, status, type, cohort, enrManager, search, includeTest]);

  const showedCount = filtered.filter((r) => r.status && SHOWED_STATUSES.has(r.status)).length;
  const noShowCount = filtered.filter((r) => r.status === "No show").length;
  const cancelledCount = filtered.filter((r) => r.status === "Cancelled").length;

  const columns: Column<AppointmentRow>[] = [
    { key: "name", label: "Name", render: (r) => r.name, sortValue: (r) => r.name },
    { key: "email", label: "Email", render: (r) => r.email || "—", sortValue: (r) => r.email },
    { key: "phone", label: "Phone", render: (r) => r.phone || "—" },
    {
      key: "appointmentTime",
      label: "Appointment Time",
      render: (r) => <DateCell value={r.appointmentTime} field="Appointment Time" health={r.health} />,
      sortValue: (r) => r.appointmentTime,
    },
    { key: "status", label: "Status", render: (r) => r.status || "—", sortValue: (r) => r.status },
    { key: "appointmentType", label: "Type", render: (r) => r.appointmentType || "—", sortValue: (r) => r.appointmentType },
    { key: "cohort", label: "Cohort", render: (r) => r.cohort || "—", sortValue: (r) => r.cohort },
    { key: "enrManager", label: "Enr Manager", render: (r) => r.enrManager || "—", sortValue: (r) => r.enrManager },
    { key: "calendar", label: "Calendar", render: (r) => r.calendar || "—" },
    { key: "notes", label: "Notes", render: (r) => r.notes || "—" },
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
          { key: "type", label: "Type", options: types, value: type, onChange: setType },
          { key: "cohort", label: "Cohort", options: cohorts, value: cohort, onChange: setCohort },
          { key: "enrManager", label: "Enr Manager", options: managers, value: enrManager, onChange: setEnrManager },
        ]}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name, email, phone…"
        includeTest={includeTest}
        onIncludeTestChange={setIncludeTest}
      />

      <KpiGrid
        items={[
          { label: "Total Appointments", value: formatNumber(filtered.length) },
          { label: "Showed", value: formatNumber(showedCount) },
          { label: "Show Rate", value: formatPercent(filtered.length ? showedCount / filtered.length : null) },
          { label: "No Shows", value: formatNumber(noShowCount) },
          { label: "Cancelled", value: formatNumber(cancelledCount) },
        ]}
      />

      <div className="chart-grid">
        <TimeSeriesChart
          title="Appointments Over Time"
          points={filtered.map((r) => ({ date: r.appointmentTime, value: 1 }))}
          color="#61aaf2"
        />
        <BreakdownChart
          title="Appointments by Status"
          items={statuses.map((s) => ({ key: s, value: filtered.filter((r) => r.status === s).length }))}
        />
      </div>

      <DataTable columns={columns} rows={filtered} rowKey={(r) => r.id} isTestRow={(r) => r.isTest} />
    </div>
  );
}
