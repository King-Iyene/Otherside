"use client";

interface Props {
  current: number;
  target: number;
  /** Optional pace marker — where you *should* be given time elapsed. */
  pace?: number | null;
  height?: number;
  formatter?: (v: number) => string;
}

/**
 * Bullet chart for pacing/attainment — the right primitive for "am I on track".
 * Better than a line chart for quota display (Chartio guidance): line charts obscure
 * pacing, bullet charts show current, target, and where-you-should-be at a glance.
 */
export default function BulletChart({ current, target, pace = null, height = 18, formatter }: Props) {
  const fmt = formatter || ((v) => v.toLocaleString());
  const denom = Math.max(target, current, 1);
  const currentPct = Math.min(100, (current / denom) * 100);
  const targetPct = Math.min(100, (target / denom) * 100);
  const pacePct = pace !== null ? Math.min(100, (pace / denom) * 100) : null;

  const hit = current >= target;
  const behindPace = pace !== null && current < pace;

  const fillColor = hit ? "var(--green)" : behindPace ? "var(--red)" : "var(--accent)";

  return (
    <div>
      <div
        style={{
          position: "relative",
          height,
          background: "var(--surface-2)",
          border: "1px solid var(--line)",
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${currentPct}%`,
            height: "100%",
            background: `linear-gradient(90deg, ${fillColor}, ${fillColor}dd)`,
            transition: "width 0.3s ease",
          }}
        />
        {/* Target marker */}
        <div
          style={{
            position: "absolute",
            top: -2,
            bottom: -2,
            left: `${targetPct}%`,
            width: 2,
            background: "var(--text)",
            transform: "translateX(-1px)",
          }}
        />
        {/* Pace marker */}
        {pacePct !== null && (
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${pacePct}%`,
              width: 2,
              background: "var(--muted)",
              opacity: 0.7,
              transform: "translateX(-1px)",
            }}
          />
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10, color: "var(--muted)" }}>
        <span className="mono">{fmt(current)}</span>
        <span className="mono">
          Target: {fmt(target)}
          {pace !== null && ` · Pace: ${fmt(pace)}`}
        </span>
      </div>
    </div>
  );
}
