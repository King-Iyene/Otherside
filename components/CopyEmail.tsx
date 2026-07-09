"use client";

import { useState } from "react";

/** Bright, click-to-copy email. */
export default function CopyEmail({ email, size = 12 }: { email: string; size?: number }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Click to copy email"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(email).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          },
          () => {}
        );
      }}
      style={{
        all: "unset",
        cursor: "pointer",
        color: "var(--accent, #10b981)",
        fontWeight: 600,
        fontFamily: "var(--font-mono)",
        fontSize: size,
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {email}
      <span aria-hidden="true" style={{ opacity: 0.75, fontSize: size - 1 }}>
        {copied ? "✓ copied" : "⧉"}
      </span>
    </button>
  );
}
