"use client";

import { formatNumber, formatPercent } from "@/lib/money";

export interface FunnelStage {
  label: string;
  value: number;
  color: string;
}

export default function FunnelChart({ title, stages, onStageClick }: { title: string; stages: FunnelStage[]; onStageClick?: (label: string) => void }) {
  const max = Math.max(1, ...stages.map((s) => s.value));

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">{title}</div>
        {onStageClick && <span style={{ color: "var(--muted)", fontSize: 11 }}>Click a stage to see the leads</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {stages.map((stage, idx) => {
          const widthPct = Math.max(4, (stage.value / max) * 100);
          const prev = idx > 0 ? stages[idx - 1].value : null;
          const stepConv = prev && prev > 0 ? stage.value / prev : null;
          const clickable = !!onStageClick && stage.value > 0;
          return (
            <div
              key={stage.label}
              onClick={clickable ? () => onStageClick(stage.label) : undefined}
              style={{
                cursor: clickable ? "pointer" : "default",
                borderRadius: 8,
                padding: "4px 6px",
                margin: "-4px -6px",
                transition: "background 120ms ease",
              }}
              onMouseEnter={(e) => { if (clickable) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: "var(--text)" }}>{stage.label}</span>
                <span className="mono" style={{ color: "var(--muted)" }}>
                  {formatNumber(stage.value)}
                  {stepConv !== null && ` · ${formatPercent(stepConv)} of prior stage`}
                </span>
              </div>
              <div style={{ background: "var(--surface-2)", borderRadius: 6, height: 22, overflow: "hidden" }}>
                <div
                  style={{
                    width: `${widthPct}%`,
                    height: "100%",
                    background: stage.color,
                    borderRadius: 6,
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
