"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Hover icon for the Data Health "How to fix" column. The fix text is often
 * long, so rendering it inline overflows the table cell — this shows a small
 * icon that reveals the full text in a viewport-anchored floating tooltip
 * (same escape-the-table-cell trick as DataSourceChip) instead.
 */
export default function HowToFixTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const tooltipWidth = 320;
    const gap = 8;

    let left = rect.right - tooltipWidth;
    if (left < 12) left = 12;
    if (left + tooltipWidth > window.innerWidth - 12) left = window.innerWidth - tooltipWidth - 12;

    let top = rect.bottom + gap;
    if (top + 160 > window.innerHeight - 12) top = Math.max(12, rect.top - 160 - gap);
    setCoords({ left, top });
  }, [open]);

  if (!text) return <span style={{ color: "var(--muted)" }}>—</span>;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((x) => !x)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        aria-label="How to fix"
        style={{
          background: "transparent",
          border: "1px solid var(--line)",
          color: "var(--accent)",
          cursor: "help",
          padding: "2px 8px",
          fontSize: 11,
          lineHeight: 1.4,
          borderRadius: 6,
          whiteSpace: "nowrap",
        }}
      >
        How to fix ⓘ
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
              fontSize: 11.5,
              lineHeight: 1.5,
              width: 320,
              zIndex: 9999,
              boxShadow: "var(--shadow-lg)",
              color: "var(--text)",
              backdropFilter: "blur(8px)",
            }}
          >
            {text}
          </div>,
          document.body
        )}
    </>
  );
}
