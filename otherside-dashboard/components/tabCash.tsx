"use client";
import { useMemo, useState } from "react";
import type { CashRow } from "@/lib/types";
import {
  fmtMoney, fmtMoneyExact, fmtInt, fmtDate, rangeBounds, inRange,
  timeSeries, groupSum, uniqueValues, type Granularity,
} from "@/lib/format";
import { Kpi, Card, Chips, FilterBar, emptyFilters, DataTable, type FilterState, type Column } from "@/components/ui";
import { TimeAreaChart, BreakdownBars, COLORS } from "@/components/charts";

const SELECT_IDS = ["cohort", "product", "manager", "method"];

export function CashTab({ rows }: { rows: CashRow[] }) {
  const [filters, setFilters] = useState<FilterState>(() => emptyFilters(SELECT_IDS));
  const [gran, setGran] = useState<Granularity>("week");

  const filtered = useMemo(() => {
    const bounds = rangeBounds(filters.range, filters.from, filters.to);
    const q = filters.search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filters.range !== "all" && !inRange(r.enrollmentDate, bounds)) return false;
      if (filters.selects.cohort && r.cohort !== filters.selects.cohort) return false;
      if (filters.selects.product && r.product !== filters.selects.product) return false;
      if (filters.selects.manager && r.enrManager !== filters.selects.manager) return false;
      if (filters.selects.method && r.paymentMethod !== filters.selects.method) return false;
      if (q && !(`${r.name} ${r.email} ${r.note} ${r.couponCode}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, filters]);

  const revenue = filtered.reduce((s, r) => s + (r.revenue ?? 0), 0);
  const cash = filtered.reduce((s, r) => s + (r.cashCollected ?? 0), 0);
  const avgDeal = filtered.length > 0 ? revenue / filtered.length : null;

  const overTime = useMemo(
    () => timeSeries(filtered, (r) => r.enrollmentDate, gran, [
      { key: "cash", get: (r) => r.cashCollected ?? 0 },
      { key: "revenue", get: (r) => r.revenue ?? 0 },
    ]),
    [filtered, gran],
  );
  const byProduct = useMemo(() => groupSum(filtered, (r) => r.product, (r) => r.cashCollected ?? 0), [filtered]);
  const byMethod = useMemo(() => groupSum(filtered, (r) => r.paymentMethod, (r) => r.cashCollected ?? 0), [filtered]);

  const columns: Column<CashRow>[] = [
    { key: "name", label: "Name", render: (r) => r.name || "—", sortVal: (r) => r.name },
    { key: "date", label: "Enrolled", render: (r) => fmtDate(r.enrollmentDate), sortVal: (r) => r.enrollmentDate ?? "" },
    { key: "product", label: "Product", render: (r) => r.product || "—", sortVal: (r) => r.product },
    { key: "revenue", label: "Revenue", num: true, render: (r) => (r.revenue === null && r.revenueRaw ? <span className="badge red">{r.revenueRaw}</span> : fmtMoneyExact(r.revenue)), sortVal: (r) => r.revenue ?? -1 },
    { key: "cash", label: "Cash", num: true, render: (r) => (r.cashCollected === null && r.cashCollectedRaw ? <span className="badge red">{r.cashCollectedRaw}</span> : fmtMoneyExact(r.cashCollected)), sortVal: (r) => r.cashCollected ?? -1 },
    { key: "balance", label: "Balance", num: true, render: (r) => (r.balance === null ? "—" : <span style={{ color: r.balance > 0 ? "var(--red)" : "var(--green)" }}>{fmtMoneyExact(r.balance)}</span>), sortVal: (r) => r.balance ?? -1 },
    { key: "cohort", label: "Cohort", render: (r) => r.cohort || "—", sortVal: (r) => r.cohort },
    { key: "method", label: "Method", render: (r) => r.paymentMethod || "—", sortVal: (r) => r.paymentMethod },
    { key: "next", label: "Next payment", render: (r) => fmtDate(r.nextPaymentDate), sortVal: (r) => r.nextPaymentDate ?? "" },
    { key: "manager", label: "Enr manager", render: (r) => r.enrManager || "—", sortVal: (r) => r.enrManager },
    { key: "note", label: "Note", render: (r) => r.note || "", sortVal: (r) => r.note },
  ];

  return (
    <>
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        searchPlaceholder="Name, email, note, coupon"
        selectDefs={[
          { id: "cohort", label: "Cohort", options: uniqueValues(rows, (r) => r.cohort) },
          { id: "product", label: "Product", options: uniqueValues(rows, (r) => r.product) },
          { id: "manager", label: "Enr manager", options: uniqueValues(rows, (r) => r.enrManager) },
          { id: "method", label: "Payment method", options: uniqueValues(rows, (r) => r.paymentMethod) },
        ]}
      />
      <div className="kpi-grid">
        <Kpi label="Cash collected" value={fmtMoney(cash)} accent={COLORS.gold} />
        <Kpi label="Revenue booked" value={fmtMoney(revenue)} accent={COLORS.blue} />
        <Kpi label="Outstanding" value={fmtMoney(revenue - cash)} accent={COLORS.red} />
        <Kpi label="Payments" value={fmtInt(filtered.length)} />
        <Kpi label="Avg revenue / row" value={fmtMoney(avgDeal)} />
      </div>
      <Card
        title="Cash & revenue over time"
        sub="By enrollment date"
        right={<Chips options={[{ key: "day", label: "Daily" }, { key: "week", label: "Weekly" }, { key: "month", label: "Monthly" }]} active={gran} onChange={(k) => setGran(k as Granularity)} />}
      >
        <TimeAreaChart data={overTime} isMoney series={[
          { key: "cash", name: "Cash collected", color: COLORS.gold },
          { key: "revenue", name: "Revenue booked", color: COLORS.blue },
        ]} />
      </Card>
      <div className="grid-2">
        <Card title="Cash by product" sub="As written in the Product field">
          <BreakdownBars data={byProduct.slice(0, 12)} isMoney horizontal />
        </Card>
        <Card title="Cash by payment method">
          <BreakdownBars data={byMethod} isMoney horizontal />
        </Card>
      </div>
      <Card title="All payments" sub="Click a column to sort. Red badges are values that could not be read as numbers — fix them in Notion.">
        <DataTable rows={filtered} columns={columns} initialSort={{ key: "date", dir: "desc" }} />
      </Card>
    </>
  );
}
