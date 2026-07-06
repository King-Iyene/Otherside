"use client";

import { useMemo, useState } from "react";
import type { HealthFlag, HealthFlagKind } from "@/lib/types";
import { HEALTH_LABELS } from "@/lib/dataHealth";
import HowToFixTip from "@/components/HowToFixTip";

export interface HealthEntry {
  source: string;
  id: string;
  label: string;
  flags: HealthFlag[];
}

type FilterKind = "all" | HealthFlagKind;

interface Contact {
  key: string;
  label: string;
  sources: string[];
  items: { source: string; flag: HealthFlag }[];
}

export default function HealthPanel({ entries }: { entries: HealthEntry[] }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<FilterKind>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

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

  // Group every matching issue by the person/record it belongs to, so a lead
  // with several problems shows once with a count — not scattered across rows.
  // Grouped by name (case-insensitive); most-issues-first floats the worst
  // offenders to the top.
  const contacts: Contact[] = useMemo(() => {
    const map = new Map<string, Contact>();
    for (const { entry, flag } of filtered) {
      const key = (entry.label || entry.id).trim().toLowerCase();
      const g = map.get(key) || { key, label: entry.label || entry.id, sources: [], items: [] };
      if (!g.sources.includes(entry.source)) g.sources.push(entry.source);
      g.items.push({ source: entry.source, flag });
      map.set(key, g);
    }
    return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label));
  }, [filtered]);

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
          <div style={{ color: "var(--muted)", fontSize: 11, marginBottom: 8 }}>
            {contacts.length} record{contacts.length === 1 ? "" : "s"} with issues · click a name to see all its issues
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {contacts.slice(0, 300).map((c) => {
              const isOpen = expanded.has(c.key);
              const count = c.items.length;
              const multi = count > 1;
              return (
                <div
                  key={c.key}
                  style={{
                    border: "1px solid var(--line)",
                    borderRadius: 8,
                    overflow: "hidden",
                    background: "var(--surface)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleExpand(c.key)}
                    style={{
                      all: "unset",
                      boxSizing: "border-box",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      cursor: "pointer",
                      padding: "10px 12px",
                    }}
                  >
                    <span
                      style={{
                        color: "var(--muted)",
                        fontSize: 12,
                        transform: isOpen ? "rotate(90deg)" : "none",
                        transition: "transform 0.15s ease",
                      }}
                    >
                      ▸
                    </span>
                    {/* red notification badge with the issue count */}
                    <span
                      title={`${count} issue${count === 1 ? "" : "s"}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: 20,
                        height: 20,
                        padding: "0 6px",
                        borderRadius: 10,
                        fontSize: 11,
                        fontWeight: 700,
                        fontFamily: "var(--font-mono)",
                        color: multi ? "#fff" : "var(--text)",
                        background: multi ? "var(--red)" : "var(--surface-2)",
                        border: multi ? "none" : "1px solid var(--line)",
                      }}
                    >
                      {count}
                    </span>
                    <span style={{ fontWeight: 600, color: "var(--text)", flex: 1 }}>{c.label}</span>
                    <span style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {Array.from(new Set(c.items.map((it) => it.flag.kind))).map((kind) => {
                        const meta = HEALTH_LABELS[kind];
                        return (
                          <span key={kind} className={`badge ${meta.tone}`} style={{ fontSize: 9 }}>
                            {meta.label}
                          </span>
                        );
                      })}
                    </span>
                  </button>
                  {isOpen && (
                    <div style={{ borderTop: "1px solid var(--line)", padding: "4px 0" }}>
                      <div className="table-wrap" style={{ border: "none" }}>
                        <table>
                          <thead>
                            <tr>
                              <th>Source</th>
                              <th>Field</th>
                              <th>Issue</th>
                              <th>Details</th>
                              <th>How to fix</th>
                            </tr>
                          </thead>
                          <tbody>
                            {c.items.map(({ source, flag }, idx) => {
                              const meta = HEALTH_LABELS[flag.kind];
                              return (
                                <tr key={`${c.key}-${idx}`}>
                                  <td>{source}</td>
                                  <td>{flag.field}</td>
                                  <td>
                                    <span className={`badge ${meta.tone}`}>{meta.label}</span>
                                  </td>
                                  <td className="mono" style={{ fontSize: 11 }}>{flag.raw || "—"}</td>
                                  <td style={{ fontSize: 11 }}>
                                    <HowToFixTip text={flag.hint || ""} />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {contacts.length > 300 && (
              <div style={{ padding: 12, textAlign: "center", color: "var(--muted)", fontSize: 11 }}>
                Showing first 300 of {contacts.length} records. Refine your search to see more.
              </div>
            )}
            {contacts.length === 0 && (
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
