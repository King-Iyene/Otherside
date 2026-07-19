"use client";

interface Props {
  url: string | null | undefined;
}

export default function GhlLink({ url }: Props) {
  if (!url) return <span style={{ color: "var(--muted)" }}>—</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="Open in GoHighLevel"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        color: "var(--accent)",
        textDecoration: "none",
        fontSize: 12,
        fontWeight: 500,
        padding: "2px 8px",
        borderRadius: 6,
        border: "1px solid rgba(16,185,129,0.25)",
        background: "rgba(16,185,129,0.08)",
        transition: "border-color 0.15s, background 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(16,185,129,0.5)";
        (e.currentTarget as HTMLElement).style.background = "rgba(16,185,129,0.15)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(16,185,129,0.25)";
        (e.currentTarget as HTMLElement).style.background = "rgba(16,185,129,0.08)";
      }}
    >
      GHL &#8599;
    </a>
  );
}
