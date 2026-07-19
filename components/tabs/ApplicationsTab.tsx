"use client";

import { useMemo, useState } from "react";
import type { ApplicationRow } from "@/lib/types";
import { resolveRange, inRange, type RangePreset } from "@/lib/dates";
import { uniqueSorted, matchesSearch, selected } from "@/lib/filtering";
import { previousPeriod, computeDelta } from "@/lib/comparison";
import { formatNumber, formatPercent } from "@/lib/money";
import Controls from "../Controls";
import KpiGrid from "../Kpi";
import TimeSeriesChart from "../TimeSeriesChart";
import BreakdownChart from "../BreakdownChart";
import DonutChart from "../DonutChart";
import FunnelBars from "../FunnelBars";
import DataTable, { type Column } from "../DataTable";
import { DateCell } from "../MoneyCell";
import DrillDownModal from "../DrillDownModal";
import GhlName from "../GhlLink";

export default function ApplicationsTab({ rows, hideOpsUI }: { rows: ApplicationRow[]; hideOpsUI?: boolean }) {
  const [preset, setPreset] = useState<RangePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [status, setStatus] = useState<string[]>([]);
  const [earnings, setEarnings] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [includeTest, setIncludeTest] = useState(false);
  const [drilldown, setDrilldown] = useState<{ title: string; subtitle?: string; rows: ApplicationRow[] } | null>(null);

  const statuses = useMemo(() => uniqueSorted(rows.map((r) => r.applicationStatus)), [rows]);
  const earningsOptions = useMemo(() => uniqueSorted(rows.map((r) => r.annualEarnings)), [rows]);

  const dimensionMatch = (r: ApplicationRow) => {
    if (!selected(status, r.applicationStatus)) return false;
    if (!selected(earnings, r.annualEarnings)) return false;
    if (!matchesSearch([r.firstName, r.lastName, r.email, r.phone], search)) return false;
    return true;
  };

  const { from, to } = resolveRange(preset, customFrom, customTo);

  const filtered = useMemo(() => {
    return rows.filter((r) => (includeTest || !r.isTest) && inRange(r.dateCreated, from, to) && dimensionMatch(r));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, from, to, status, earnings, search, includeTest]);

  const prevRange = previousPeriod(from, to);
  const prevFiltered = useMemo(() => {
    if (!prevRange) return null;
    return rows.filter(
      (r) => (includeTest || !r.isTest) && inRange(r.dateCreated, prevRange.from, prevRange.to) && dimensionMatch(r)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, prevRange, status, earnings, search, includeTest]);

  const purchasedCount = filtered.filter((r) => r.purchased).length;
  const conversionRate = filtered.length ? purchasedCount / filtered.length : null;

  const prevPurchased = prevFiltered ? prevFiltered.filter((r) => r.purchased).length : null;
  const prevConversionRate = prevFiltered && prevFiltered.length ? (prevPurchased as number) / prevFiltered.length : null;

  const earningsComparison = useMemo(() => {
    return earningsOptions
      .map((e) => {
        const curRows = filtered.filter((r) => r.annualEarnings === e);
        const prevRows = prevFiltered ? prevFiltered.filter((r) => r.annualEarnings === e) : [];
        const curPurchased = curRows.filter((r) => r.purchased).length;
        const prevPurchasedCount = prevRows.filter((r) => r.purchased).length;
        return {
          bucket: e,
          applications: curRows.length,
          purchased: curPurchased,
          conversion: curRows.length ? curPurchased / curRows.length : null,
          delta: prevFiltered ? computeDelta(curRows.length, prevRows.length) : null,
          conversionDelta:
            prevFiltered && prevRows.length && curRows.length
              ? computeDelta(curPurchased / curRows.length, prevPurchasedCount / prevRows.length)
              : null,
        };
      })
      .filter((e) => e.applications > 0)
      .sort((a, b) => b.applications - a.applications);
  }, [earningsOptions, filtered, prevFiltered]);

  const columns: Column<ApplicationRow>[] = [
    { key: "firstName", label: "First Name", render: (r) => <GhlName name={r.firstName} ghlUrl={r.ghlUrl} />, sortValue: (r) => r.firstName },
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
        hideOpsUI={hideOpsUI}
      />

      <KpiGrid
        items={[
          {
            label: "Applications",
            value: formatNumber(filtered.length),
            delta: prevFiltered && computeDelta(filtered.length, prevFiltered.length),
            source: { source: "REBORN Application Tracker (Notion)", field: "COUNT", formula: "Rows where Date Created in period" },
            onClick: () => setDrilldown({ title: "All Applications", rows: filtered }),
          },
          {
            label: "Purchased",
            value: formatNumber(purchasedCount),
            delta: prevPurchased !== null ? computeDelta(purchasedCount, prevPurchased) : null,
            source: { source: "REBORN Application Tracker (Notion)", field: "REBORN Payments Tracker relation", formula: "Non-empty relation" },
            onClick: () => setDrilldown({ title: "Purchased Applications", rows: filtered.filter((r) => r.purchased) }),
          },
          {
            label: "Conversion Rate",
            value: formatPercent(conversionRate),
            delta:
              conversionRate !== null && prevConversionRate !== null
                ? computeDelta(conversionRate, prevConversionRate)
                : null,
            source: { source: "Derived", field: "Purchased ÷ Total Applications" },
          },
        ]}
      />

      {/* ── Application Funnel ── */}
      <FunnelBars
        title="Application Funnel"
        stages={[
          { label: "Applications", value: filtered.length },
          { label: "Purchased", value: purchasedCount },
        ]}
        onStageClick={(label) => {
          if (label === "Applications") setDrilldown({ title: "All Applications", rows: filtered });
          else if (label === "Purchased") setDrilldown({ title: "Purchased Applications", rows: filtered.filter((r) => r.purchased) });
        }}
      />

      <div className="chart-grid">
        <TimeSeriesChart
          title="Applications Over Time"
          points={filtered.map((r) => ({ date: r.dateCreated, value: 1 }))}
          color="#f2b63c"
        />
        <DonutChart
          title="Application Status"
          items={statuses.map((s) => ({ key: s, value: filtered.filter((r) => r.applicationStatus === s).length }))}
          onSelect={(key) =>
            setDrilldown({ title: `Status: ${key}`, rows: filtered.filter((r) => r.applicationStatus === key) })
          }
        />
      </div>

      <div className="chart-grid">
        <DonutChart
          title="Annual Earnings Distribution"
          items={earningsOptions.map((e) => ({ key: e || "(not set)", value: filtered.filter((r) => r.annualEarnings === e).length }))}
          onSelect={(key) => {
            const k = key === "(not set)" ? null : key;
            setDrilldown({ title: `Earnings: ${key}`, rows: filtered.filter((r) => (r.annualEarnings || "(not set)") === key || r.annualEarnings === k) });
          }}
        />
        <BreakdownChart
          title="Applications by Earnings (Bar)"
          items={earningsOptions.map((e) => ({ key: e, value: filtered.filter((r) => r.annualEarnings === e).length }))}
          onSelect={(key) =>
            setDrilldown({ title: `Earnings: ${key}`, rows: filtered.filter((r) => r.annualEarnings === key) })
          }
        />
      </div>

      {earningsComparison.length > 0 && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-header">
            <div className="panel-title">Earnings Bracket Performance {prevFiltered ? "(vs. previous equivalent period)" : ""}</div>
          </div>
          <table className="leaderboard">
            <thead>
              <tr>
                <th>Bracket</th>
                <th>Applications</th>
                <th>Purchased</th>
                <th>Conversion</th>
                {prevFiltered && <th>Volume vs Prev</th>}
                {prevFiltered && <th>Conversion vs Prev</th>}
              </tr>
            </thead>
            <tbody>
              {earningsComparison.map((e) => (
                <tr
                  key={e.bucket}
                  onClick={() => setDrilldown({ title: `Bracket: ${e.bucket}`, rows: filtered.filter((r) => r.annualEarnings === e.bucket) })}
                  style={{ cursor: "pointer" }}
                >
                  <td style={{ fontWeight: 500 }}>{e.bucket} →</td>
                  <td className="mono">{formatNumber(e.applications)}</td>
                  <td className="mono">{formatNumber(e.purchased)}</td>
                  <td className="mono">{formatPercent(e.conversion)}</td>
                  {prevFiltered && (
                    <td className="mono">
                      {e.delta?.pct === null || e.delta === null ? "n/a" : `${e.delta.pct >= 0 ? "▲" : "▼"} ${formatPercent(Math.abs(e.delta.pct))}`}
                    </td>
                  )}
                  {prevFiltered && (
                    <td className="mono">
                      {e.conversionDelta?.pct === null || e.conversionDelta === null
                        ? "n/a"
                        : `${e.conversionDelta.pct >= 0 ? "▲" : "▼"} ${formatPercent(Math.abs(e.conversionDelta.pct))}`}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!hideOpsUI && (
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
          <strong style={{ color: "var(--text)" }}>{formatNumber(filtered.length)}</strong> applications match current filters
        </div>
        <button className="link-btn" onClick={() => setDrilldown({ title: "All Filtered Applications", rows: filtered })}>
          View records →
        </button>
      </div>
      )}

      <DrillDownModal
        open={!!drilldown}
        onClose={() => setDrilldown(null)}
        title={drilldown?.title || ""}
        subtitle={drilldown ? drilldown.subtitle || `${drilldown.rows.length} applications` : ""}
      >
        <DataTable
          columns={columns}
          rows={drilldown?.rows || []}
          rowKey={(r) => r.id}
          isTestRow={(r) => r.isTest}
          searchable
          searchPlaceholder="Search name, email, phone, status, income bracket…"
        />
      </DrillDownModal>
    </div>
  );
}
