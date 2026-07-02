"use client";
import { useMemo, useState } from "react";
import type { ApplicationRow } from "@/lib/types";
import {
  fmtInt, fmtPct, fmtDate, rangeBounds, inRange, timeSeries, uniqueValues, type Granularity,
} from "@/lib/format";
import { Kpi, Card, Chips, FilterBar, emptyFilters, DataTable, type FilterState, type Column } from "@/components/ui";
import { TimeAreaChart, BreakdownBars, COLORS } from "@/components/charts";

const SELECT_IDS = ["status", "income"];
const INCOME_ORDER = ["$0-$50k", "$50k - $100k", "$100k - $250k", "$250k - $1M", "$1M+"];

export function ApplicationsTab({ rows }: { rows: ApplicationRow[] }) {
  const [filters, setFilters] = useState<FilterState>(() => emptyFilters(SELECT_IDS));
  const [gran, setGran] = useState<Granularity>("week");

  const filtered = useMemo(() => {
    const bounds = rangeBounds(filters.range, filters.from, filters.to);
    const q = filters.search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filters.range !== "all" && !inRange(r.dateCreated, bounds)) return false;
      if (filters.selects.status && r.status !== filters.selects.status) return false;
      if (filters.selects.income && r.incomeBand !== filters.selects.income) return false;
      if (q && !(`${r.firstName} ${r.lastName} ${r.email} ${r.phone}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, filters]);

  const total = filtered.length;
  const ready = filtered.filter((r) => r.status === "Ready to Invest").length;
  const dq = filtered.filter((r) => r.status === "Disqualified" || r.status === "Adeyemi DQ Rejected").length;
  const purchased = filtered.filter((r) => r.hasPayment).length;

  const byStatus = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtered) map.set(r.status || "(no status)", (map.get(r.status || "(no status)") ?? 0) + 1);
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filtered]);

  const byIncome = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtered) map.set(r.incomeBand || "(not answered)", (map.get(r.incomeBand || "(not answered)") ?? 0) + 1);
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => {
        const ia = INCOME_ORDER.indexOf(a.name); const ib = INCOME_ORDER.indexOf(b.name);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });
  }, [filtered]);

  const overTime = useMemo(
    () => timeSeries(filtered, (r) => r.dateCreated, gran, [
      { key: "apps", get: () => 1 },
      { key: "purchased", get: (r) => (r.hasPayment ? 1 : 0) },
    ]),
    [filtered, gran],
  );

  const columns: Column<ApplicationRow>[] = [
    { key: "name", label: "Name", render: (r) => `${r.firstName} ${r.lastName}`.trim() || "—", sortVal: (r) => `${r.firstName} ${r.lastName}` },
    { key: "created", label: "Applied", render: (r) => fmtDate(r.dateCreated), sortVal: (r) => r.dateCreated ?? "" },
    { key: "status", label: "Status", render: (r) => <span className={`badge ${r.status === "Ready to Invest" ? "green" : r.status.includes("DQ") || r.status === "Disqualified" ? "red" : "blue"}`}>{r.status || "—"}</span>, sortVal: (r) => r.status },
    { key: "income", label: "Income band", render: (r) => r.incomeBand || "—", sortVal: (r) => INCOME_ORDER.indexOf(r.incomeBand) },
    { key: "purchased", label: "Purchased", render: (r) => (r.hasPayment ? <span className="badge gold">Yes</span> : "—"), sortVal: (r) => (r.hasPayment ? 1 : 0) },
    { key: "email", label: "Email", render: (r) => r.email || "—", sortVal: (r) => r.email },
    { key: "phone", label: "Phone", render: (r) => r.phone || "—", sortVal: (r) => r.phone },
  ];

  return (
    <>
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        searchPlaceholder="Name, email, phone"
        selectDefs={[
          { id: "status", label: "Application status", options: uniqueValues(rows, (r) => r.status) },
          { id: "income", label: "Income band", options: INCOME_ORDER.filter((b) => rows.some((r) => r.incomeBand === b)) },
        ]}
      />
      <div className="kpi-grid">
        <Kpi label="Applications" value={fmtInt(total)} accent={COLORS.blue} />
        <Kpi label="Ready to invest" value={fmtInt(ready)} accent={COLORS.green} sub={fmtPct(total > 0 ? ready / total : null) + " of applications"} />
        <Kpi label="Disqualified" value={fmtInt(dq)} accent={COLORS.red} sub="Incl. Adeyemi DQ Rejected" />
        <Kpi label="Purchased" value={fmtInt(purchased)} accent={COLORS.gold} sub="Linked to a payment record" />
        <Kpi label="Application → purchase" value={fmtPct(total > 0 ? purchased / total : null)} />
      </div>
      <Card
        title="Applications over time"
        sub="By date the application was created"
        right={<Chips options={[{ key: "day", label: "Daily" }, { key: "week", label: "Weekly" }, { key: "month", label: "Monthly" }]} active={gran} onChange={(k) => setGran(k as Granularity)} />}
      >
        <TimeAreaChart data={overTime} series={[
          { key: "apps", name: "Applications", color: COLORS.blue },
          { key: "purchased", name: "Purchased", color: COLORS.gold },
        ]} />
      </Card>
      <div className="grid-2">
        <Card title="By status">
          <BreakdownBars data={byStatus} horizontal />
        </Card>
        <Card title="By income band" sub="Self-reported annual earnings">
          <BreakdownBars data={byIncome} color={COLORS.blue} />
        </Card>
      </div>
      <Card title="All applications" sub="Click a column to sort">
        <DataTable rows={filtered} columns={columns} initialSort={{ key: "created", dir: "desc" }} />
      </Card>
    </>
  );
}
