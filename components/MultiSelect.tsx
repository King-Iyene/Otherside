"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Compact multi-select filter. Empty selection = "All". Lets you pick several
 * values (e.g. Erupt 2 + Erupt 2 Core, or every Erupt cohort) to compare.
 */
export default function MultiSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = (opt: string) => {
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  };

  const summary =
    value.length === 0 ? "All" : value.length === 1 ? value[0] : `${value.length} selected`;

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        className="select-input"
        onClick={() => setOpen((o) => !o)}
        title={value.length ? value.join(", ") : `${label}: All`}
        style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", textAlign: "left" }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>
          {label}: {summary}
        </span>
        <span aria-hidden="true" style={{ opacity: 0.7, fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            zIndex: 50,
            top: "calc(100% + 4px)",
            left: 0,
            minWidth: 220,
            maxHeight: 300,
            overflowY: "auto",
            background: "var(--surface-2)",
            border: "1px solid var(--line-strong)",
            borderRadius: 10,
            boxShadow: "var(--shadow-elev)",
            padding: 6,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 8px 6px" }}>
            <span style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.05 }}>{label}</span>
            {value.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                style={{ all: "unset", cursor: "pointer", fontSize: 11, color: "var(--accent)" }}
              >
                Clear
              </button>
            )}
          </div>
          {options.map((opt) => {
            const checked = value.includes(opt);
            return (
              <label
                key={opt}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 12,
                  color: "var(--text)",
                  background: checked ? "var(--accent-soft)" : "transparent",
                }}
              >
                <input type="checkbox" checked={checked} onChange={() => toggle(opt)} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{opt}</span>
              </label>
            );
          })}
          {options.length === 0 && (
            <div style={{ padding: "8px", fontSize: 12, color: "var(--muted)" }}>No options.</div>
          )}
        </div>
      )}
    </div>
  );
}
