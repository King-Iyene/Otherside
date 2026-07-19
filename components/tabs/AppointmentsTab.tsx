"use client";

import { useMemo, useState } from "react";
import type { AppointmentRow } from "@/lib/types";
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
import CloserBars from "../CloserBars";
import DataTable, { type Column } from "../DataTable";
import { DateCell } from "../MoneyCell";
import DrillDownModal from "../DrillDownModal";

const SHOWED_STATUSES = new Set(["Showed", "Client Won", "Finisher"]);

export default function AppointmentsTab({ rows, hideOpsUI }: { rows: AppointmentRow[]; hideOpsUI?: boolean }) {
  const [preset, setPreset] = useState<RangePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [status, setStatus] = useState<string[]>([]);
  const [type, setType] = useState<string[]>([]);
  const [cohort, setCohort] = useState<string[]>([]);
  const [enrManager, setEnrManager] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [includeTest, setIncludeTest] = useState(false);
  const [drilldown, setDrilldown] = useState<{ title: string; subtitle?: string; rows: AppointmentRow[] } | null>(null);

  const statuses = useMemo(() => uniqueSorted(rows.map((r) => r.status)), [rows]);
  const types = useMemo(() => uniqueSorted(rows.map((r) => r.appointmentType)), [rows]);
  const cohorts = useMemo(() => uniqueSorted(rows.map((r) => r.cohort)), [rows]);
  const managers = useMemo(() => uniqueSorted(rows.map((r) => r.enrManager)), [rows]);

  const dimensionMatch = (r: AppointmentRow) => {
    if (!selected(status, r.status)) return false;
    if (!selected(type, r.appointmentType)) return false;
    if (!selected(cohort, r.cohort)) return false;
    if (!selected(enrManager, r.enrManager)) return false;
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
    { key: "enrManager", label: "Closer", render: (r) => r.enrManager || "—", sortValue: (r) => r.enrManager },
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
          { key: "enrManager", label: "Closer", options: managers, value: enrManager, onChange: setEnrManager },
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

      {/* ── Appointment Funnel ── */}
      <FunnelBars
        title="Appointment Funnel"
        stages={[
          { label: "Booked", value: filtered.length },
          { label: "Showed", value: showedCount },
          { label: "No Show", value: noShowCount },
          { label: "Cancelled", value: cancelledCount },
        ]}
        onStageClick={(label) => {
          if (label === "Booked") setDrilldown({ title: "All Booked Appointments", rows: filtered });
          else if (label === "Showed") setDrilldown({ title: "Showed Appointments", rows: filtered.filter((r) => r.status && SHOWED_STATUSES.has(r.status)) });
          else if (label === "No Show") setDrilldown({ title: "No-Show Appointments", rows: filtered.filter((r) => r.status === "No show") });
          else if (label === "Cancelled") setDrilldown({ title: "Cancelled Appointments", rows: filtered.filter((r) => r.status === "Cancelled") });
        }}
      />

      <div className="chart-grid">
        <TimeSeriesChart
          title="Appointments Over Time"
          points={filtered.map((r) => ({ date: r.appointmentTime, value: 1 }))}
          color="#61aaf2"
        />
        {/* Donut: Status distribution — clickable to drill into each status */}
        <DonutChart
          title="Status Distribution"
          items={statuses.map((s) => ({ key: s, value: filtered.filter((r) => r.status === s).length }))}
          onSelect={(key) =>
            setDrilldown({ title: `Appointments — ${key}`, rows: filtered.filter((r) => r.status === key) })
          }
        />
      </div>

      {/* Donut: Appointment Type + Cohort side by side */}
      <div className="chart-grid">
        <DonutChart
          title="By Appointment Type"
          items={types.map((t) => ({ key: t || "(none)", value: filtered.filter((r) => r.appointmentType === t).length }))}
          onSelect={(key) => {
            const typeKey = key === "(none)" ? null : key;
            setDrilldown({ title: `Type: ${key}`, rows: filtered.filter((r) => (r.appointmentType || "(none)") === key || r.appointmentType === typeKey) });
          }}
        />
        <BreakdownChart
          title="Appointments by Cohort"
          items={cohorts.map((c) => ({ key: c, value: filtered.filter((r) => r.cohort === c).length }))}
          onSelect={(key) =>
            setDrilldown({ title: `Cohort: ${key}`, rows: filtered.filter((r) => r.cohort === key) })
          }
        />
      </div>

      {/* Per-closer breakdown — includes a "No EM" bar for calls with no closer */}
      <div className="chart-grid">
        <CloserBars
          title="Appointments by Closer"
          items={[
            ...managers.map((m) => ({ name: m, value: filtered.filter((r) => r.enrManager === m).length })),
            { name: "No EM", value: filtered.filter((r) => !(r.enrManager && r.enrManager.trim())).length },
          ]}
          onSelect={(name) => {
            const rows = name === "No EM"
              ? filtered.filter((r) => !(r.enrManager && r.enrManager.trim()))
              : filtered.filter((r) => r.enrManager === name);
            setDrilldown({ title: `Appointments: ${name}`, rows });
          }}
        />
        <CloserBars
          title="Showed by Closer"
          items={[
            ...managers.map((m) => ({
              name: m,
              value: filtered.filter((r) => r.enrManager === m && r.status && SHOWED_STATUSES.has(r.status)).length,
            })),
            {
              name: "No EM",
              value: filtered.filter((r) => !(r.enrManager && r.enrManager.trim()) && r.status && SHOWED_STATUSES.has(r.status)).length,
            },
          ]}
          onSelect={(name) => {
            const rows = name === "No EM"
              ? filtered.filter((r) => !(r.enrManager && r.enrManager.trim()) && r.status && SHOWED_STATUSES.has(r.status))
              : filtered.filter((r) => r.enrManager === name && r.status && SHOWED_STATUSES.has(r.status));
            setDrilldown({ title: `Showed: ${name}`, rows });
          }}
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
            <strong style={{ color: "var(--text)" }}>{formatNumber(filtered.length)}</strong> appointments match current filters
          </div>
          <button className="link-btn" onClick={() => setDrilldown({ title: "All Filtered Appointments", rows: filtered })}>
            View records →
          </button>
        </div>
      )}

      <DrillDownModal
        open={!!drilldown}
        onClose={() => setDrilldown(null)}
        title={drilldown?.title || ""}
        subtitle={drilldown ? drilldown.subtitle || `${drilldown.rows.length} appointments` : ""}
      >
        <DataTable
          columns={columns}
          rows={drilldown?.rows || []}
          rowKey={(r) => r.id}
          isTestRow={(r) => r.isTest}
          searchable
          searchPlaceholder="Search name, email, phone, cohort, closer, status…"
        />
      </DrillDownModal>
    </div>
  );
}
