"use client";

import { useMemo, useState } from "react";
import type { ApplicationRow, AppointmentRow, CashRow, ChallengeRow } from "@/lib/types";
import {
  computeAllCohortFunnels,
  stageToStageRate,
  type CohortFunnel,
  type FunnelStage,
} from "@/lib/cohortFunnel";
import { formatMoney, formatNumber, formatPercent } from "@/lib/money";
import DrillDownModal from "../DrillDownModal";
import LeadTable, {
  CHALLENGE_COLS,
  APPLICATION_COLS,
  APPOINTMENT_COLS,
  CASH_COLS,
  type LeadColumn,
} from "../LeadTable";

interface Props {
  cash: CashRow[];
  appointments: AppointmentRow[];
  applications: ApplicationRow[];
  challenge: ChallengeRow[];
}

type DrilldownState = {
  cohort: CohortFunnel;
  stage: FunnelStage;
} | null;

const norm = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim().toLowerCase());

function columnsForSource(source: FunnelStage["source"]): LeadColumn[] {
  switch (source) {
    case "challenge":
      return CHALLENGE_COLS;
    case "applications":
      return APPLICATION_COLS;
    case "appointments":
      return APPOINTMENT_COLS;
    case "cash":
      return CASH_COLS;
  }
}

function getEmailForSource(source: FunnelStage["source"]): (r: any) => string {
  if (source === "challenge") {
    return (r: any) => {
      for (const k of Object.keys(r)) if (k.toLowerCase().includes("email")) return norm(r[k]);
      return "";
    };
  }
  return (r: any) => norm(r?.email);
}

