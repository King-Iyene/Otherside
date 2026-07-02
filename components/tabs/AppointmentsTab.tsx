"use client";

import { useMemo, useState } from "react";
import type { AppointmentRow } from "@/lib/types";
import { resolveRange, inRange, type RangePreset } from "@/lib/dates";
import { uniqueSorted, matchesSearch } from "@/lib/filtering";
import { previousPeriod, computeDelta } from "@/lib/comparison";
import { formatNumber, formatPercent } from "@/lib/money";
import Controls from "../Controls";
import KpiGrid from "../Kpi";
import TimeSeriesChart from "../TimeSeriesChart";
import BreakdownChart from "../BreakdownChart";
import DataTable, { type Column } from "../DataTable";
import { DateCell } from "../MoneyCell";
import DrillDownModal from "../DrillDownModal";

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
  const [drilldown, setDrilldown] = useState<{ title: string; subtitle?: string; rows: AppointmentRow[] } | null>(null);

  const statuses = useMemo(() => uniqueSorted(rows.map((r) => r.status)), [rows]);
  const types = useMemo(() => uniqueSorted(rows.map((r) => r.appointmentType)), [rows]);
  const cohorts = useMemo(() => uniqueSorted(rows.map((r) => r.cohort)), [rows]);
  const managers = useMemo(() => uniqueSorted(rows.map((r) => r.enrManager)), [rows]);

  const dimensionMatch = (r: AppointmentRow) => {
    if (status && r.status !== status) return false;
    if (type && r.appointmentType !== type) return false;
    if (cohort && r.cohort !== cohort) return false;
    if (enrManager && r.enrManager !== enrManager) return false;
    if (!matchesSearch([r.name, r.email, r.phone, r.notes], search)) return false;
    return true;
  };

  const { from, to } = resolveRange(preset, customFrom, customTo);

  const filtered = useMemo(() => {
    return rows.filter((r) => (includeTest || !r.isTest) && inRange(r.appointmentTime, from, to) && dimensionMatch(r));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, from, to, status, type, cohort, enrManager, search, includeTest]);

  const prevRange = previousPeriod(from, to);
  const prevFiltered = useMemo(() => {
    if (!prevRange) return null;
    return rows.filter(
      (r) => (includeTest || !r.isTest) && inRange(r.appointmentTime, prevRange.from, prevRange.to) && dimensionMatch(r)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, prevRange, status, type, cohort, enrManager, search, includeTest]);

  const showedCount = filtered.filter((r) => r.status && SHOWED_STATUSES.has(r.status)).length;
  const noShowCount = filtered.filter((r) => r.status === "No show").length;
  const cancelledCount = filtered.filter((r) => r.status === "Cancelled").length;
  const showRate = filtered.length ? showedCount / filtered.length : null;

  const prevKpis = prevFiltered
    ? {
        total: prevFiltered.length,
        showed: prevFiltered.filter((r) => r.status && SHOWED_STATUSES.has(r.status)).length,
        noShow: prevFiltered.filter((r) => r.status === "No show").length,
        cancelled: prevFiltered.filter((r) => r.status === "Cancelled").length,
      }
    : null;
  const prevShowRate = prevKpis && prevKpis.total ? prevKpis.showed / prevKpis.total : null;

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
          {
            label: "Total Appointments",
            value: formatNumber(filtered.length),
            delta: prevKpis && computeDelta(filtered.length, prevKpis.total),
            source: { source: "Appointments Tracker (Notion)", field: "COUNT", formula: "Rows where Appointment Time in period" },
            onClick: () => setDrilldown({ title: "All Appointments", rows: filtered }),
          },
          {
            label: "Showed",
            value: formatNumber(showedCount),
            delta: prevKpis && computeDelta(showedCount, prevKpis.showed),
            source: { source: "Appointments Tracker (Notion)", field: "Appointment Status", formula: "Status ∈ {Showed, Client Won, Finisher}" },
            onClick: () =>
              setDrilldown({
                title: "Showed Appointments",
                subtitle: "Status = Showed / Client Won / Finisher",
                rows: filtered.filter((r) => r.status && SHOWED_STATUSES.has(r.status)),
              }),
          },
          {
            label: "Show Rate",
            value: formatPercent(showRate),
            delta: prevShowRate !== null && showRate !== null ? computeDelta(showRate, prevShowRate) : null,
            source: { source: "Derived", field: "Showed ÷ Total Appointments" },
          },
          {
            label: "No Shows",
            value: formatNumber(noShowCount),
            delta: prevKpis && computeDelta(noShowCount, prevKpis.noShow),
            higherIsBetter: false,
            source: { source: "Appointments Tracker (Notion)", field: "Appointment Status = No show" },
            onClick: () => setDrilldown({ title: "No-Show Appointments", rows: filtered.filter((r) => r.status === "No show") }),
          },
          {
            label: "Cancelled",
            value: formatNumber(cancelledCount),
            delta: prevKpis && computeDelta(cancelledCount, prevKpis.cancelled),
            higherIsBetter: false,
            source: { source: "Appointments Tracker (Notion)", field: "Appointment Status = Cancelled" },
            onClick: () => setDrilldown({ title: "Cancelled Appointments", rows: filtered.filter((r) => r.status === "Cancelled") }),
          },
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

      {/* Status breakdown as clickable rows */}
      {statuses.length > 0 && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-header">
            <div className="panel-title">Status Breakdown</div>
            <span style={{ color: "var(--muted)", fontSize: 11 }}>Click a status to see those appointments</span>
          </div>
          <table className="leaderboard">
            <thead>
              <tr>
                <th>Status</th>
                <th>Count</th>
                <th>% of Total</th>
              </tr>
            </thead>
            <tbody>
              {statuses
                .map((s) => ({ status: s, count: filtered.filter((r) => r.status === s).length }))
                .sort((a, b) => b.count - a.count)
                .map(({ status: s, count }) => (
                  <tr
                    key={s}
                    onClick={() => setDrilldown({ title: `Appointments — ${s}`, rows: filtered.filter((r) => r.status === s) })}
                    style={{ cursor: "pointer" }}
                  >
                    <td style={{ fontWeight: 500 }}>{s} →</td>
                    <td className="mono">{formatNumber(count)}</td>
                    <td className="mono">{formatPercent(filtered.length ? count / filtered.length : null)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

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
          <strong style={{ color: "var(--text)" }}>{formatNumber(filtered.length)}</strong> appointments match current filters
        </div>
        <button className="link-btn" onClick={() => setDrilldown({ title: "All Filtered Appointments", rows: filtered })}>
          View records →
        </button>
      </div>

      <DrillDownModal
        open={!!drilldown}
        onClose={() => setDrilldown(null)}
        title={drilldown?.title || ""}
        subtitle={drilldown ? drilldown.subtitle || `${drilldown.rows.length} appointments` : ""}
      >
        <DataTable columns={columns} rows={drilldown?.rows || []} rowKey={(r) => r.id} isTestRow={(r) => r.isTest} />
      </DrillDownModal>
    </div>
  );
}
