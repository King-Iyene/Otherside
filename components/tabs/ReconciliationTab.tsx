"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReconciliationReport, ReconciliationRow, Verdict } from "@/lib/reconciliation";
import { formatMoney, formatNumber, formatPercent } from "@/lib/money";

const VERDICT_META: Record<
  Verdict,
  { label: string; emoji: string; color: string; tone: "green" | "amber" | "red" | "muted" | "blue" }
> = {
  MATCHED_EXACT: { label: "Matched (exact)", emoji: "✅", color: "var(--green)", tone: "green" },
  MATCHED_LOOSE: { label: "Matched (dates diverge)", emoji: "☑️", color: "var(--green)", tone: "green" },
  MATCHED_FEE: { label: "Matched (fee tolerance)", emoji: "☑️", color: "var(--blue)", tone: "blue" },
  AMOUNT_MISMATCH: { label: "Amount mismatch", emoji: "⚠️", color: "#f2b63c", tone: "amber" },
  REFUND_UNRECORDED: { label: "Refund not recorded", emoji: "↩️", color: "#f2b63c", tone: "amber" },
  NO_STRIPE_CHARGE: { label: "No Stripe charge", emoji: "🔴", color: "var(--red)", tone: "red" },
  STRIPE_ONLY: { label: "Stripe-only (missing enrollment)", emoji: "🕳️", color: "var(--red)", tone: "red" },
};

const VERDICT_ORDER: Verdict[] = [
  "AMOUNT_MISMATCH",
  "REFUND_UNRECORDED",
  "STRIPE_ONLY",
  "NO_STRIPE_CHARGE",
  "MATCHED_FEE",
  "MATCHED_LOOSE",
  "MATCHED_EXACT",
];

