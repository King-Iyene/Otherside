"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface DataSourceInfo {
  source: string;
  field: string;
  formula?: string;
  href?: string;
}

/**
 * Small "ⓘ" chip on KPI cards. Hover reveals which system/field the number
 * comes from and how it's derived. Uses a viewport-anchored floating tooltip
 * (portal-free but position-aware) so it can't get clipped by the card's
 * overflow:hidden container.
 */
export default function DataSourceChip({ info }: { info: DataSourceInfo }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number; placement: "top" | "bottom" } | null>(null);
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const tooltipWidth = 280;
    const tooltipHeight = 130;
    const gap = 8;

    let left = rect.right - tooltipWidth;
    if (left < 12) left = 12;
    if (left + tooltipWidth > window.innerWidth - 12) left = window.innerWidth - tooltipWidth - 12;

    let top = rect.top - tooltipHeight - gap;
    let placement: "top" | "bottom" = "top";
    if (top < 12) {
      top = rect.bottom + gap;
      placement = "bottom";
    }
    setCoords({ left, top, placement });
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((x) => !x)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        aria-label="Data source"
        style={{
          background: "transparent",
          border: "none",
          color: "var(--muted)",
          cursor: "help",
          padding: 2,
          fontSize: 12,
          lineHeight: 1,
          borderRadius: 4,
        }}
      >
        ⓘ
      </button>
      {mounted && open && coords &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: "fixed",
              left: coords.left,
              top: coords.top,
              background: "var(--surface-2)",
              border: "1px solid var(--line-strong)",
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 11,
              width: 280,
              zIndex: 9999,
              boxShadow: "var(--shadow-lg)",
              pointerEvents: "none",
              backdropFilter: "blur(8px)",
            }}
          >
            <div style={{ color: "var(--muted)", marginBottom: 2, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.08 }}>
              Source
            </div>
            <div className="mono" style={{ color: "var(--accent)", marginBottom: 8, fontSize: 12 }}>{info.source}</div>
            <div style={{ color: "var(--muted)", marginBottom: 2, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.08 }}>
              Field
            </div>
            <div className="mono" style={{ color: "var(--text)", marginBottom: info.formula ? 8 : 0 }}>{info.field}</div>
            {info.formula && (
              <>
                <div style={{ color: "var(--muted)", marginBottom: 2, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.08 }}>
                  Formula
                </div>
                <div className="mono" style={{ color: "var(--text-dim)", fontSize: 10, lineHeight: 1.5 }}>{info.formula}</div>
              </>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
