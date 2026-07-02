"use client";

import { useMemo, useState } from "react";
import type { CashRow } from "@/lib/types";
import { resolveRange, inRange, type RangePreset } from "@/lib/dates";
import { uniqueSorted, matchesSearch, sum } from "@/lib/filtering";
import { previousPeriod, computeDelta } from "@/lib/comparison";
import { formatMoney, formatNumber, formatPercent } from "@/lib/money";
import Controls from "../Controls";
import KpiGrid from "../Kpi";
import TimeSeriesChart from "../TimeSeriesChart";
import BreakdownChart from "../BreakdownChart";
import DataTable, { type Column } from "../DataTable";
import MoneyCell, { DateCell } from "../MoneyCell";

export default function CashTab({ rows }: { rows: CashRow[] }) {
  const [preset, setPreset] = useState<RangePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [product, setProduct] = useState("");
  const [cohort, setCohort] = useState("");
  const [enrManager, setEnrManager] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [search, setSearch] = useState("");
  const [includeTest, setIncludeTest] = useState(false);

  const products = useMemo(() => uniqueSorted(rows.map((r) => r.product)), [rows]);
  const cohorts = useMemo(() => uniqueSorted(rows.map((r) => r.cohort)), [rows]);
  const managers = useMemo(() => uniqueSorted(rows.map((r) => r.enrManager)), [rows]);
  const paymentMethods = useMemo(() => uniqueSorted(rows.map((r) => r.paymentMethod)), [rows]);

  const dimensionMatch = (r: CashRow) => {
    if (product && r.product !== product) return false;
    if (cohort && r.cohort !== cohort) return false;
    if (enrManager && r.enrManager !== enrManager) return false;
    if (paymentMethod && r.paymentMethod !== paymentMethod) return false;
    if (!matchesSearch([r.name, r.email, r.note], search)) return false;
    return true;
  };

  const { from, to } = resolveRange(preset, customFrom, customTo);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (!includeTest && r.isTest) return false;
      if (!inRange(r.enrollmentDate, from, to)) return false;
      return dimensionMatch(r);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, from, to, product, cohort, enrManager, paymentMethod, search, includeTest]);

  const prevRange = previousPeriod(from, to);
  const prevFiltered = useMemo(() => {
    if (!prevRange) return null;
    return rows.filter((r) => {
      if (!includeTest && r.isTest) return false;
      if (!inRange(r.enrollmentDate, prevRange.from, prevRange.to)) return false;
      return dimensionMatch(r);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, prevRange, product, cohort, enrManager, paymentMethod, search, includeTest]);

  const totalRevenue = sum(filtered.map((r) => r.revenue));
  const totalCash = sum(filtered.map((r) => r.cashCollected));
  const totalBalance = sum(filtered.map((r) => r.balance));

  const prevTotals = prevFiltered
    ? {
        revenue: sum(prevFiltered.map((r) => r.revenue)),
        cash: sum(prevFiltered.map((r) => r.cashCollected)),
        balance: sum(prevFiltered.map((r) => r.balance)),
        count: prevFiltered.length,
      }
    : null;

  const cohortComparison = useMemo(() => {
    return cohorts
      .map((c) => {
        const curRows = filtered.filter((r) => r.cohort === c);
        const prevRows = prevFiltered ? prevFiltered.filter((r) => r.cohort === c) : [];
        const curCash = sum(curRows.map((r) => r.cashCollected));
        const prevCash = sum(prevRows.map((r) => r.cashCollected));
        return {
          cohort: c,
          enrollments: curRows.length,
          revenue: sum(curRows.map((r) => r.revenue)),
          cashCollected: curCash,
          avgDeal: curRows.length ? sum(curRows.map((r) => r.cashCollected)) / curRows.length : null,
          delta: prevFiltered ? computeDelta(curCash, prevCash) : null,
        };
      })
      .filter((c) => c.enrollments > 0)
      .sort((a, b) => b.cashCollected - a.cashCollected);
  }, [cohorts, filtered, prevFiltered]);

  const columns: Column<CashRow>[] = [
    { key: "name", label: "Name", render: (r) => r.name, sortValue: (r) => r.name },
    { key: "email", label: "Email", render: (r) => r.email || "—", sortValue: (r) => r.email },
    { key: "product", label: "Product", render: (r) => r.product || "—", sortValue: (r) => r.product },
    { key: "cohort", label: "Cohort", render: (r) => r.cohort || "—", sortValue: (r) => r.cohort },
    {
      key: "enrollmentDate",
      label: "Enrollment Date",
      render: (r) => <DateCell value={r.enrollmentDate} field="Enrollment Date" health={r.health} />,
      sortValue: (r) => r.enrollmentDate,
    },
    {
      key: "revenue",
      label: "Revenue",
      render: (r) => <MoneyCell value={r.revenue} field="Revenue" health={r.health} />,
      sortValue: (r) => r.revenue,
    },
    {
      key: "cashCollected",
      label: "Cash Collected",
      render: (r) => <MoneyCell value={r.cashCollected} field="Cash Collected" health={r.health} />,
      sortValue: (r) => r.cashCollected,
    },
    {
      key: "balance",
      label: "Balance",
      render: (r) => <MoneyCell value={r.balance} field="Balance" health={r.health} />,
      sortValue: (r) => r.balance,
    },
    { key: "couponCode", label: "Coupon", render: (r) => r.couponCode || "—", sortValue: (r) => r.couponCode },
    { key: "paymentMethod", label: "Payment Method", render: (r) => r.paymentMethod || "—", sortValue: (r) => r.paymentMethod },
    {
      key: "nextPaymentDate",
      label: "Next Payment",
      render: (r) => <DateCell value={r.nextPaymentDate} field="Date of Next Payment" health={r.health} />,
      sortValue: (r) => r.nextPaymentDate,
    },
    { key: "enrManager", label: "Enr Manager", render: (r) => r.enrManager || "—", sortValue: (r) => r.enrManager },
    { key: "note", label: "Note", render: (r) => r.note || "—" },
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
          { key: "product", label: "Product", options: products, value: product, onChange: setProduct },
          { key: "cohort", label: "Cohort", options: cohorts, value: cohort, onChange: setCohort },
          { key: "enrManager", label: "Enr Manager", options: managers, value: enrManager, onChange: setEnrManager },
          { key: "paymentMethod", label: "Payment Method", options: paymentMethods, value: paymentMethod, onChange: setPaymentMethod },
        ]}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name, email, note…"
        includeTest={includeTest}
        onIncludeTestChange={setIncludeTest}
      />

      <KpiGrid
        items={[
          { label: "Revenue", value: formatMoney(totalRevenue), delta: prevTotals && computeDelta(totalRevenue, prevTotals.revenue) },
          { label: "Cash Collected", value: formatMoney(totalCash), delta: prevTotals && computeDelta(totalCash, prevTotals.cash) },
          {
            label: "Outstanding Balance",
            value: formatMoney(totalBalance),
            delta: prevTotals && computeDelta(totalBalance, prevTotals.balance),
            higherIsBetter: false,
          },
          {
            label: "Enrollments",
            value: formatNumber(filtered.length),
            delta: prevTotals && computeDelta(filtered.length, prevTotals.count),
          },
        ]}
      />

      <div className="chart-grid">
        <TimeSeriesChart
          title="Cash Collected Over Time"
          points={filtered.map((r) => ({ date: r.enrollmentDate, value: r.cashCollected ?? 0 }))}
          color="#45d093"
          valueFormatter={(v) => formatMoney(v)}
        />
        <BreakdownChart
          title="Cash Collected by Cohort"
          items={cohorts.map((c) => ({ key: c, value: sum(filtered.filter((r) => r.cohort === c).map((r) => r.cashCollected)) }))}
          valueFormatter={(v) => formatMoney(v)}
        />
      </div>

      {cohortComparison.length > 0 && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-header">
            <div className="panel-title">Cohort Performance {prevFiltered ? "(vs. previous equivalent period)" : ""}</div>
          </div>
          <table className="leaderboard">
            <thead>
              <tr>
                <th>Cohort</th>
                <th>Enrollments</th>
                <th>Revenue</th>
                <th>Cash Collected</th>
                <th>Avg Deal Size</th>
                {prevFiltered && <th>Cash vs Prev</th>}
              </tr>
            </thead>
            <tbody>
              {cohortComparison.map((c) => (
                <tr key={c.cohort}>
                  <td>{c.cohort}</td>
                  <td className="mono">{formatNumber(c.enrollments)}</td>
                  <td className="mono">{formatMoney(c.revenue)}</td>
                  <td className="mono">{formatMoney(c.cashCollected)}</td>
                  <td className="mono">{formatMoney(c.avgDeal)}</td>
                  {prevFiltered && (
                    <td className="mono">
                      {c.delta?.pct === null || c.delta === null
                        ? "n/a"
                        : `${c.delta.pct >= 0 ? "▲" : "▼"} ${formatPercent(Math.abs(c.delta.pct))}`}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DataTable columns={columns} rows={filtered} rowKey={(r) => r.id} isTestRow={(r) => r.isTest} />
    </div>
  );
}