export default function ReconciliationTab() {
  const [report, setReport] = useState<ReconciliationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Verdict | "all">("AMOUNT_MISMATCH");
  const [search, setSearch] = useState("");

  const load = useCallback(async (fresh: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reconciliation${fresh ? "?fresh=1" : ""}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
      const json: ReconciliationReport = await res.json();
      setReport(json);
    } catch (err: any) {
      setError(err?.message || "Failed to load reconciliation report.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  const filtered = useMemo(() => {
    if (!report) return [];
    const s = search.trim().toLowerCase();
    return report.rows.filter((r) => {
      if (filter !== "all" && r.verdict !== filter) return false;
      if (!s) return true;
      const hay = [
        r.cashRow?.email,
        r.cashRow?.name,
        r.cashRow?.product,
        r.stripeCharge?.email,
        r.stripeCharge?.description,
        r.stripeCharge?.productHint,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(s);
    });
  }, [report, filter, search]);

  if (loading && !report) {
    return <div className="empty-state">Reconciling Cash Tracker with Stripe…</div>;
  }

  if (error) {
    return <div className="error-banner">Reconciliation failed: {error}</div>;
  }

  if (!report) {
    return <div className="empty-state">Loading…</div>;
  }

  if (report.error) {
    return (
      <div className="panel" style={{ padding: 24 }}>
        <div className="panel-title" style={{ marginBottom: 8 }}>Reconciliation unavailable</div>
        <p style={{ color: "var(--muted)" }}>{report.error}</p>
        <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 12 }}>
          Add a <code>STRIPE_SECRET_KEY</code> (Restricted Key, Read-only) in your Vercel project's Environment Variables to enable this tab.
        </p>
      </div>
    );
  }

  const s = report.summary;

  return (
    <div>
      {/* Hero + summary */}
      <div className="insights-hero" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, flexWrap: "wrap" }}>
          <div>
            <div className="gradient-text" style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700 }}>
              Reconciliation
            </div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6, lineHeight: 1.5, maxWidth: 720 }}>
              Compares every Cash Tracker row against Stripe. Read-only —
              never writes back. Stripe is treated as the payment truth; the Cash
              Tracker is treated as the sales context (closer, cohort, coupon).
            </div>
            <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 8 }}>
              Stripe mode: <span style={{ color: report.mode === "live" ? "var(--green)" : "var(--blue)", fontWeight: 600 }}>{report.mode.toUpperCase()}</span> ·
              Last synced {new Date(report.fetchedAt).toLocaleString()}
            </div>
          </div>
          <button className="refresh-btn" onClick={() => load(true)} disabled={loading}>
            {loading ? "Syncing…" : "Re-sync"}
          </button>
        </div>

        {/* KPI strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginTop: 18 }}>
          <KpiCard label="Cash Tracker Total" value={formatMoney(s.cashTrackerTotalCents / 100)} tone="text" />
          <KpiCard label="Stripe Collected" value={formatMoney(s.stripeCollectedCents / 100)} tone="green" />
          <KpiCard label="Stripe Refunded" value={formatMoney(s.stripeRefundedCents / 100)} tone="red" />
          <KpiCard
            label="Coverage"
            value={s.coverageRatio !== null ? formatPercent(s.coverageRatio) : "—"}
            tone={s.coverageRatio !== null && Math.abs(1 - s.coverageRatio) < 0.05 ? "green" : "amber"}
            hint="Cash Tracker ÷ Stripe. 100% = perfect agreement."
          />
        </div>
      </div>

      {/* Verdict filter chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        <FilterChip label={`All (${report.rows.length})`} active={filter === "all"} onClick={() => setFilter("all")} />
        {VERDICT_ORDER.map((v) => {
          const count = report.rows.filter((r) => r.verdict === v).length;
          if (count === 0) return null;
          const meta = VERDICT_META[v];
          return (
            <FilterChip
              key={v}
              label={`${meta.emoji} ${meta.label} (${count})`}
              active={filter === v}
              tone={meta.tone}
              onClick={() => setFilter(v)}
            />
          );
        })}
      </div>

      {/* Search */}
      <input
        type="text"
        className="text-input"
        placeholder="Search by name, email, product…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ width: "100%", marginBottom: 12 }}
      />

      {/* Table */}
      <div className="panel" style={{ padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", fontSize: 12 }}>
          <thead>
            <tr>
              <Th>Verdict</Th>
              <Th>Person</Th>
              <Th>Cash Tracker</Th>
              <Th>Stripe</Th>
              <Th>Delta</Th>
              <Th>Signal & Notes</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 500).map((r, idx) => (
              <ReconciliationRowView key={idx} row={r} />
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
            No rows match this filter.
          </div>
        )}
        {filtered.length > 500 && (
          <div style={{ padding: 12, textAlign: "center", color: "var(--muted)", fontSize: 11 }}>
            Showing first 500 of {filtered.length}. Refine the search to see more.
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────

function KpiCard({ label, value, tone, hint }: { label: string; value: string; tone: "text" | "green" | "amber" | "red"; hint?: string }) {
  const color = tone === "green" ? "var(--green)" : tone === "amber" ? "#f2b63c" : tone === "red" ? "var(--red)" : "var(--text)";
  return (
    <div
      style={{
        padding: "14px 16px",
        background: "var(--surface-2)",
        border: "1px solid var(--line)",
        borderRadius: 10,
      }}
      title={hint}
    >
      <div style={{ color: "var(--muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.08 }}>{label}</div>
      <div className="mono" style={{ color, fontSize: 20, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function FilterChip({ label, active, onClick, tone }: { label: string; active: boolean; onClick: () => void; tone?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`preset-btn ${active ? "active" : ""}`}
      style={{ fontSize: 11 }}
    >
      {label}
    </button>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{
      textAlign: "left",
      padding: "10px 14px",
      color: "var(--muted)",
      fontSize: 10,
      textTransform: "uppercase",
      letterSpacing: 0.05,
      borderBottom: "1px solid var(--line)",
    }}>
      {children}
    </th>
  );
}

function ReconciliationRowView({ row }: { row: ReconciliationRow }) {
  const meta = VERDICT_META[row.verdict];
  const cash = row.cashRow;
  const stripe = row.stripeCharge;
  return (
    <tr style={{ borderBottom: "1px solid var(--line)" }}>
      <td style={{ padding: "10px 14px", verticalAlign: "top" }}>
        <span className={`badge ${meta.tone}`}>{meta.emoji} {meta.label}</span>
      </td>
      <td style={{ padding: "10px 14px", verticalAlign: "top" }}>
        <div style={{ fontWeight: 500 }}>{cash?.name || stripe?.email || "(unknown)"}</div>
        <div style={{ color: "var(--muted)", fontSize: 11 }} className="mono">
          {cash?.email || stripe?.email || "—"}
        </div>
      </td>
      <td style={{ padding: "10px 14px", verticalAlign: "top" }}>
        {cash ? (
          <>
            <div className="mono" style={{ fontWeight: 600 }}>{formatMoney(cash.cashCollected ?? 0)}</div>
            <div style={{ color: "var(--muted)", fontSize: 11 }}>
              {cash.product || "—"} · {cash.enrollmentDate || "—"}
            </div>
            {cash.couponCode && (
              <div style={{ color: "var(--muted)", fontSize: 11 }}>Coupon: {cash.couponCode}</div>
            )}
          </>
        ) : (
          <span style={{ color: "var(--muted)" }}>—</span>
        )}
      </td>
      <td style={{ padding: "10px 14px", verticalAlign: "top" }}>
        {stripe ? (
          <>
            <div className="mono" style={{ fontWeight: 600 }}>{formatMoney(stripe.netCollected / 100)}</div>
            <div style={{ color: "var(--muted)", fontSize: 11 }}>
              {new Date(stripe.createdAt).toLocaleDateString()}
              {stripe.amountRefunded > 0 && (
                <> · <span style={{ color: "var(--red)" }}>refund {formatMoney(stripe.amountRefunded / 100)}</span></>
              )}
            </div>
            {stripe.productHint && (
              <div style={{ color: "var(--muted)", fontSize: 11 }}>Product: {stripe.productHint}</div>
            )}
            {stripe.couponHint && (
              <div style={{ color: "var(--muted)", fontSize: 11 }}>Coupon: {stripe.couponHint}</div>
            )}
            {stripe.receiptUrl && (
              <a href={stripe.receiptUrl} target="_blank" rel="noreferrer" style={{ color: "var(--blue)", fontSize: 11 }}>
                Receipt →
              </a>
            )}
          </>
        ) : (
          <span style={{ color: "var(--muted)" }}>—</span>
        )}
      </td>
      <td style={{ padding: "10px 14px", verticalAlign: "top" }} className="mono">
        {row.deltaCents !== null ? (
          <span style={{ color: row.deltaCents === 0 ? "var(--muted)" : row.deltaCents > 0 ? "var(--red)" : "var(--blue)" }}>
            {row.deltaCents === 0 ? "$0" : (row.deltaCents > 0 ? "+" : "") + formatMoney(row.deltaCents / 100)}
          </span>
        ) : (
          <span style={{ color: "var(--muted)" }}>—</span>
        )}
      </td>
      <td style={{ padding: "10px 14px", verticalAlign: "top", color: "var(--muted)", fontSize: 11, maxWidth: 380 }}>
        <div>{row.matchSignal}</div>
        {row.notes.map((n, i) => (
          <div key={i} style={{ marginTop: 4 }}>• {n}</div>
        ))}
      </td>
    </tr>
  );
}
