"use client";

import { useState } from "react";

export interface DataSourceInfo {
  source: string;
  field: string;
  formula?: string;
  href?: string;
}

/**
 * Small "ℹ" chip on KPI cards. Hover reveals which system/field the number
 * comes from and how it's derived. Kills the "where does this number come from"
 * question that comes up every review.
 */
export default function DataSourceChip({ info }: { info: DataSourceInfo }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button
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
          fontSize: 11,
          lineHeight: 1,
          borderRadius: 4,
        }}
      >
        ⓘ
      </button>
      {open && (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            right: 0,
            background: "var(--surface-2)",
            border: "1px solid var(--line-strong)",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 11,
            width: 260,
            zIndex: 20,
            boxShadow: "0 8px 24px -12px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ color: "var(--muted)", marginBottom: 2 }}>Source</div>
          <div className="mono" style={{ color: "var(--text)", marginBottom: 6 }}>{info.source}</div>
          <div style={{ color: "var(--muted)", marginBottom: 2 }}>Field</div>
          <div className="mono" style={{ color: "var(--text)", marginBottom: info.formula ? 6 : 0 }}>{info.field}</div>
          {info.formula && (
            <>
              <div style={{ color: "var(--muted)", marginBottom: 2 }}>Formula</div>
              <div className="mono" style={{ color: "var(--text-dim)", fontSize: 10, lineHeight: 1.4 }}>{info.formula}</div>
            </>
          )}
          {info.href && (
            <a
              href={info.href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "block", marginTop: 6, color: "var(--blue)", fontSize: 11 }}
            >
              Open source →
            </a>
          )}
        </div>
      )}
    </span>
  );
}
