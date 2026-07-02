"use client";

import { useState } from "react";
import type { HealthFlag } from "@/lib/types";

export interface HealthEntry {
  source: string;
  id: string;
  label: string;
  flags: HealthFlag[];
}

export default function HealthPanel({ entries }: { entries: HealthEntry[] }) {
  const [open, setOpen] = useState(false);
  const total = entries.reduce((sum, e) => sum + e.flags.length, 0);

  if (total === 0) {
    return (
      <div className="panel health-panel">
        <div className="panel-title">Data Health</div>
        <p style={{ color: "var(--muted)", marginTop: 8 }}>No unparseable money values or missing dates detected.</p>
      </div>
    );
  }

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
      {open && (
        <div className="table-wrap" style={{ border: "none" }}>
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Record</th>
                <th>Field</th>
                <th>Issue</th>
                <th>Raw Value</th>
              </tr>
            </thead>
            <tbody>
              {entries.flatMap((e) =>
                e.flags.map((f, idx) => (
                  <tr key={`${e.id}-${idx}`}>
                    <td>{e.source}</td>
                    <td>{e.label}</td>
                    <td>{f.field}</td>
                    <td>
                      {f.kind === "unparseable_money" ? (
                        <span className="badge red">UNPARSEABLE</span>
                      ) : (
                        <span className="badge muted">MISSING DATE</span>
                      )}
                    </td>
                    <td className="mono">{f.raw || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
