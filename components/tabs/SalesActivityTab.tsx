"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { SalesActivityRow } from "@/lib/types";
import { resolveRange, inRange, type RangePreset } from "@/lib/dates";
import { uniqueSorted, matchesSearch, sum } from "@/lib/filtering";
import { computeRates } from "@/lib/sources/salesActivity";
import { previousPeriod, computeDelta } from "@/lib/comparison";
import { formatMoney, formatNumber, formatPercent } from "@/lib/money";
import Controls from "../Controls";
import KpiGrid from "../Kpi";
import TimeSeriesChart from "../TimeSeriesChart";
import ComboChart from "../ComboChart";
import CloserBars from "../CloserBars";
import DataTable, { type Column } from "../DataTable";
import { DateCell } from "../MoneyCell";
import MoneyCell from "../MoneyCell";
import DrillDownModal from "../DrillDownModal";

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
  const [preset, setPreset] = useState<RangePreset>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [launch, setLaunch] = useState("");
  const [enrManager, setEnrManager] = useState("");
  const [search, setSearch] = useState("");
  const [includeTest, setIncludeTest] = useState(false);
  const [drilldown, setDrilldown] = useState<{ title: string; subtitle?: string; rows: SalesActivityRow[] } | null>(null);

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

  // Per-closer breakdown with FULL funnel (Booked→Showed→Offered→Sold, count AND %)
  const perCloser = useMemo(() => {
    const byManager = new Map<
      string,
      {
        newCalls: number;
        showed: number;
        offersMade: number;
        salesMade: number;
        cashOnCall: number;
        salesRevenue: number;
        rows: SalesActivityRow[];
      }
    >();
    for (const r of filtered) {
      const key = r.enrManager || "No EM assigned";
      const existing = byManager.get(key) || {
        newCalls: 0,
        showed: 0,
        offersMade: 0,
        salesMade: 0,
        cashOnCall: 0,
        salesRevenue: 0,
        rows: [],
      };
      existing.newCalls += r.newCalls ?? 0;
      existing.showed += r.showed ?? 0;
      existing.offersMade += r.offersMade ?? 0;
      existing.salesMade += r.salesMade ?? 0;
      existing.cashOnCall += r.cashCollectedOnCall ?? 0;
      existing.salesRevenue += r.salesRevenue ?? 0;
      existing.rows.push(r);
      byManager.set(key, existing);
    }
    return Array.from(byManager.entries())
      .map(([manager, t]) => ({
        manager,
        ...t,
        rates: computeRates(t),
      }))
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
          {
            label: "New Calls",
            value: formatNumber(totals.newCalls),
            delta: prevTotals && computeDelta(totals.newCalls, prevTotals.newCalls),
            source: { source: "Sales Activity Tracker (Notion)", field: "New Calls in Calendar", formula: "SUM" },
          },
          {
            label: "Showed",
            value: formatNumber(totals.showed),
            delta: prevTotals && computeDelta(totals.showed, prevTotals.showed),
            source: { source: "Sales Activity Tracker (Notion)", field: "Showed to Call", formula: "SUM" },
          },
          {
            label: "Sales Made",
            value: formatNumber(totals.salesMade),
            delta: prevTotals && computeDelta(totals.salesMade, prevTotals.salesMade),
            source: { source: "Sales Activity Tracker (Notion)", field: "Sales Made", formula: "SUM" },
          },
          {
            label: "Cash on Call",
            value: formatMoney(totals.cashOnCall),
            delta: prevTotals && computeDelta(totals.cashOnCall, prevTotals.cashOnCall),
            source: { source: "Sales Activity Tracker (Notion)", field: "Cash Collected on Call ($)", formula: "SUM" },
          },
          {
            label: "Sales Revenue",
            value: formatMoney(totals.salesRevenue),
            delta: prevTotals && computeDelta(totals.salesRevenue, prevTotals.salesRevenue),
            source: { source: "Sales Activity Tracker (Notion)", field: "Sales in Revenue ($)", formula: "SUM" },
          },
          {
            label: "Show %",
            value: formatPercent(rates.showPct),
            delta: prevRates?.showPct != null && rates.showPct != null ? computeDelta(rates.showPct, prevRates.showPct) : null,
            source: { source: "Derived", field: "Showed ÷ New Calls" },
          },
          {
            label: "Offer %",
            value: formatPercent(rates.offerPct),
            delta: prevRates?.offerPct != null && rates.offerPct != null ? computeDelta(rates.offerPct, prevRates.offerPct) : null,
            source: { source: "Derived", field: "Offers Made ÷ Showed" },
          },
          {
            label: "Close % (Shows)",
            value: formatPercent(rates.closePctShows),
            delta:
              prevRates?.closePctShows != null && rates.closePctShows != null
                ? computeDelta(rates.closePctShows, prevRates.closePctShows)
                : null,
            source: { source: "Derived", field: "Sales Made ÷ Showed" },
          },
        ]}
      />

      {/* Team funnel chart */}
      <div className="chart-grid">
        <TimeSeriesChart
          title="Cash on Call — Over Time"
          points={filtered.map((r) => ({ date: r.date, value: r.cashCollectedOnCall ?? 0 }))}
          color="#45d093"
          valueFormatter={(v) => formatMoney(v)}
        />
        <ComboChart
          title="Offers vs Sales — Team"
          points={filtered.map((r) => ({ date: r.date, offers: r.offersMade ?? 0, sales: r.salesMade ?? 0 }))}
        />
      </div>

      {/* Per-coach bar charts — the closer leaderboard, visualized */}
      {perCloser.length > 0 && (
        <>
          <div className="chart-grid">
            <CloserBars title="Calls by Coach" items={perCloser.map((c) => ({ name: c.manager, value: c.newCalls }))} />
            <CloserBars title="Showed by Coach" items={perCloser.map((c) => ({ name: c.manager, value: c.showed }))} />
          </div>
          <div className="chart-grid">
            <CloserBars title="Offers Made by Coach" items={perCloser.map((c) => ({ name: c.manager, value: c.offersMade }))} />
            <CloserBars title="Sales Made by Coach" items={perCloser.map((c) => ({ name: c.manager, value: c.salesMade }))} />
          </div>
          <div className="chart-grid">
            <CloserBars
              title="Cash on Call by Coach"
              items={perCloser.map((c) => ({ name: c.manager, value: c.cashOnCall }))}
              valueFormatter={(v) => formatMoney(v)}
            />
            <CloserBars
              title="Sales Revenue by Coach"
              items={perCloser.map((c) => ({ name: c.manager, value: c.salesRevenue }))}
              valueFormatter={(v) => formatMoney(v)}
            />
          </div>
        </>
      )}

      {/* Per-Closer Funnel — Oliver's spec */}
      {perCloser.length > 0 && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-header">
            <div className="panel-title">Per-Closer Funnel</div>
            <span style={{ color: "var(--muted)", fontSize: 11 }}>Sorted by Cash on Call · Click a name for full scorecard</span>
          </div>
          <table className="leaderboard">
            <thead>
              <tr>
                <th>#</th>
                <th>Closer</th>
                <th>Booked</th>
                <th>Showed</th>
                <th style={{ color: "var(--muted)" }}>Show %</th>
                <th>Offers</th>
                <th style={{ color: "var(--muted)" }}>Offer %</th>
                <th>Sales</th>
                <th style={{ color: "var(--muted)" }}>Close %</th>
                <th>Cash on Call</th>
                <th>Sales Revenue</th>
              </tr>
            </thead>
            <tbody>
              {perCloser.map((row, idx) => (
                <tr
                  key={row.manager}
                  onClick={() => setDrilldown({ title: `${row.manager} — Daily Entries`, rows: row.rows })}
                  style={{ cursor: "pointer" }}
                >
                  <td>
                    <span className="rank-pill">{idx + 1}</span>
                  </td>
                  <td>
                    {row.manager === "No EM assigned" ? (
                      row.manager
                    ) : (
                      <Link
                        href={`/closer/${encodeURIComponent(row.manager)}`}
                        onClick={(e) => e.stopPropagation()}
                        style={{ color: "var(--text)", textDecoration: "none", fontWeight: 500 }}
                      >
                        {row.manager} →
                      </Link>
                    )}
                  </td>
                  <td className="mono">{formatNumber(row.newCalls)}</td>
                  <td className="mono">{formatNumber(row.showed)}</td>
                  <td className="mono" style={{ color: "var(--muted)" }}>{formatPercent(row.rates.showPct)}</td>
                  <td className="mono">{formatNumber(row.offersMade)}</td>
                  <td className="mono" style={{ color: "var(--muted)" }}>{formatPercent(row.rates.offerPct)}</td>
                  <td className="mono">{formatNumber(row.salesMade)}</td>
                  <td className="mono" style={{ color: "var(--muted)" }}>{formatPercent(row.rates.closePctShows)}</td>
                  <td className="mono">{formatMoney(row.cashOnCall)}</td>
                  <td className="mono">{formatMoney(row.salesRevenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* View records footer strip — replaces the always-visible row table */}
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
          <strong style={{ color: "var(--text)" }}>{formatNumber(filtered.length)}</strong> daily entries match current filters
        </div>
        <button className="link-btn" onClick={() => setDrilldown({ title: "All Daily Entries", rows: filtered })}>
          View records →
        </button>
      </div>

      <DrillDownModal
        open={!!drilldown}
        onClose={() => setDrilldown(null)}
        title={drilldown?.title || ""}
        subtitle={drilldown ? drilldown.subtitle || `${drilldown.rows.length} daily entries` : ""}
      >
        <DataTable
          columns={columns}
          rows={drilldown?.rows || []}
          rowKey={(r) => r.id}
          searchable
          searchPlaceholder="Search entry, date, closer, launch…"
        />
      </DrillDownModal>
    </div>
  );
}
