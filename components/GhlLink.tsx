"use client";

interface GhlNameProps {
  name: string;
  ghlUrl: string | null | undefined;
}

export default function GhlName({ name, ghlUrl }: GhlNameProps) {
  if (!ghlUrl) return <>{name}</>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <a
        href={ghlUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        title="Open in GoHighLevel"
        style={{
          color: "var(--text)",
          textDecoration: "none",
          borderBottom: "1px dashed rgba(16,185,129,0.4)",
        }}
      >
        {name}
      </a>
      <a
        href={ghlUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "inline-flex",
          alignItems: "center",
          color: "var(--accent)",
          textDecoration: "none",
          fontSize: 10,
          fontWeight: 600,
          padding: "1px 5px",
          borderRadius: 4,
          background: "rgba(16,185,129,0.12)",
          letterSpacing: 0.3,
          lineHeight: 1.5,
        }}
      >
        GHL
      </a>
    </span>
  );
}
