"use client";

import { useMemo, useState } from "react";
import type { HealthFlag, HealthFlagKind } from "@/lib/types";
import { HEALTH_LABELS } from "@/lib/dataHealth";

export interface HealthEntry {
  source: string;
  id: string;
  label: string;
  flags: HealthFlag[];
}

type FilterKind = "all" | HealthFlagKind;

export default function HealthPanel({ entries }: { entries: HealthEntry[] }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<FilterKind>("all");
  const [search, setSearch] = useState("");

  const { total, byKind, bySource } = useMemo(() => {
    const byKind = new Map<HealthFlagKind, number>();
    const bySource = new Map<string, number>();
    let total = 0;
    for (const e of entries) {
      for (const f of e.flags) {
        total++;
        byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);
        bySource.set(e.source, (bySource.get(e.source) ?? 0) + 1);
      }
    }
    return { total, byKind, bySource };
  }, [entries]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const out: { entry: HealthEntry; flag: HealthFlag }[] = [];
    for (const entry of entries) {
      for (const flag of entry.flags) {
        if (filter !== "all" && flag.kind !== filter) continue;
        if (s) {
          const hay = `${entry.source} ${entry.label} ${flag.field} ${flag.raw}`.toLowerCase();
          if (!hay.includes(s)) continue;
        }
        out.push({ entry, flag });
      }
    }
    return out;
  }, [entries, filter, search]);

  if (total === 0) {
    return (
      <div className="panel health-panel">
        <div className="panel-title">Data Health</div>
        <p style={{ color: "var(--muted)", marginTop: 8 }}>All checks pass — no data quality issues detected.</p>
      </div>
    );
  }

  const kindCounts = Array.from(byKind.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <div className="panel health-panel">
      <div className="panel-header">
        <div className="panel-title">
          Data Health — <span className="health-count">{total}</span> issue{total === 1 ? "" : "s"}
        </div>
        <button className="link-btn" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide" : "Show"} details
        </button>
      </div>

      {/* Category summary — visible even when details are collapsed */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        <button
          type="button"
          className={`preset-btn ${filter === "all" ? "active" : ""}`}
          onClick={() => setFilter("all")}
          style={{ fontSize: 11 }}
        >
          All ({total})
        </button>
        {kindCounts.map(([kind, count]) => {
          const meta = HEALTH_LABELS[kind];
          const active = filter === kind;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => {
                setFilter(kind);
                setOpen(true);
              }}
              className={`preset-btn ${active ? "active" : ""}`}
              style={{ fontSize: 11 }}
              title={meta.label}
            >
              <span className={`badge ${meta.tone}`} style={{ marginRight: 6 }}>
                {meta.label}
              </span>
              {count}
            </button>
          );
        })}
      </div>

      {/* Source breakdown chip strip */}
      <div style={{ marginTop: 8, color: "var(--muted)", fontSize: 11 }}>
        By source:{" "}
        {Array.from(bySource.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([src, count], i) => (
            <span key={src} style={{ marginRight: 10 }}>
              <span style={{ color: "var(--text)", fontWeight: 500 }}>{src}</span>{" "}
              <span className="mono" style={{ color: "var(--accent)" }}>{count}</span>
              {i < bySource.size - 1 && " ·"}
            </span>
          ))}
      </div>

      {open && (
        <>
          <div style={{ marginTop: 14, marginBottom: 8 }}>
            <input
              type="text"
              className="text-input"
              placeholder="Search by record name, source, field, or raw value…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>
          <div className="table-wrap" style={{ border: "none" }}>
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Record</th>
                  <th>Field</th>
                  <th>Issue</th>
                  <th>Details</th>
                  <th>How to fix</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 500).map(({ entry, flag }, idx) => {
                  const meta = HEALTH_LABELS[flag.kind];
                  return (
                    <tr key={`${entry.id}-${idx}`}>
                      <td>{entry.source}</td>
                      <td>{entry.label}</td>
                      <td>{flag.field}</td>
                      <td>
                        <span className={`badge ${meta.tone}`}>{meta.label}</span>
                      </td>
                      <td className="mono" style={{ fontSize: 11 }}>{flag.raw || "—"}</td>
                      <td style={{ color: "var(--muted)", fontSize: 11, maxWidth: 320 }}>{flag.hint || ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length > 500 && (
              <div style={{ padding: 12, textAlign: "center", color: "var(--muted)", fontSize: 11 }}>
                Showing first 500 of {filtered.length}. Refine your search to see more.
              </div>
            )}
            {filtered.length === 0 && (
              <div style={{ padding: 20, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>
                No issues match this filter.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
