"use client";

/**
 * Otherside brand mark — sunrise over the horizon.
 * Large circle arc (nearly full) + thick horizon line + reflected rays below.
 * Matches the official logo shape; uses bright amber/orange for dark backgrounds.
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
        {/* large sun circle — nearly full, clipped at horizon */}
        <path
          d="M10 40 A22 22 0 1 1 54 40"
          stroke="#FF9C26"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
        {/* horizon line */}
        <line x1="4" y1="40" x2="60" y2="40" stroke="#FF9C26" strokeWidth="3" strokeLinecap="round" />
        {/* reflected rays — progressively shorter */}
        <line x1="14" y1="46" x2="50" y2="46" stroke="#FF6A00" strokeWidth="2.4" strokeLinecap="round" />
        <line x1="18" y1="50.5" x2="46" y2="50.5" stroke="#FF6A00" strokeWidth="2.4" strokeLinecap="round" />
        <line x1="22" y1="55" x2="42" y2="55" stroke="#FF6A00" strokeWidth="2.4" strokeLinecap="round" />
        <line x1="26" y1="59.5" x2="38" y2="59.5" stroke="#FF6A00" strokeWidth="2.4" strokeLinecap="round" />
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
