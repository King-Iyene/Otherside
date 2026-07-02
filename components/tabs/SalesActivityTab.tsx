"use client";

import { useMemo, useState } from "react";
import type { SalesActivityRow } from "@/lib/types";
import { resolveRange, inRange, type RangePreset } from "@/lib/dates";
import { uniqueSorted, matchesSearch, sum } from "@/lib/filtering";
import { computeRates } from "@/lib/sources/salesActivity";
import { previousPeriod, computeDelta } from "@/lib/comparison";
import { formatMoney, formatNumber, formatPercent } from "@/lib/money";
import Controls from "../Controls";
import KpiGrid from "../Kpi";
import TimeSeriesChart from "../TimeSeriesChart";
import BreakdownChart from "../BreakdownChart";
import ComboChart from "../ComboChart";
import DataTable, { type Column } from "../DataTable";
import { DateCell } from "../MoneyCell";
import MoneyCell from "../MoneyCell";
import Link from "next/link";

function totalsOf(rows: SalesActivityRow[]) {
  return {
    newCalls: sum(rows.map((r) => r.newCalls)),
    showed: sum(rows.map((r) => r.showed)),
    offersMade: sum(rows.map((r) => r.offersMade)),
    salesMade: sum(rows.map((r) => r.salesMade)),
    cashOnCall: sum(rows.map((r) => r.cashCollectedOnCall)),
    salesRevenue: sum(rows.map((r) => r.salesRevenue)),
  };
}

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

  const dimensionMatch = (r: SalesActivityRow) => {
    if (launch && r.launch !== launch) return false;
    if (enrManager && r.enrManager !== enrManager) return false;
    if (!matchesSearch([r.entry, r.enrManager, r.launch], search)) return false;
    return true;
  };

  const { from, to } = resolveRange(preset, customFrom, customTo);

  const filtered = useMemo(() => {
    return rows.filter((r) => (includeTest || !r.isTest) && inRange(r.date, from, to) && dimensionMatch(r));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, from, to, launch, enrManager, search, includeTest]);

  const prevRange = previousPeriod(from, to);
  const prevFiltered = useMemo(() => {
    if (!prevRange) return null;
    return rows.filter((r) => (includeTest || !r.isTest) && inRange(r.date, prevRange.from, prevRange.to) && dimensionMatch(r));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, prevRange, launch, enrManager, search, includeTest]);

  const totals = totalsOf(filtered);
  const rates = computeRates(totals);
  const prevTotals = prevFiltered ? totalsOf(prevFiltered) : null;
  const prevRates = prevTotals ? computeRates(prevTotals) : null;

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

  const launchComparison = useMemo(() => {
    return launches
      .map((l) => {
        const curRows = filtered.filter((r) => r.launch === l);
        const prevRows = prevFiltered ? prevFiltered.filter((r) => r.launch === l) : [];
        const curTotals = totalsOf(curRows);
        const prevLaunchTotals = totalsOf(prevRows);
        const curRates = computeRates(curTotals);
        return {
          launch: l,
          ...curTotals,
          rates: curRates,
          cashDelta: prevFiltered ? computeDelta(curTotals.cashOnCall, prevLaunchTotals.cashOnCall) : null,
          closeDelta:
            prevFiltered && curRates.closePctShows !== null
              ? computeDelta(curRates.closePctShows, computeRates(prevLaunchTotals).closePctShows ?? 0)
              : null,
        };
      })
      .filter((l) => l.newCalls + l.showed + l.salesMade > 0)
      .sort((a, b) => b.cashOnCall - a.cashOnCall);
  }, [launches, filtered, prevFiltered]);

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
          { label: "New Calls", value: formatNumber(totals.newCalls), delta: prevTotals && computeDelta(totals.newCalls, prevTotals.newCalls) },
          { label: "Showed", value: formatNumber(totals.showed), delta: prevTotals && computeDelta(totals.showed, prevTotals.showed) },
          {
            label: "Sales Made",
            value: formatNumber(totals.salesMade),
            delta: prevTotals && computeDelta(totals.salesMade, prevTotals.salesMade),
          },
          {
            label: "Cash on Call",
            value: formatMoney(totals.cashOnCall),
            delta: prevTotals && computeDelta(totals.cashOnCall, prevTotals.cashOnCall),
          },
          {
            label: "Sales Revenue",
            value: formatMoney(totals.salesRevenue),
            delta: prevTotals && computeDelta(totals.salesRevenue, prevTotals.salesRevenue),
          },
          {
            label: "Show %",
            value: formatPercent(rates.showPct),
            delta: prevRates?.showPct != null && rates.showPct != null ? computeDelta(rates.showPct, prevRates.showPct) : null,
          },
          {
            label: "Offer %",
            value: formatPercent(rates.offerPct),
            delta: prevRates?.offerPct != null && rates.offerPct != null ? computeDelta(rates.offerPct, prevRates.offerPct) : null,
          },
          {
            label: "Close % (Shows)",
            value: formatPercent(rates.closePctShows),
            delta:
              prevRates?.closePctShows != null && rates.closePctShows != null
                ? computeDelta(rates.closePctShows, prevRates.closePctShows)
                : null,
          },
          {
            label: "Close % (Offers)",
            value: formatPercent(rates.closePctOffers),
            delta:
              prevRates?.closePctOffers != null && rates.closePctOffers != null
                ? computeDelta(rates.closePctOffers, prevRates.closePctOffers)
                : null,
          },
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

      <div style={{ marginBottom: 20 }}>
        <ComboChart
          title="Offers Made vs Sales Closed (with Close Rate)"
          points={filtered.map((r) => ({ date: r.date, offers: r.offersMade ?? 0, sales: r.salesMade ?? 0 }))}
        />
      </div>

      {launchComparison.length > 0 && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-header">
            <div className="panel-title">Launch Performance {prevFiltered ? "(vs. previous equivalent period)" : ""}</div>
          </div>
          <table className="leaderboard">
            <thead>
              <tr>
                <th>Launch</th>
                <th>New Calls</th>
                <th>Showed</th>
                <th>Offers</th>
                <th>Sales</th>
                <th>Cash on Call</th>
                <th>Close % (Shows)</th>
                {prevFiltered && <th>Cash vs Prev</th>}
                {prevFiltered && <th>Close % vs Prev</th>}
              </tr>
            </thead>
            <tbody>
              {launchComparison.map((l) => (
                <tr key={l.launch}>
                  <td>{l.launch}</td>
                  <td className="mono">{formatNumber(l.newCalls)}</td>
                  <td className="mono">{formatNumber(l.showed)}</td>
                  <td className="mono">{formatNumber(l.offersMade)}</td>
                  <td className="mono">{formatNumber(l.salesMade)}</td>
                  <td className="mono">{formatMoney(l.cashOnCall)}</td>
                  <td className="mono">{formatPercent(l.rates.closePctShows)}</td>
                  {prevFiltered && (
                    <td className="mono">
                      {l.cashDelta?.pct === null || l.cashDelta === null
                        ? "n/a"
                        : `${l.cashDelta.pct >= 0 ? "▲" : "▼"} ${formatPercent(Math.abs(l.cashDelta.pct))}`}
                    </td>
                  )}
                  {prevFiltered && (
                    <td className="mono">
                      {l.closeDelta?.pct === null || l.closeDelta === null
                        ? "n/a"
                        : `${l.closeDelta.pct >= 0 ? "▲" : "▼"} ${formatPercent(Math.abs(l.closeDelta.pct))}`}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-header">
          <div className="panel-title">Leaderboard — Cash on Call (period-scoped)</div>
          <span style={{ color: "var(--muted)", fontSize: 11 }}>Click a name for full scorecard</span>
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
                  <td>
                    {row.manager === "(unassigned)" ? (
                      row.manager
                    ) : (
                      <Link
                        href={`/closer/${encodeURIComponent(row.manager)}`}
                        style={{ color: "var(--text)", textDecoration: "none", fontWeight: 500 }}
                      >
                        {row.manager} →
                      </Link>
                    )}
                  </td>
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
