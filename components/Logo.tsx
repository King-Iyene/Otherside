"use client";

/**
 * Otherside brand mark — a sunrise over the horizon.
 * Amber sun arc + horizon, orange reflected rays fanning below.
 * Colors come from the brand palette (#FF9C26 amber, #FF4400 orange-red)
 * so it reads clearly on the deep forest-green (#0E2416) header.
 */
export default function Logo({ size = 30, withWordmark = true }: { size?: number; withWordmark?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        aria-label="Otherside"
        role="img"
        style={{ display: "block", flexShrink: 0 }}
      >
        {/* sun arc */}
        <path
          d="M14 35 A18 18 0 0 1 50 35"
          stroke="#FF9C26"
          strokeWidth="2.6"
          strokeLinecap="round"
          fill="none"
        />
        {/* horizon */}
        <line x1="6" y1="35" x2="58" y2="35" stroke="#FF9C26" strokeWidth="2.6" strokeLinecap="round" />
        {/* reflected rays */}
        <line x1="19" y1="40.5" x2="45" y2="40.5" stroke="#FF4400" strokeWidth="2.2" strokeLinecap="round" />
        <line x1="22" y1="45" x2="42" y2="45" stroke="#FF4400" strokeWidth="2.2" strokeLinecap="round" />
        <line x1="25" y1="49.5" x2="39" y2="49.5" stroke="#FF4400" strokeWidth="2.2" strokeLinecap="round" />
        <line x1="28" y1="54" x2="36" y2="54" stroke="#FF4400" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
      {withWordmark && (
        <span
          style={{
            fontWeight: 800,
            letterSpacing: 1.5,
            fontSize: 14,
            color: "var(--text)",
          }}
        >
          OTHERSIDE
        </span>
      )}
    </span>
  );
}
