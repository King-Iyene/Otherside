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
import InfoTip from "../InfoTip";
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

  const activeCohorts = funnels.filter((f) => f.stages.some((s) => s.count > 0));
  const emptyCohorts = funnels.filter((f) => f.stages.every((s) => s.count === 0));

  return (
    <div className="cohort-funnels">
      <div className="cohort-funnels-hero">
        <div>
          <div className="cohort-funnels-title">Cohort Funnels</div>
          <div className="cohort-funnels-subtitle">
            The full sales story for every launch. Every number is unique people (deduped by email). Click any stage to see who&#39;s in it.
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
          title={`${drilldown.cohort.cohort.label} — ${drilldown.stage.label}`}
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
          gap: 16px;
        }
        .cohort-funnels-hero {
          position: relative;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          padding: 18px 20px;
          background: var(--glass-bg);
          backdrop-filter: var(--glass-blur);
          -webkit-backdrop-filter: var(--glass-blur);
          border: 1px solid var(--chrome-hi);
          border-radius: 10px;
          box-shadow: var(--shadow-card);
          flex-wrap: wrap;
        }
        .cohort-funnels-hero::before {
          content: "";
          position: absolute;
          inset: 0 0 auto 0;
          height: 1px;
          background: var(--hairline);
          pointer-events: none;
          border-radius: 10px 10px 0 0;
        }
        .cohort-funnels-title {
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
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 12px;
        }
        .cohort-funnels-empty {
          padding: 40px 24px;
          text-align: center;
          color: var(--muted);
          font-size: var(--fs-md);
          background: var(--surface);
          border: 1px dashed var(--line);
          border-radius: 4px;
          grid-column: 1 / -1;
        }
        .cohort-funnels-empty-note {
          font-size: var(--fs-xs);
          color: var(--muted);
          text-align: center;
          padding: 4px 0;
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
    <div className="funnel-card">
      <div className="funnel-card-header">
        <div className="funnel-card-title">
          <span className="funnel-card-swatch" style={{ background: funnel.cohort.color }} aria-hidden="true" />
          <span>{funnel.cohort.label}</span>
        </div>
        <div className="funnel-card-summary">
          <div className="funnel-card-summary-value">{formatMoney(funnel.totalCash)}</div>
          <div className="funnel-card-summary-label">cash collected</div>
        </div>
      </div>

      <div className="funnel-stages">
        {funnel.stages.map((stage, idx) => {
          const prevStage = idx > 0 ? funnel.stages[idx - 1] : null;
          const prevCount = prevStage ? prevStage.count : null;
          const stageRate = idx > 0 ? stageToStageRate(prevCount!, stage.count) : null;
          const barWidth = (stage.count / maxCount) * 100;
          const overflows = stageRate !== null && stageRate > 1;

          const tipText =
            prevStage && prevCount !== null
              ? overflows
                ? `${formatNumber(stage.count)} ${stage.label.toLowerCase()} ÷ ${formatNumber(prevCount)} ${prevStage.label.toLowerCase()} = ${formatPercent(
                    stageRate!
                  )}. A funnel step can't truly exceed 100% — this means ${formatNumber(
                    stage.count - prevCount!
                  )} people reached "${stage.label}" without being logged at "${prevStage.label}". Usually they enrolled without a recorded ${prevStage.label.toLowerCase()} (e.g. bought without a "Showed" appointment on file). The count itself is right; the upstream stage is under-recorded.`
                : `${formatNumber(stage.count)} ${stage.label.toLowerCase()} ÷ ${formatNumber(
                    prevCount
                  )} ${prevStage.label.toLowerCase()} = ${formatPercent(stageRate!)}. This is the share of the previous stage that made it to this one.`
              : "";

          return (
            <button
              key={stage.key}
              type="button"
              className="funnel-stage-btn"
              onClick={() => onClickStage(stage)}
            >
              <div className="funnel-stage-row">
                <div className="funnel-stage-label">{stage.label}</div>
                <div className="funnel-stage-count">{formatNumber(stage.count)}</div>
              </div>
              <div className="funnel-stage-bar-track">
                <div
                  className="funnel-stage-bar-fill"
                  style={{ width: `${barWidth}%`, background: funnel.cohort.color }}
                />
              </div>
              {idx > 0 && (
                <div className="funnel-stage-conv">
                  {overflows ? (
                    <>
                      <span className="funnel-stage-conv-primary" style={{ color: "var(--amber-ui, #f59e0b)" }}>
                        100%+
                      </span>
                      <span className="funnel-stage-conv-secondary">more than the step before (data gap)</span>
                    </>
                  ) : (
                    <>
                      <span className="funnel-stage-conv-primary">{stageRate !== null ? formatPercent(stageRate) : "—"}</span>
                      <span className="funnel-stage-conv-secondary">of the step before</span>
                    </>
                  )}
                  <span onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex" }}>
                    <InfoTip text={tipText} />
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      <style jsx>{`
        .funnel-card {
          position: relative;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          box-shadow: var(--shadow-card);
          transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.25s ease;
        }
        .funnel-card::before {
          content: "";
          position: absolute;
          inset: 0 0 auto 0;
          height: 1px;
          background: var(--hairline);
          pointer-events: none;
          border-radius: 8px 8px 0 0;
        }
        .funnel-card:hover {
          border-color: var(--border-ring);
          transform: translateY(-2px);
          box-shadow: var(--shadow-elev);
        }
        .funnel-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }
        .funnel-card-title {
          font-size: var(--fs-md);
          font-weight: 600;
          color: var(--text);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .funnel-card-swatch {
          display: inline-block;
          width: 10px;
          height: 10px;
          border-radius: 2px;
          flex: 0 0 auto;
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
          padding: 6px 8px;
          border-radius: 3px;
          cursor: pointer;
          transition: background 0.12s ease;
        }
        .funnel-stage-btn:hover {
          background: var(--accent-soft);
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
        }
        .funnel-stage-bar-track {
          height: 4px;
          background: var(--surface-2);
          border-radius: 2px;
          overflow: hidden;
        }
        .funnel-stage-bar-fill {
          height: 100%;
          border-radius: 2px;
        }
        .funnel-stage-conv {
          display: flex;
          gap: 6px;
          font-size: var(--fs-xs);
          color: var(--muted);
          padding-top: 2px;
        }
        .funnel-stage-conv-primary {
          color: var(--text);
          font-weight: 500;
          font-family: var(--font-mono);
        }
      `}</style>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Side-by-Side scoreboard — 3 KPIs
// ────────────────────────────────────────────────────────────────

function SideBySideComparison({ funnels }: { funnels: CohortFunnel[] }) {
  const kpis: {
    key: string;
    label: string;
    tip: string;
    getValue: (f: CohortFunnel) => number;
    format: (v: number) => string;
    higherIsBetter: boolean;
  }[] = [
    {
      key: "enrolled",
      label: "Enrolled",
      tip: "Unique buyers in the Cash Tracker for this launch (deduped by email). This is ground truth — the actual people who paid.",
      getValue: (f) => f.stages.find((s) => s.key === "enrolled")!.count,
      format: formatNumber,
      higherIsBetter: true,
    },
    {
      key: "conv",
      label: "Registered → Enrolled",
      tip: "Enrolled ÷ Challenge Registered for this launch. It answers: of everyone who registered for the challenge, what share became paying buyers? It can read above 100% when more people enrolled than were logged as registered — i.e. buyers who came in without a challenge registration on file.",
      getValue: (f) => {
        const reg = f.stages[0].count;
        const enr = f.stages.find((s) => s.key === "enrolled")!.count;
        return reg > 0 ? enr / reg : 0;
      },
      format: (v) => formatPercent(v),
      higherIsBetter: true,
    },
    {
      key: "cash",
      label: "Cash Collected",
      tip: "Sum of Cash Collected across every Cash Tracker row for this launch (includes every installment/payment, not deduped — this is money, not people).",
      getValue: (f) => f.totalCash,
      format: formatMoney,
      higherIsBetter: true,
    },
  ];

  return (
    <div className="comparison-wrap">
      <div className="comparison-header">
        <div className="comparison-title">Side-by-Side</div>
        <div className="comparison-subtitle">Winner of each row gets ▲.</div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="comparison-table">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>KPI</th>
              {funnels.map((f) => (
                <th key={f.cohort.id}>
                  <span className="th-swatch" style={{ background: f.cohort.color }} aria-hidden="true" />
                  {f.cohort.label}
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
                    {kpi.label}
                    <InfoTip text={kpi.tip} />
                  </td>
                  {funnels.map((f, i) => {
                    const v = values[i];
                    const isBest = v === best && v > 0;
                    return (
                      <td key={f.cohort.id} className={isBest ? "winner mono" : "mono"}>
                        {kpi.format(v)}
                        {isBest && <span className="winner-badge">▲</span>}
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
          position: relative;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 16px;
          box-shadow: var(--shadow-card);
        }
        .comparison-wrap::before {
          content: "";
          position: absolute;
          inset: 0 0 auto 0;
          height: 1px;
          background: var(--hairline);
          pointer-events: none;
          border-radius: 8px 8px 0 0;
        }
        .comparison-header { margin-bottom: 12px; }
        .comparison-title {
          font-size: var(--fs-md);
          font-weight: 600;
          color: var(--text);
        }
        .comparison-subtitle {
          font-size: var(--fs-xs);
          color: var(--muted);
          margin-top: 2px;
        }
        .comparison-table {
          width: 100%;
          font-size: var(--fs-md);
          border-collapse: collapse;
          font-variant-numeric: tabular-nums;
        }
        .comparison-table th {
          text-align: right;
          padding: 8px 12px;
          font-size: var(--fs-xs);
          color: var(--muted);
          border-bottom: 1px solid var(--line);
          font-weight: 500;
        }
        .comparison-table th:first-child { text-align: left; }
        .th-swatch {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 2px;
          margin-right: 6px;
          vertical-align: middle;
        }
        .comparison-table td {
          padding: 8px 12px;
          text-align: right;
          border-bottom: 1px solid var(--line);
          color: var(--text);
        }
        .comparison-table td:first-child { text-align: left; }
        .winner { font-weight: 600; }
        .winner-badge {
          font-size: 10px;
          margin-left: 4px;
          color: var(--status-good);
        }
      `}</style>
    </div>
  );
}
