"use client";
import { useMemo, useState } from "react";
import type { AppointmentRow } from "@/lib/types";
import {
  fmtInt, fmtPct, fmtDate, rangeBounds, inRange, timeSeries, uniqueValues, type Granularity,
} from "@/lib/format";
import { Kpi, Card, Chips, FilterBar, emptyFilters, DataTable, type FilterState, type Column } from "@/components/ui";
import { TimeAreaChart, BreakdownBars, COLORS } from "@/components/charts";

const SELECT_IDS = ["status", "type", "cohort", "manager"];

// Status groupings, taken from the tracker's own status groups in Notion.
// "Showed" here means the call happened: Showed, Client Won, and the
// post-call pipeline stages that can only exist after a call took place.
const SHOWED_STATUSES = new Set([
  "Showed", "Client Won", "Finisher", "Awaiting Payment", "Deposit Collected", "Purchased Agreement Not Signed",
]);
const LOST_STATUSES = new Set(["Pre-Call Lost", "Lost / Not Interested / Ghosted", "Unqualified", "Invalid"]);

export function AppointmentsTab({ rows }: { rows: AppointmentRow[] }) {
  const [filters, setFilters] = useState<FilterState>(() => emptyFilters(SELECT_IDS));
  const [gran, setGran] = useState<Granularity>("week");

  const filtered = useMemo(() => {
    const bounds = rangeBounds(filters.range, filters.from, filters.to);
    const q = filters.search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filters.range !== "all" && !inRange(r.appointmentTime, bounds)) return false;
      if (filters.selects.status && r.status !== filters.selects.status) return false;
      if (filters.selects.type && r.type !== filters.selects.type) return false;
      if (filters.selects.cohort && r.cohort !== filters.selects.cohort) return false;
      if (filters.selects.manager && r.enrManager !== filters.selects.manager) return false;
      if (q && !(`${r.name} ${r.email} ${r.phone} ${r.notes}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, filters]);

  const total = filtered.length;
  const showed = filtered.filter((r) => SHOWED_STATUSES.has(r.status)).length;
  const won = filtered.filter((r) => r.status === "Client Won").length;
  const noShow = filtered.filter((r) => r.status === "No show").length;
  const cancelled = filtered.filter((r) => r.status === "Cancelled").length;
  const lost = filtered.filter((r) => LOST_STATUSES.has(r.status)).length;

  const byStatus = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtered) map.set(r.status || "(no status)", (map.get(r.status || "(no status)") ?? 0) + 1);
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filtered]);

  const overTime = useMemo(
    () => timeSeries(filtered, (r) => r.appointmentTime, gran, [
      { key: "booked", get: () => 1 },
      { key: "showed", get: (r) => (SHOWED_STATUSES.has(r.status) ? 1 : 0) },
      { key: "won", get: (r) => (r.status === "Client Won" ? 1 : 0) },
    ]),
    [filtered, gran],
  );

  const columns: Column<AppointmentRow>[] = [
    { key: "name", label: "Name", render: (r) => r.name || "—", sortVal: (r) => r.name },
    { key: "time", label: "Appointment", render: (r) => fmtDate(r.appointmentTime), sortVal: (r) => r.appointmentTime ?? "" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} />, sortVal: (r) => r.status },
    { key: "type", label: "Type", render: (r) => r.type || "—", sortVal: (r) => r.type },
    { key: "cohort", label: "Cohort", render: (r) => r.cohort || "—", sortVal: (r) => r.cohort },
    { key: "manager", label: "Enr manager", render: (r) => r.enrManager || "—", sortVal: (r) => r.enrManager },
    { key: "email", label: "Email", render: (r) => r.email || "—", sortVal: (r) => r.email },
    { key: "created", label: "Created", render: (r) => fmtDate(r.created), sortVal: (r) => r.created ?? "" },
    { key: "notes", label: "Notes", render: (r) => (r.notes.length > 60 ? r.notes.slice(0, 60) + "…" : r.notes), sortVal: (r) => r.notes },
  ];

  return (
    <>
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        searchPlaceholder="Name, email, phone, notes"
        selectDefs={[
          { id: "status", label: "Status", options: uniqueValues(rows, (r) => r.status) },
          { id: "type", label: "Type", options: uniqueValues(rows, (r) => r.type) },
          { id: "cohort", label: "Cohort", options: uniqueValues(rows, (r) => r.cohort) },
          { id: "manager", label: "Enr manager", options: uniqueValues(rows, (r) => r.enrManager) },
        ]}
      />
      <div className="kpi-grid">
        <Kpi label="Booked" value={fmtInt(total)} accent={COLORS.blue} sub="All appointments in range" />
        <Kpi label="Showed" value={fmtInt(showed)} accent={COLORS.gold} sub="Showed, won, or in post-call pipeline" />
        <Kpi label="Show rate" value={fmtPct(total > 0 ? showed / total : null)} sub="Showed ÷ booked" />
        <Kpi label="Clients won" value={fmtInt(won)} accent={COLORS.green} />
        <Kpi label="Win rate (of shows)" value={fmtPct(showed > 0 ? won / showed : null)} accent={COLORS.green} />
        <Kpi label="No-shows" value={fmtInt(noShow)} accent={COLORS.red} />
        <Kpi label="Cancelled" value={fmtInt(cancelled)} />
        <Kpi label="Lost / DQ" value={fmtInt(lost)} sub="Lost, ghosted, unqualified, invalid" />
      </div>
      <Card
        title="Appointments over time"
        sub="By appointment date"
        right={<Chips options={[{ key: "day", label: "Daily" }, { key: "week", label: "Weekly" }, { key: "month", label: "Monthly" }]} active={gran} onChange={(k) => setGran(k as Granularity)} />}
      >
        <TimeAreaChart data={overTime} series={[
          { key: "booked", name: "Booked", color: COLORS.blue },
          { key: "showed", name: "Showed", color: COLORS.gold },
          { key: "won", name: "Won", color: COLORS.green },
        ]} />
      </Card>
      <Card title="Status breakdown" sub="Every appointment by its current status">
        <BreakdownBars data={byStatus} horizontal />
      </Card>
      <Card title="All appointments" sub="Click a column to sort">
        <DataTable rows={filtered} columns={columns} initialSort={{ key: "time", dir: "desc" }} />
      </Card>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (!status) return <>—</>;
  const cls =
    status === "Client Won" ? "green" :
    status === "Showed" ? "gold" :
    LOST_STATUSES.has(status) || status === "No show" ? "red" :
    status === "Confirmed" ? "blue" : "";
  return <span className={`badge ${cls}`}>{status}</span>;
}
