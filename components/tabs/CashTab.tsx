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
import DrillDownModal from "../DrillDownModal";
import CloserBars from "../CloserBars";

// ── Unique-people accounting ──────────────────────────────────────────────
// The Cash Tracker is per-transaction: one buyer can have several rows
// (installments/upgrades), and a blank stub row can carry only a cohort tag.
// "Enrollments" must count unique real people so it matches the Overview tab
// and Cohort Funnels — money still sums every row.
function personKeyOf(r: CashRow): string | null {
  const email = (r.email || "").trim().toLowerCase();
  if (email) return email;
  const name = (r.name || "").trim().toLowerCase();
  return name ? `name:${name}` : null; // no email AND no name = blank stub → excluded
}

function countPeople(rows: CashRow[]): number {
  const seen = new Set<string>();
  for (const r of rows) {
    const k = personKeyOf(r);
    if (k) seen.add(k);
  }
  return seen.size;
}

interface PersonAgg {
  cash: number;
  balance: number;
  revenue: number;
}

/** Collapse rows to one entry per real person, summing their money. Lets us
 *  classify payment status per buyer (a person is "paid in full" when their
 *  TOTAL balance is cleared), not per invoice row. */
function aggregatePeople(rows: CashRow[]): PersonAgg[] {
  const map = new Map<string, PersonAgg>();
  for (const r of rows) {
    const k = personKeyOf(r);
    if (!k) continue;
    const e = map.get(k) || { cash: 0, balance: 0, revenue: 0 };
    e.cash += r.cashCollected ?? 0;
    e.balance += r.balance ?? 0;
    e.revenue += r.revenue ?? 0;
    map.set(k, e);
  }
  return Array.from(map.values());
}

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

  const [drilldown, setDrilldown] = useState<{ title: string; subtitle?: string; rows: CashRow[] } | null>(null);

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

  const enrollmentsCount = useMemo(() => countPeople(filtered), [filtered]);

  const prevTotals = prevFiltered
    ? {
        revenue: sum(prevFiltered.map((r) => r.revenue)),
        cash: sum(prevFiltered.map((r) => r.cashCollected)),
        count: countPeople(prevFiltered),
      }
    : null;

  const collectionRate = totalRevenue > 0 ? totalCash / totalRevenue : null;

  // Cohort economics
  const cohortEconomics = useMemo(() => {
    return cohorts
      .map((c) => {
        const curRows = filtered.filter((r) => r.cohort === c);
        const prevRows = prevFiltered ? prevFiltered.filter((r) => r.cohort === c) : [];
        const revenue = sum(curRows.map((r) => r.revenue));
        const cash = sum(curRows.map((r) => r.cashCollected));
        const people = aggregatePeople(curRows);
        const enrollments = people.length;
        const paidOff = people.filter((p) => p.balance <= 0 && p.cash > 0).length;
        const onPlan = people.filter((p) => p.balance > 0).length;
        const prevCash = sum(prevRows.map((r) => r.cashCollected));
        return {
          cohort: c,
          enrollments,
          revenue,
          cashCollected: cash,
          avgDeal: enrollments ? cash / enrollments : null,
          collectionRate: revenue > 0 ? cash / revenue : null,
          paidOff,
          onPlan,
          rows: curRows,
          delta: prevFiltered ? computeDelta(cash, prevCash) : null,
        };
      })
      .filter((c) => c.enrollments > 0)
      .sort((a, b) => b.cashCollected - a.cashCollected);
  }, [cohorts, filtered, prevFiltered]);

  // Payment status distribution — per person (a buyer is "paid in full" when
  // their TOTAL balance across all their rows is cleared), so these match the
  // unique Enrollments count rather than counting invoice rows.
  const people = useMemo(() => aggregatePeople(filtered), [filtered]);
  const paidInFullCount = people.filter((p) => p.balance <= 0 && p.cash > 0).length;
  const onPlanCount = people.filter((p) => p.balance > 0).length;
  const unpaidCount = people.filter((p) => p.balance > 0 && p.cash === 0).length;

  // Drill-down columns
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
    { key: "paymentMethod", label: "Payment Method", render: (r) => r.paymentMethod || "—" },
    {
      key: "nextPaymentDate",
      label: "Next Payment",
      render: (r) => <DateCell value={r.nextPaymentDate} field="Date of Next Payment" health={r.health} />,
      sortValue: (r) => r.nextPaymentDate,
    },
    { key: "enrManager", label: "Enr Manager", render: (r) => r.enrManager || "—", sortValue: (r) => r.enrManager },
  ];

  const openDrilldown = (title: string, subtitle: string | undefined, subset: CashRow[]) =>
    setDrilldown({ title, subtitle, rows: subset });

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
          {
            label: "Cash Collected",
            value: formatMoney(totalCash),
            delta: prevTotals && computeDelta(totalCash, prevTotals.cash),
            source: { source: "Reborn Cash Tracker (Notion)", field: "Cash Collected", formula: "SUM(Cash Collected)" },
            onClick: () => openDrilldown("Cash Collected — Enrollments", undefined, filtered),
          },
          {
            label: "Revenue",
            value: formatMoney(totalRevenue),
            delta: prevTotals && computeDelta(totalRevenue, prevTotals.revenue),
            source: { source: "Reborn Cash Tracker (Notion)", field: "Revenue", formula: "SUM(Revenue) WHERE Enrollment Date in period" },
            onClick: () => openDrilldown("All Enrollments", "Contributing to Revenue", filtered),
          },
          {
            label: "Collection Rate",
            value: formatPercent(collectionRate),
            source: { source: "Derived", field: "Cash Collected ÷ Revenue", formula: "Total collected out of total booked" },
            hint: collectionRate === null ? undefined : collectionRate >= 0.9 ? "excellent" : collectionRate >= 0.7 ? "healthy" : "needs attention",
            hintColor: collectionRate === null ? "muted" : collectionRate >= 0.9 ? "green" : collectionRate >= 0.7 ? "muted" : "red",
          },
          {
            label: "Enrollments",
            value: formatNumber(enrollmentsCount),
            delta: prevTotals && computeDelta(enrollmentsCount, prevTotals.count),
            source: { source: "Reborn Cash Tracker (Notion)", field: "Unique buyers (deduped by email; blank rows excluded)" },
            onClick: () => openDrilldown("All Enrollments", `${enrollmentsCount} unique buyers · ${formatNumber(filtered.length)} rows`, filtered),
          },
          {
            label: "Paid In Full",
            value: formatNumber(paidInFullCount),
            source: { source: "Derived", field: "People whose total Balance = 0 AND Cash Collected > 0" },
            hint: `${enrollmentsCount ? ((paidInFullCount / enrollmentsCount) * 100).toFixed(0) : 0}% of enrollments`,
            onClick: () =>
              openDrilldown(
                "Paid-in-Full Enrollments",
                undefined,
                filtered.filter((r) => (r.balance ?? 0) <= 0 && (r.cashCollected ?? 0) > 0)
              ),
          },
          {
            label: "On Payment Plan",
            value: formatNumber(onPlanCount),
            source: { source: "Derived", field: "People whose total Balance > 0" },
            hint: `${enrollmentsCount ? ((onPlanCount / enrollmentsCount) * 100).toFixed(0) : 0}% of enrollments`,
            onClick: () => openDrilldown("On Payment Plan", undefined, filtered.filter((r) => (r.balance ?? 0) > 0)),
          },
          {
            label: "Unpaid",
            value: formatNumber(unpaidCount),
            source: { source: "Derived", field: "Balance > 0 AND Cash Collected = 0" },
            higherIsBetter: false,
            onClick: () =>
              openDrilldown(
                "Unpaid Enrollments",
                "No cash collected yet",
                filtered.filter((r) => (r.balance ?? 0) > 0 && (r.cashCollected ?? 0) === 0)
              ),
          },
        ]}
      />

      <div className="chart-grid">
        <TimeSeriesChart
          title="Cash Collected Over Time"
          points={filtered.map((r) => ({ date: r.enrollmentDate || r.createdDate || null, value: r.cashCollected ?? 0 }))}
          color="#45d093"
          valueFormatter={(v) => formatMoney(v)}
        />
        <BreakdownChart
          title="Cash Collected by Cohort"
          items={cohorts.map((c) => ({ key: c, value: sum(filtered.filter((r) => r.cohort === c).map((r) => r.cashCollected)) }))}
          valueFormatter={(v) => formatMoney(v)}
        />
      </div>

      {/* Per-coach breakdown — includes a "No EM" bar for rows with no coach */}
      <div className="chart-grid">
        <CloserBars
          title="Enrolled Clients by Coach"
          items={[
            ...managers.map((m) => ({ name: m, value: countPeople(filtered.filter((r) => r.enrManager === m)) })),
            { name: "No EM", value: countPeople(filtered.filter((r) => !(r.enrManager && r.enrManager.trim()))) },
          ]}
        />
        <CloserBars
          title="Cash Collected by Coach"
          items={[
            ...managers.map((m) => ({ name: m, value: sum(filtered.filter((r) => r.enrManager === m).map((r) => r.cashCollected)) })),
            { name: "No EM", value: sum(filtered.filter((r) => !(r.enrManager && r.enrManager.trim())).map((r) => r.cashCollected)) },
          ]}
          valueFormatter={(v) => formatMoney(v)}
        />
      </div>

      <div style={{ marginBottom: 20 }}>
        <CloserBars
          title="Revenue Booked by Coach"
          items={[
            ...managers.map((m) => ({ name: m, value: sum(filtered.filter((r) => r.enrManager === m).map((r) => r.revenue)) })),
            { name: "No EM", value: sum(filtered.filter((r) => !(r.enrManager && r.enrManager.trim())).map((r) => r.revenue)) },
          ]}
          valueFormatter={(v) => formatMoney(v)}
        />
      </div>

      {/* Cohort economics */}
      {cohortEconomics.length > 0 && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-header">
            <div className="panel-title">Cohort Economics {prevFiltered ? "(vs previous equivalent period)" : ""}</div>
            <span style={{ color: "var(--muted)", fontSize: 11 }}>Click a cohort to see its enrollments</span>
          </div>
          <table className="leaderboard">
            <thead>
              <tr>
                <th>Cohort</th>
                <th>Enrollments</th>
                <th>Revenue</th>
                <th>Cash Collected</th>
                <th>Collection %</th>
                <th>Avg Deal</th>
                <th>PIF / Plan</th>
                {prevFiltered && <th>Cash vs Prev</th>}
              </tr>
            </thead>
            <tbody>
              {cohortEconomics.map((c) => (
                <tr
                  key={c.cohort}
                  onClick={() =>
                    openDrilldown(`Cohort: ${c.cohort}`, `${c.enrollments} enrollments · ${formatMoney(c.cashCollected)} collected`, c.rows)
                  }
                  style={{ cursor: "pointer" }}
                >
                  <td style={{ color: "var(--text)", fontWeight: 500 }}>{c.cohort} →</td>
                  <td className="mono">{formatNumber(c.enrollments)}</td>
                  <td className="mono">{formatMoney(c.revenue)}</td>
                  <td className="mono">{formatMoney(c.cashCollected)}</td>
                  <td className="mono" style={{ color: c.collectionRate !== null && c.collectionRate >= 0.9 ? "var(--green)" : "var(--text)" }}>
                    {formatPercent(c.collectionRate)}
                  </td>
                  <td className="mono">{formatMoney(c.avgDeal)}</td>
                  <td className="mono" style={{ fontSize: 11 }}>
                    {c.paidOff} / {c.onPlan}
                  </td>
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

      {/* "View all records" footer strip instead of always-visible row table */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: 12,
          padding: "14px 18px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ color: "var(--muted)", fontSize: 12 }}>
          <strong style={{ color: "var(--text)" }}>{formatNumber(enrollmentsCount)}</strong> unique buyers
          {" · "}
          <strong style={{ color: "var(--text)" }}>{formatNumber(filtered.length)}</strong> rows match current filters
        </div>
        <button className="link-btn" onClick={() => openDrilldown("All Filtered Enrollments", undefined, filtered)}>
          View records →
        </button>
      </div>

      <DrillDownModal
        open={!!drilldown}
        onClose={() => setDrilldown(null)}
        title={drilldown?.title || ""}
        subtitle={drilldown ? drilldown.subtitle || `${drilldown.rows.length} enrollments` : ""}
      >
        <DataTable
          columns={columns}
          rows={drilldown?.rows || []}
          rowKey={(r) => r.id}
          isTestRow={(r) => r.isTest}
          searchable
          searchPlaceholder="Search name, email, cohort, closer, coupon…"
        />
      </DrillDownModal>
    </div>
  );
}
