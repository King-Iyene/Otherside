"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Tiny "ⓘ" that reveals arbitrary explanatory text on hover, in a
 * viewport-anchored floating tooltip (portal → document.body) so it can never
 * be clipped by an overflow:hidden card or trapped behind a sibling's stacking
 * context. Generic sibling of DataSourceChip / HowToFixTip.
 */
export default function InfoTip({ text, label = "ⓘ" }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const tooltipWidth = 300;
    const gap = 8;
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    if (left < 12) left = 12;
    if (left + tooltipWidth > window.innerWidth - 12) left = window.innerWidth - tooltipWidth - 12;
    let top = rect.bottom + gap;
    if (top + 150 > window.innerHeight - 12) top = Math.max(12, rect.top - 150 - gap);
    setCoords({ left, top });
  }, [open]);

  if (!text) return null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((x) => !x);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        aria-label="Explanation"
        style={{
          background: "transparent",
          border: "none",
          color: "var(--muted)",
          cursor: "help",
          padding: 0,
          marginLeft: 4,
          fontSize: 11,
          lineHeight: 1,
        }}
      >
        {label}
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
              width: 300,
              zIndex: 9999,
              boxShadow: "var(--shadow-lg)",
              color: "var(--text)",
              backdropFilter: "blur(8px)",
              pointerEvents: "none",
            }}
          >
            {text}
          </div>,
          document.body
        )}
    </>
  );
}