export default function CohortFunnels({ cash, appointments, applications, challenge }: Props) {
  const [includeTest, setIncludeTest] = useState(false);
  const funnels = useMemo(
    () => computeAllCohortFunnels({ cash, appointments, applications, challenge }, includeTest),
    [cash, appointments, applications, challenge, includeTest]
  );
  const [drilldown, setDrilldown] = useState<DrilldownState>(null);

  // Only show cohorts that have at least SOMETHING in them
  const activeCohorts = funnels.filter((f) => f.stages.some((s) => s.count > 0));
  const emptyCohorts = funnels.filter((f) => f.stages.every((s) => s.count === 0));

  return (
    <div className="cohort-funnels">
      <div className="cohort-funnels-hero">
        <div>
          <div className="cohort-funnels-title">Cohort Funnels</div>
          <div className="cohort-funnels-subtitle">
            The full sales story for every launch — one click, no filter building.
            <br />
            <span style={{ color: "var(--muted)" }}>
              Every number is unique-people (deduped by email). Click any stage to see who's in it.
            </span>
          </div>
        </div>
        <label className="toggle-chip">
          <input type="checkbox" checked={includeTest} onChange={(e) => setIncludeTest(e.target.checked)} />
          Include test records
        </label>
      </div>

      <div className="cohort-funnels-grid">
        {activeCohorts.map((funnel) => (
          <FunnelCard key={funnel.cohort.id} funnel={funnel} onClickStage={(stage) => setDrilldown({ cohort: funnel, stage })} />
        ))}
        {activeCohorts.length === 0 && (
          <div className="cohort-funnels-empty">
            No cohort data yet. Once the Cash Tracker, Appointments, or Challenge sheet has records tagged with Erupt 1 / Erupt 2 / Erupt 3 / Penetrate, the funnels will appear here.
          </div>
        )}
      </div>

      {emptyCohorts.length > 0 && activeCohorts.length > 0 && (
        <div className="cohort-funnels-empty-note">
          Not shown (no data yet): {emptyCohorts.map((f) => f.cohort.label).join(" · ")}
        </div>
      )}

      {activeCohorts.length > 1 && <SideBySideComparison funnels={activeCohorts} />}

      {drilldown && (
        <DrillDownModal
          open={true}
          onClose={() => setDrilldown(null)}
          title={`${drilldown.cohort.cohort.emoji} ${drilldown.cohort.cohort.label} — ${drilldown.stage.label}`}
          subtitle={`${formatNumber(drilldown.stage.count)} unique ${drilldown.stage.count === 1 ? "person" : "people"}${
            drilldown.stage.dollarAmount ? ` · ${formatMoney(drilldown.stage.dollarAmount)}` : ""
          }`}
        >
          <LeadTable
            rows={drilldown.stage.rows}
            columns={columnsForSource(drilldown.stage.source)}
            getEmail={getEmailForSource(drilldown.stage.source)}
            searchPlaceholder="Search by name, email, or any field…"
            howCalculated={drilldown.stage.howCalculated}
          />
        </DrillDownModal>
      )}

      <style jsx>{`
        .cohort-funnels {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .cohort-funnels-hero {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
          padding: 20px 22px;
          border-radius: 14px;
          background: var(--gradient-surface);
          border: 1px solid var(--line-strong);
          flex-wrap: wrap;
        }
        .cohort-funnels-title {
          font-family: var(--font-body);
          font-size: var(--fs-lg);
          font-weight: 600;
          color: var(--text);
          letter-spacing: -0.01em;
        }
        .cohort-funnels-subtitle {
          font-size: var(--fs-sm);
          color: var(--muted);
          margin-top: 4px;
          line-height: 1.5;
          max-width: 640px;
        }
        .cohort-funnels-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 16px;
        }
        .cohort-funnels-empty {
          padding: 40px 24px;
          text-align: center;
          color: var(--muted);
          font-size: 13px;
          background: var(--surface);
          border: 1px dashed var(--line);
          border-radius: 14px;
          grid-column: 1 / -1;
        }
        .cohort-funnels-empty-note {
          font-size: 11px;
          color: var(--muted);
          text-align: center;
          padding: 8px 0;
        }
      `}</style>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Single-cohort funnel card
// ────────────────────────────────────────────────────────────────

function FunnelCard({ funnel, onClickStage }: { funnel: CohortFunnel; onClickStage: (stage: FunnelStage) => void }) {
  const maxCount = Math.max(...funnel.stages.map((s) => s.count), 1);

  return (
    <div className="funnel-card" style={{ borderTop: `3px solid ${funnel.cohort.color}` }}>
      <div className="funnel-card-header">
        <div className="funnel-card-title">
          <span style={{ fontSize: 20 }}>{funnel.cohort.emoji}</span>
          <span>{funnel.cohort.label}</span>
        </div>
        <div className="funnel-card-summary">
          <div>
            <div className="funnel-card-summary-value">{formatMoney(funnel.totalCash)}</div>
            <div className="funnel-card-summary-label">cash collected</div>
          </div>
        </div>
      </div>

      <div className="funnel-stages">
        {funnel.stages.map((stage, idx) => {
          const prevCount = idx > 0 ? funnel.stages[idx - 1].count : null;
          const stageRate = idx > 0 ? stageToStageRate(prevCount!, stage.count) : null;
          const barWidth = (stage.count / maxCount) * 100;

          return (
            <button
              key={stage.key}
              type="button"
              className="funnel-stage-btn"
              onClick={() => onClickStage(stage)}
              title={`Click to see the ${formatNumber(stage.count)} ${stage.label.toLowerCase()} — search included`}
            >
              <div className="funnel-stage-row">
                <div className="funnel-stage-label">
                  <span style={{ marginRight: 6 }}>{stage.emoji}</span>
                  {stage.label}
                </div>
                <div className="funnel-stage-count">{formatNumber(stage.count)}</div>
              </div>
              <div className="funnel-stage-bar-track">
                <div
                  className="funnel-stage-bar-fill"
                  style={{
                    width: `${barWidth}%`,
                    background: `linear-gradient(90deg, ${funnel.cohort.color}, ${funnel.cohort.color}88)`,
                  }}
                />
              </div>
              {idx > 0 && (
                <div className="funnel-stage-conv">
                  <span className="funnel-stage-conv-primary">
                    {stageRate !== null ? formatPercent(stageRate) : "—"}
                  </span>
                  <span className="funnel-stage-conv-secondary">from previous stage</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      <style jsx>{`
        .funnel-card {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 6px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          transition: border-color 0.12s ease;
        }
        .funnel-card:hover {
          border-color: var(--line-strong);
        }
        .funnel-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }
        .funnel-card-title {
          font-family: var(--font-body);
          font-size: var(--fs-md);
          font-weight: 600;
          color: var(--text);
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .funnel-card-summary-value {
          font-family: var(--font-mono);
          font-size: var(--fs-md);
          font-weight: 500;
          color: var(--text);
          text-align: right;
          font-variant-numeric: tabular-nums;
        }
        .funnel-card-summary-label {
          font-size: var(--fs-xs);
          color: var(--muted);
          text-transform: none;
          letter-spacing: 0;
          text-align: right;
        }
        .funnel-stages {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .funnel-stage-btn {
          all: unset;
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 8px 10px;
          border-radius: 5px;
          cursor: pointer;
          border: 1px solid transparent;
          transition: background 0.12s ease;
        }
        .funnel-stage-btn:hover {
          background: var(--surface-2);
        }
        .funnel-stage-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
        }
        .funnel-stage-label {
          font-size: var(--fs-sm);
          color: var(--text-dim);
          font-weight: 500;
        }
        .funnel-stage-count {
          font-family: var(--font-mono);
          font-size: var(--fs-md);
          font-weight: 500;
          color: var(--text);
          font-variant-numeric: tabular-nums;
        }
        .funnel-stage-bar-track {
          height: 6px;
          background: var(--surface-2);
          border-radius: 3px;
          overflow: hidden;
        }
        .funnel-stage-bar-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 0.4s ease;
        }
        .funnel-stage-conv {
          display: flex;
          gap: 8px;
          font-size: 10px;
          color: var(--muted);
          padding-top: 2px;
        }
        .funnel-stage-conv-primary {
          color: var(--text);
          font-weight: 500;
        }
        .funnel-stage-conv-secondary {
          color: var(--muted);
        }
        .funnel-card-explain {
          padding: 10px 12px;
          background: var(--surface-2);
          border-radius: 8px;
          font-size: 10px;
          color: var(--muted);
          line-height: 1.5;
        }
        .funnel-card-explain strong {
          color: var(--text);
        }
      `}</style>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Side-by-side comparison table — clean sales scoreboard
// ────────────────────────────────────────────────────────────────

function SideBySideComparison({ funnels }: { funnels: CohortFunnel[] }) {
  // Three KPIs — the only questions a sales lead actually asks side-by-side.
  const kpis: {
    key: string;
    label: string;
    emoji: string;
    getValue: (f: CohortFunnel) => number;
    format: (v: number) => string;
    higherIsBetter: boolean;
    color?: string;
  }[] = [
    {
      key: "enrolled",
      label: "Enrolled",
      emoji: "🏆",
      getValue: (f) => f.stages.find((s) => s.key === "enrolled")!.count,
      format: formatNumber,
      higherIsBetter: true,
    },
    {
      key: "conv",
      label: "Registered → Enrolled",
      emoji: "🎯",
      getValue: (f) => {
        const reg = f.stages[0].count;
        const enr = f.stages.find((s) => s.key === "enrolled")!.count;
        return reg > 0 ? enr / reg : 0;
      },
      format: (v) => formatPercent(v),
      higherIsBetter: true,
      color: "var(--accent)",
    },
    {
      key: "cash",
      label: "Cash Collected",
      emoji: "💰",
      getValue: (f) => f.totalCash,
      format: formatMoney,
      higherIsBetter: true,
      color: "var(--green)",
    },
  ];

  return (
    <div className="comparison-wrap">
      <div className="comparison-header">
        <div className="comparison-title">Side-by-Side</div>
        <div className="comparison-subtitle">The three numbers a sales lead asks about. Winner gets a ▲ badge.</div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="comparison-table">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>KPI</th>
              {funnels.map((f) => (
                <th key={f.cohort.id} style={{ color: f.cohort.color }}>
                  {f.cohort.emoji} {f.cohort.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {kpis.map((kpi) => {
              const values = funnels.map((f) => kpi.getValue(f));
              const best = kpi.higherIsBetter ? Math.max(...values) : Math.min(...values);
              return (
                <tr key={kpi.key}>
                  <td style={{ fontWeight: 500 }}>
                    <span style={{ marginRight: 6 }}>{kpi.emoji}</span>
                    {kpi.label}
                  </td>
                  {funnels.map((f, i) => {
                    const v = values[i];
                    const isBest = v === best && v > 0;
                    return (
                      <td key={f.cohort.id} className={isBest ? "winner mono" : "mono"} style={kpi.color && !isBest ? { color: kpi.color } : undefined}>
                        {kpi.format(v)}
                        {isBest && <span className="winner-badge">▲ best</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .comparison-wrap {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 20px;
        }
        .comparison-header {
          margin-bottom: 14px;
        }
        .comparison-title {
          font-family: var(--font-display);
          font-size: 17px;
          font-weight: 600;
        }
        .comparison-subtitle {
          font-size: 11px;
          color: var(--muted);
          margin-top: 4px;
        }
        .comparison-table {
          width: 100%;
          font-size: 13px;
          border-collapse: collapse;
        }
        .comparison-table th {
          text-align: right;
          padding: 10px 14px;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--muted);
          border-bottom: 1px solid var(--line);
          font-weight: 600;
        }
        .comparison-table th:first-child {
          text-align: left;
        }
        .comparison-table td {
          padding: 10px 14px;
          text-align: right;
          border-bottom: 1px solid var(--line);
        }
        .comparison-table td:first-child {
          text-align: left;
        }
        .separator-row td {
          padding: 0;
          border-bottom: 2px solid var(--line-strong);
        }
        .winner {
          color: var(--accent);
          font-weight: 700;
        }
        .winner-badge {
          font-size: 9px;
          margin-left: 6px;
          padding: 2px 6px;
          border-radius: 4px;
          background: rgba(69, 208, 147, 0.12);
          color: var(--green);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
      `}</style>
    </div>
  );
}
