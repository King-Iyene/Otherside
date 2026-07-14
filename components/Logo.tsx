"use client";

export default function Logo({ size = 30, withWordmark = true }: { size?: number; withWordmark?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <img
        src="/logo.png"
        alt="Otherside"
        width={size}
        height={size}
        style={{ display: "block", flexShrink: 0, objectFit: "contain" }}
      />
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
