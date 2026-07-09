"use client";

import { useMemo, useState } from "react";
import type { CashRow } from "@/lib/types";
import { detectPaymentAnomalies, PAYMENT_ANOMALY_LABELS, type PaymentAnomaly } from "@/lib/paymentAnomalies";
import { formatMoney } from "@/lib/money";
import { REBORN_CASH_URL } from "@/lib/sourceLinks";
import InfoTip from "./InfoTip";
import CopyEmail from "./CopyEmail";

/**
 * Payment Anomalies — cross-row, per-person checks the row-level Data Health
 * panel can't do: plan totals that don't reconcile, recurring installments
 * tagged to the wrong cohort, overdue/missing payments, and duplicate rows.
 */
export default function PaymentAnomalies({ rows, includeTest }: { rows: CashRow[]; includeTest: boolean }) {
  const [openPerson, setOpenPerson] = useState<Set<string>>(new Set());
  const anomalies = useMemo(() => detectPaymentAnomalies(rows, { includeTest }), [rows, includeTest]);

  const byPerson = useMemo(() => {
    const map = new Map<string, { person: string; email: string | null; items: PaymentAnomaly[] }>();
    for (const a of anomalies) {
      const key = (a.email || a.person).toLowerCase();
      const g = map.get(key) || { person: a.person, email: a.email, items: [] };
      g.items.push(a);
      map.set(key, g);
    }
    return Array.from(map.entries())
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.items.length - a.items.length || a.person.localeCompare(b.person));
  }, [anomalies]);

  const byKind = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of anomalies) m.set(a.kind, (m.get(a.kind) ?? 0) + 1);
    return m;
  }, [anomalies]);

  const toggle = (key: string) =>
    setOpenPerson((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (anomalies.length === 0) {
    return (
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-header">
          <div className="panel-title">
            Payment Anomalies{" "}
            <InfoTip
              text={
                "Cross-checks each buyer's payment plan across all their rows: does the money add up to the stated plan total? Are recurring installments tagged to the right cohort? Is a scheduled payment overdue? Are there duplicate rows? Nothing here means every payment plan reconciles."
              }
            />
          </div>
        </div>
        <p style={{ color: "var(--muted)", marginTop: 8, fontSize: 13 }}>
          ✓ No payment anomalies — every plan reconciles, no overdue or duplicate rows detected.
        </p>
      </div>
    );
  }

  return (
    <div className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-header">
        <div className="panel-title">
          Payment Anomalies — <span style={{ color: "var(--red)" }}>{anomalies.length}</span>{" "}
          <InfoTip
            text={
              "Cross-checks each buyer's payment plan across all their rows: does the money add up to the stated plan total? Are recurring installments tagged to the right cohort? Is a scheduled payment overdue? Are there duplicate rows? Click a person to see the details and the rows involved."
            }
          />
        </div>
      </div>

      {/* kind summary */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "10px 0 4px" }}>
        {Array.from(byKind.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([kind, count]) => {
            const meta = PAYMENT_ANOMALY_LABELS[kind as keyof typeof PAYMENT_ANOMALY_LABELS];
            return (
              <span key={kind} style={{ fontSize: 11, color: "var(--muted)" }}>
                <span className={`badge ${meta.tone}`} style={{ marginRight: 6 }}>
                  {meta.label}
                </span>
                {count}
              </span>
            );
          })}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
        {byPerson.map((p) => {
          const isOpen = openPerson.has(p.key);
          const count = p.items.length;
          const multi = count > 1;
          return (
            <div key={p.key} style={{ border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden", background: "var(--surface)" }}>
              <button
                type="button"
                onClick={() => toggle(p.key)}
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
                <span style={{ color: "var(--muted)", fontSize: 12, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s ease" }}>
                  ▸
                </span>
                <span
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
                <span style={{ fontWeight: 600, color: "var(--text)", flex: 1, display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {p.person}
                  {p.email && (
                    <span onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex" }}>
                      <CopyEmail email={p.email} size={11} />
                    </span>
                  )}
                </span>
                <span style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {Array.from(new Set(p.items.map((it) => it.kind))).map((kind) => {
                    const meta = PAYMENT_ANOMALY_LABELS[kind];
                    return (
                      <span key={kind} className={`badge ${meta.tone}`} style={{ fontSize: 9 }}>
                        {meta.label}
                      </span>
                    );
                  })}
                </span>
              </button>
              {isOpen && (
                <div style={{ borderTop: "1px solid var(--line)", padding: "10px 14px 12px 40px", display: "flex", flexDirection: "column", gap: 12 }}>
                  <a
                    href={REBORN_CASH_URL}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{ color: "var(--accent)", fontSize: 12, fontWeight: 600, textDecoration: "none" }}
                  >
                    Open “Reborn Cash Tracker” in Notion ↗
                  </a>
                  {p.items.map((a, i) => {
                    const meta = PAYMENT_ANOMALY_LABELS[a.kind];
                    return (
                      <div key={i}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span className={`badge ${meta.tone}`}>{meta.label}</span>
                        </div>
                        <div style={{ color: "var(--text-dim)", fontSize: 12.5, lineHeight: 1.55 }}>{a.detail}</div>
                        {a.rows.length > 0 && (
                          <div className="table-wrap" style={{ border: "none", marginTop: 6 }}>
                            <table>
                              <thead>
                                <tr>
                                  <th>Enrollment Date</th>
                                  <th>Cohort</th>
                                  <th>Product</th>
                                  <th>Revenue</th>
                                  <th>Cash</th>
                                  <th>Next Payment</th>
                                </tr>
                              </thead>
                              <tbody>
                                {a.rows.map((r) => (
                                  <tr key={r.id}>
                                    <td>{r.enrollmentDate || "—"}</td>
                                    <td>{r.cohort || "—"}</td>
                                    <td style={{ fontSize: 11, maxWidth: 260 }}>{r.product || "—"}</td>
                                    <td className="mono">{formatMoney(r.revenue)}</td>
                                    <td className="mono">{formatMoney(r.cashCollected)}</td>
                                    <td>{r.nextPaymentDate || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
