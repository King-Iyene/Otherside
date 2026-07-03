"use client";

import { useMemo, useState } from "react";
import { formatNumber } from "@/lib/money";

export interface LeadColumn {
  key: string;
  label: string;
  get: (row: any) => any;
}

interface Props {
  rows: any[];
  columns: LeadColumn[];
  /** Given a row, return the normalized email (or "" if none). Enables dedupe toggle + unique-count badge. */
  getEmail?: (row: any) => string;
  /** Placeholder shown in the search input. */
  searchPlaceholder?: string;
  /** Optional explanation shown above the table — "N = registered unique emails; excludes duplicates". */
  howCalculated?: string;
}

export default function LeadTable({ rows, columns, getEmail, searchPlaceholder = "Search name, email, product…", howCalculated }: Props) {
  const [search, setSearch] = useState("");
  const [dedupe, setDedupe] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const uniqueCount = useMemo(() => {
    if (!getEmail) return rows.length;
    const s = new Set<string>();
    for (const r of rows) {
      const e = getEmail(r);
      if (e) s.add(e);
    }
    return s.size;
  }, [rows, getEmail]);

  const filtered = useMemo(() => {
    let out = rows;
    if (dedupe && getEmail) {
      const seen = new Set<string>();
      out = out.filter((r) => {
        const e = getEmail(r);
        if (!e) return true;
        if (seen.has(e)) return false;
        seen.add(e);
        return true;
      });
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter((r) =>
        columns.some((c) => {
          const v = c.get(r);
          return v !== null && v !== undefined && String(v).toLowerCase().includes(q);
        })
      );
    }
    return out;
  }, [rows, dedupe, search, columns, getEmail]);

  const displayed = showAll ? filtered : filtered.slice(0, 300);

  return (
    <div>
      {howCalculated && (
        <div
          style={{
            padding: "10px 12px",
            background: "var(--surface-2)",
            border: "1px solid var(--line)",
            borderRadius: 8,
            color: "var(--muted)",
            fontSize: 11,
            lineHeight: 1.5,
            marginBottom: 12,
          }}
        >
          <span style={{ color: "var(--accent)", fontWeight: 600, marginRight: 6 }}>How this is calculated:</span>
          {howCalculated}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <input
          type="text"
          className="text-input"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: "1 1 240px" }}
          autoFocus
        />
        {getEmail && (
          <label className="toggle-chip">
            <input type="checkbox" checked={dedupe} onChange={(e) => setDedupe(e.target.checked)} />
            Dedupe by email
          </label>
        )}
        <div style={{ color: "var(--muted)", fontSize: 11 }}>
          <span className="mono" style={{ color: "var(--text)", fontWeight: 600 }}>{formatNumber(rows.length)}</span> rows
          {getEmail && (
            <>
              {" "}·{" "}
              <span className="mono" style={{ color: "var(--accent)", fontWeight: 600 }}>{formatNumber(uniqueCount)}</span> unique leads
            </>
          )}
          {filtered.length !== rows.length && (
            <> · showing <span className="mono" style={{ color: "var(--text)" }}>{formatNumber(filtered.length)}</span></>
          )}
        </div>
      </div>

      <table style={{ width: "100%", fontSize: 12 }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{
                  textAlign: "left",
                  padding: "8px 12px",
                  color: "var(--muted)",
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: 0.05,
                }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayed.map((r, idx) => (
            <tr key={idx} style={{ borderTop: "1px solid var(--line)" }}>
              {columns.map((c) => {
                const v = c.get(r);
                const display =
                  v === null || v === undefined
                    ? "—"
                    : typeof v === "number"
                    ? formatNumber(v)
                    : typeof v === "boolean"
                    ? v
                      ? "yes"
                      : "no"
                    : String(v);
                return (
                  <td key={c.key} style={{ padding: "8px 12px" }} className="mono">
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {filtered.length > 300 && (
        <div style={{ padding: 12, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>
          {showAll ? (
            <button className="link-btn" onClick={() => setShowAll(false)}>
              Show fewer
            </button>
          ) : (
            <>
              Showing 300 of {formatNumber(filtered.length)} ·{" "}
              <button className="link-btn" onClick={() => setShowAll(true)}>
                Show all
              </button>
            </>
          )}
        </div>
      )}

      {filtered.length === 0 && (
        <div style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>
          No rows match your search.
        </div>
      )}
    </div>
  );
}

/** Column templates per data source — used by the Cohort Funnel drill-downs. */
export const CHALLENGE_COLS: LeadColumn[] = [
  { key: "email", label: "Email", get: (r) => firstMatchingKey(r, /email/i) },
  { key: "name", label: "Name", get: (r) => firstMatchingKey(r, /(^|_| )name/i) },
  { key: "product", label: "Product", get: (r) => r["Product"] ?? r["Challange"] ?? r["Challenge"] },
  { key: "amount", label: "Amount", get: (r) => r["Amount"] ?? r["Price"] ?? r["Revenue"] },
  { key: "coupon", label: "Coupon", get: (r) => r["Coupon"] },
];

export const APPLICATION_COLS: LeadColumn[] = [
  { key: "email", label: "Email", get: (r) => r.email },
  { key: "firstName", label: "First Name", get: (r) => r.firstName },
  { key: "lastName", label: "Last Name", get: (r) => r.lastName },
  { key: "status", label: "Application Status", get: (r) => r.applicationStatus },
  { key: "income", label: "Income Bracket", get: (r) => r.annualEarnings },
  { key: "dateCreated", label: "Applied On", get: (r) => r.dateCreated },
];

export const APPOINTMENT_COLS: LeadColumn[] = [
  { key: "email", label: "Email", get: (r) => r.email },
  { key: "name", label: "Name", get: (r) => r.name },
  { key: "status", label: "Call Status", get: (r) => r.status },
  { key: "cohort", label: "Cohort", get: (r) => r.cohort },
  { key: "enrManager", label: "Closer", get: (r) => r.enrManager },
  { key: "appointmentTime", label: "Call Time", get: (r) => r.appointmentTime },
];

export const CASH_COLS: LeadColumn[] = [
  { key: "email", label: "Email", get: (r) => r.email },
  { key: "name", label: "Name", get: (r) => r.name },
  { key: "product", label: "Product", get: (r) => r.product },
  { key: "cohort", label: "Cohort", get: (r) => r.cohort },
  { key: "revenue", label: "Deal $", get: (r) => r.revenue },
  { key: "cashCollected", label: "Cash Collected $", get: (r) => r.cashCollected },
  { key: "enrManager", label: "Closer", get: (r) => r.enrManager },
];

function firstMatchingKey(r: any, pattern: RegExp): string {
  for (const k of Object.keys(r)) if (pattern.test(k)) return String(r[k] ?? "");
  return "";
}
