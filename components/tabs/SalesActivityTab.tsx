"use client";

import { useMemo, useState } from "react";
import type { SalesActivityRow } from "@/lib/types";
import { resolveRange, inRange, type RangePreset } from "@/lib/dates";
import { uniqueSorted, matchesSearch, sum } from "@/lib/filtering";
import { computeRates } from "@/lib/sources/salesActivity";
import { formatMoney, formatNumber, formatPercent } from "@/lib/money";
import Controls from "../Controls";
import KpiGrid from "../Kpi";
import TimeSeriesChart from "../TimeSeriesChart";
import BreakdownChart from "../BreakdownChart";
import DataTable, { type Column } from "../DataTable";
import { DateCell } from "../MoneyCell";
import MoneyCell from "../MoneyCell";

export default function SalesActivityTab({ rows }: { rows: SalesActivityRow[] }) {
  const [preset, setPreset] = useState<RangePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [launch, setLaunch] = useState("");
  const [enrManager, setEnrManager] = useState("");
  const [search, setSearch] = useState("");
  const [includeTest, setIncludeTest] = useState(false);

  const launches = useMemo(() => uniqueSorted(rows.map((r) => r.launch)), [rows]);
  const managers = useMemo(() => uniqueSorted(rows.map((r) => r.enrManager)), [rows]);

  const filtered = useMemo(() => {
    const { from, to } = resolveRange(preset, customFrom, customTo);
    return rows.filter((r) => {
      if (!includeTest && r.isTest) return false;
      if (!inRange(r.date, from, to)) return false;
      if (launch && r.launch !== launch) return false;
      if (enrManager && r.enrManager !== enrManager) return false;
      if (!matchesSearch([r.entry, r.enrManager, r.launch], search)) return false;
      return true;
    });
  }, [rows, preset, customFrom, customTo, launch, enrManager, search, includeTest]);

  const totals = {
    newCalls: sum(filtered.map((r) => r.newCalls)),
    showed: sum(filtered.map((r) => r.showed)),
    offersMade: sum(filtered.map((r) => r.offersMade)),
    salesMade: sum(filtered.map((r) => r.salesMade)),
  };
  const cashOnCall = sum(filtered.map((r) => r.cashCollectedOnCall));
  const salesRevenue = sum(filtered.map((r) => r.salesRevenue));
  const rates = computeRates(totals);

  const leaderboard = useMemo(() => {
    const byManager = new Map<
      string,
      { newCalls: number; showed: number; offersMade: number; salesMade: number; cashOnCall: number; salesRevenue: number }
    >();
    for (const r of filtered) {
      const key = r.enrManager || "(unassigned)";
      const existing = byManager.get(key) || {
        newCalls: 0,
        showed: 0,
        offersMade: 0,
        salesMade: 0,
        cashOnCall: 0,
        salesRevenue: 0,
      };
      existing.newCalls += r.newCalls ?? 0;
      existing.showed += r.showed ?? 0;
      existing.offersMade += r.offersMade ?? 0;
      existing.salesMade += r.salesMade ?? 0;
      existing.cashOnCall += r.cashCollectedOnCall ?? 0;
      existing.salesRevenue += r.salesRevenue ?? 0;
      byManager.set(key, existing);
    }
    return Array.from(byManager.entries())
      .map(([manager, t]) => ({ manager, ...t, rates: computeRates(t) }))
      .sort((a, b) => b.cashOnCall - a.cashOnCall);
  }, [filtered]);

  const columns: Column<SalesActivityRow>[] = [
    { key: "entry", label: "Entry", render: (r) => r.entry, sortValue: (r) => r.entry },
    { key: "date", label: "Date", render: (r) => <DateCell value={r.date} field="Date" health={r.health} />, sortValue: (r) => r.date },
    { key: "enrManager", label: "Enr Manager", render: (r) => r.enrManager || "—", sortValue: (r) => r.enrManager },
    { key: "launch", label: "Launch", render: (r) => r.launch || "—", sortValue: (r) => r.launch },
    { key: "newCalls", label: "New Calls", render: (r) => formatNumber(r.newCalls), sortValue: (r) => r.newCalls },
    { key: "showed", label: "Showed", render: (r) => formatNumber(r.showed), sortValue: (r) => r.showed },
    { key: "offersMade", label: "Offers", render: (r) => formatNumber(r.offersMade), sortValue: (r) => r.offersMade },
    { key: "salesMade", label: "Sales", render: (r) => formatNumber(r.salesMade), sortValue: (r) => r.salesMade },
    {
      key: "cashCollectedOnCall",
      label: "Cash on Call",
      render: (r) => <MoneyCell value={r.cashCollectedOnCall} field="Cash Collected on Call ($)" health={r.health} />,
      sortValue: (r) => r.cashCollectedOnCall,
    },
    {
      key: "salesRevenue",
      label: "Sales Revenue",
      render: (r) => <MoneyCell value={r.salesRevenue} field="Sales in Revenue ($)" health={r.health} />,
      sortValue: (r) => r.salesRevenue,
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
          { key: "launch", label: "Launch", options: launches, value: launch, onChange: setLaunch },
          { key: "enrManager", label: "Enr Manager", options: managers, value: enrManager, onChange: setEnrManager },
        ]}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search entry, manager…"
        includeTest={includeTest}
        onIncludeTestChange={setIncludeTest}
      />

      <KpiGrid
        items={[
          { label: "New Calls", value: formatNumber(totals.newCalls) },
          { label: "Showed", value: formatNumber(totals.showed) },
          { label: "Sales Made", value: formatNumber(totals.salesMade) },
          { label: "Cash on Call", value: formatMoney(cashOnCall) },
          { label: "Sales Revenue", value: formatMoney(salesRevenue) },
          { label: "Show %", value: formatPercent(rates.showPct) },
          { label: "Offer %", value: formatPercent(rates.offerPct) },
          { label: "Close % (Shows)", value: formatPercent(rates.closePctShows) },
          { label: "Close % (Offers)", value: formatPercent(rates.closePctOffers) },
        ]}
      />

      <div className="chart-grid">
        <TimeSeriesChart
          title="Cash Collected on Call Over Time"
          points={filtered.map((r) => ({ date: r.date, value: r.cashCollectedOnCall ?? 0 }))}
          color="#45d093"
          valueFormatter={(v) => formatMoney(v)}
        />
        <BreakdownChart
          title="Cash on Call by Launch"
          items={launches.map((l) => ({ key: l, value: sum(filtered.filter((r) => r.launch === l).map((r) => r.cashCollectedOnCall)) }))}
          valueFormatter={(v) => formatMoney(v)}
        />
      </div>

      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-header">
          <div className="panel-title">Leaderboard — Cash on Call (period-scoped)</div>
        </div>
        {leaderboard.length === 0 ? (
          <div className="empty-state">No sales activity in range.</div>
        ) : (
          <table className="leaderboard">
            <thead>
              <tr>
                <th>#</th>
                <th>Manager</th>
                <th>Cash on Call</th>
                <th>Sales Revenue</th>
                <th>New Calls</th>
                <th>Showed</th>
                <th>Sales</th>
                <th>Show %</th>
                <th>Close % (Shows)</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((row, idx) => (
                <tr key={row.manager}>
                  <td>
                    <span className="rank-pill">{idx + 1}</span>
                  </td>
                  <td>{row.manager}</td>
                  <td className="mono">{formatMoney(row.cashOnCall)}</td>
                  <td className="mono">{formatMoney(row.salesRevenue)}</td>
                  <td className="mono">{formatNumber(row.newCalls)}</td>
                  <td className="mono">{formatNumber(row.showed)}</td>
                  <td className="mono">{formatNumber(row.salesMade)}</td>
                  <td className="mono">{formatPercent(row.rates.showPct)}</td>
                  <td className="mono">{formatPercent(row.rates.closePctShows)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <DataTable columns={columns} rows={filtered} rowKey={(r) => r.id} />
    </div>
  );
}
