"use client";

import { useMemo } from "react";

export interface FunnelBarsProps {
  title: string;
  stages: { label: string; value: number; color?: string }[];
  valueFormatter?: (v: number) => string;
  onStageClick?: (label: string) => void;
}

const BLUE_RAMP = [
  "#86b6ef",
  "#6da7ec",
  "#5598e7",
  "#3987e5",
  "#2a78d6",
  "#256abf",
  "#1c5cab",
];

export default function FunnelBars({
  title,
  stages,
  valueFormatter,
  onStageClick,
}: FunnelBarsProps) {
  const max = useMemo(() => Math.max(1, ...stages.map((s) => s.value)), [stages]);

  const fmt = valueFormatter ?? ((v: number) => String(v));

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">{title}</div>
        {onStageClick && (
          <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 8 }}>
            Click a stage to see the leads
          </span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {stages.map((stage, idx) => {
          const widthPct = Math.max(3, (stage.value / max) * 100);
          const color = stage.color ?? BLUE_RAMP[idx % BLUE_RAMP.length];
          const prev = idx > 0 ? stages[idx - 1].value : null;
          const convPct =
            prev !== null && prev > 0
              ? ((stage.value / prev) * 100).toFixed(1)
              : null;

          return (
            <div key={stage.label}>
              {/* Conversion rate label between bars */}
              {convPct !== null && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--muted)",
                    padding: "2px 0",
                    textAlign: "left",
                    paddingLeft: 4,
                  }}
                >
                  {"↓"} {convPct}%
                </div>
              )}

              {/* Bar row */}
              <div
                role={onStageClick ? "button" : undefined}
                tabIndex={onStageClick ? 0 : undefined}
                onClick={onStageClick ? () => onStageClick(stage.label) : undefined}
                onKeyDown={
                  onStageClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onStageClick(stage.label);
                        }
                      }
                    : undefined
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: onStageClick ? "pointer" : "default",
                  marginBottom: 4,
                }}
                className={onStageClick ? "funnel-bar-row" : undefined}
              >
                {/* Label */}
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--text)",
                    minWidth: 90,
                    flexShrink: 0,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {stage.label}
                </span>

                {/* Bar + value */}
                <div style={{ flex: 1, position: "relative" }}>
                  <div
                    style={{
                      width: `${widthPct}%`,
                      height: 36,
                      background: color,
                      borderRadius: "0 4px 4px 0",
                      transition: "width 0.3s ease, filter 0.15s ease",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      paddingRight: 8,
                    }}
                  >
                    <span
                      className="mono"
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#fff",
                        textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {fmt(stage.value)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Hover style for clickable bars */}
      {onStageClick && (
        <style>{`
          .funnel-bar-row:hover div[style*="background"] {
            filter: brightness(1.12);
          }
        `}</style>
      )}
    </div>
  );
}
