"use client";

import { useMemo, useState } from "react";
import type { CashRow, TransactionType } from "@/lib/types";
import { resolveRange, inRange, type RangePreset } from "@/lib/dates";
import { uniqueSorted, matchesSearch, sum, selected } from "@/lib/filtering";
import { formatMoney, formatNumber, formatPercent } from "@/lib/money";
import Controls from "../Controls";
import KpiGrid from "../Kpi";
import DataTable, { type Column } from "../DataTable";
import MoneyCell, { DateCell } from "../MoneyCell";
import DrillDownModal from "../DrillDownModal";

const TX_COLORS: Record<string, string> = {
  Refund: "#f07070",
  Dropout: "#a0a0a0",
  Deposit: "#f5a623",
  Deferral: "#7ca0f4",
};

const TX_BADGE_STYLE: Record<string, React.CSSProperties> = {
  Refund: { background: "rgba(240,112,112,0.12)", color: "#f07070", border: "1px solid rgba(240,112,112,0.25)" },
  Dropout: { background: "rgba(160,160,160,0.12)", color: "#a0a0a0", border: "1px solid rgba(160,160,160,0.25)" },
  Deposit: { background: "rgba(245,166,35,0.12)", color: "#f5a623", border: "1px solid rgba(245,166,35,0.25)" },
  Payment: { background: "rgba(69,208,147,0.12)", color: "#45d093", border: "1px solid rgba(69,208,147,0.25)" },
};

function TxBadge({ type }: { type: TransactionType }) {
  const label = type || "—";
  const style = type ? TX_BADGE_STYLE[type] ?? {} : {};
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.3,
        ...style,
      }}
    >
      {label}
    </span>
  );
}

function personKeyOf(r: CashRow): string | null {
  const email = (r.email || "").trim().toLowerCase();
  if (email) return email;
  const name = (r.name || "").trim().toLowerCase();
  return name ? `name:${name}` : null;
}

function countUniquePeople(rows: CashRow[]): number {
  const seen = new Set<string>();
  for (const r of rows) {
    const k = personKeyOf(r);
    if (k) seen.add(k);
  }
  return seen.size;
}

export default function AdjustmentsTab({ rows }: { rows: CashRow[] }) {
  const [preset, setPreset] = useState<RangePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [cohort, setCohort] = useState<string[]>([]);
  const [enrManager, setEnrManager] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [includeTest, setIncludeTest] = useState(false);
  const [drilldown, setDrilldown] = useState<{ title: string; subtitle?: string; rows: CashRow[] } | null>(null);

  const cohorts = useMemo(() => uniqueSorted(rows.map((r) => r.cohort)), [rows]);
  const managers = useMemo(() => uniqueSorted(rows.map((r) => r.enrManager)), [rows]);

  const { from, to } = resolveRange(preset, customFrom, customTo);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (!includeTest && r.isTest) return false;
      if (!inRange(r.enrollmentDate, from, to)) return false;
      if (!selected(cohort, r.cohort)) return false;
      if (!selected(enrManager, r.enrManager)) return false;
      if (!matchesSearch([r.name, r.email, r.note], search)) return false;
      return true;
    });
  }, [rows, from, to, cohort, enrManager, search, includeTest]);

  // Split by transaction type
  const payments = useMemo(() => filtered.filter((r) => !r.transactionType || r.transactionType === "Payment"), [filtered]);
  const refunds = useMemo(() => filtered.filter((r) => r.transactionType === "Refund"), [filtered]);
  const deposits = useMemo(() => filtered.filter((r) => r.transactionType === "Deposit"), [filtered]);
  const dropouts = useMemo(() => filtered.filter((r) => r.transactionType === "Dropout"), [filtered]);

  // Gross = all payments + deposits (positive transactions)
  const grossRevenue = sum(payments.map((r) => r.revenue)) + sum(deposits.map((r) => r.revenue));
  const grossCash = sum(payments.map((r) => r.cashCollected)) + sum(deposits.map((r) => r.cashCollected));

  // Refunded amounts (these rows capture what was reversed)
  const refundedRevenue = sum(refunds.map((r) => r.revenue));
  const refundedCash = sum(refunds.map((r) => r.cashCollected));

  // Dropout amounts
  const dropoutRevenue = sum(dropouts.map((r) => r.revenue));
  const dropoutCash = sum(dropouts.map((r) => r.cashCollected));

  // Net = gross - refunded ONLY. Dropouts kept the money (no refund issued).
  const netRevenue = grossRevenue - refundedRevenue;
  const netCash = grossCash - refundedCash;

  const refundedPeopleCount = countUniquePeople(refunds);
  const dropoutPeopleCount = countUniquePeople(dropouts);
  const depositPeopleCount = countUniquePeople(deposits);

  const totalAdjustmentRows = refunds.length + dropouts.length;
  const refundRate = grossRevenue > 0 ? refundedRevenue / grossRevenue : null;

  // Waterfall data for the flow visualization
  const waterfallSegments = [
    { label: "Gross Revenue", value: grossRevenue, color: "#45d093", type: "positive" as const },
    { label: "Refunds", value: -refundedRevenue, color: "#f07070", type: "negative" as const },
    { label: "Net Revenue", value: netRevenue, color: "#7ca0f4", type: "total" as const },
  ];

  const waterfallCashSegments = [
    { label: "Gross Cash", value: grossCash, color: "#45d093", type: "positive" as const },
    { label: "Refunded Cash", value: -refundedCash, color: "#f07070", type: "negative" as const },
    { label: "Net Cash", value: netCash, color: "#7ca0f4", type: "total" as const },
  ];

  const columns: Column<CashRow>[] = [
    { key: "name", label: "Name", render: (r) => r.name, sortValue: (r) => r.name },
    { key: "email", label: "Email", render: (r) => r.email || "—", sortValue: (r) => r.email },
    {
      key: "transactionType",
      label: "Type",
      render: (r) => <TxBadge type={r.transactionType} />,
      sortValue: (r) => r.transactionType,
    },
    { key: "cohort", label: "Cohort", render: (r) => r.cohort || "—", sortValue: (r) => r.cohort },
    {
      key: "enrollmentDate",
      label: "Date",
      render: (r) => <DateCell value={r.enrollmentDate} field="Payment Date" health={r.health} />,
      sortValue: (r) => r.enrollmentDate,
    },
    {
      key: "revenue",
      label: "Revenue",
      render: (r) => <MoneyCell value={r.revenue} field="Revenue" health={r.health} />,
      sortValue: (r) => r.revenue,
    },
    {
      key: "cashCollected",
      label: "Cash",
      render: (r) => <MoneyCell value={r.cashCollected} field="Cash Collected" health={r.health} />,
      sortValue: (r) => r.cashCollected,
    },
    { key: "product", label: "Product", render: (r) => r.product || "—", sortValue: (r) => r.product },
    { key: "enrManager", label: "Enr Manager", render: (r) => r.enrManager || "—", sortValue: (r) => r.enrManager },
    { key: "note", label: "Note", render: (r) => r.note || "—" },
  ];

  const openDrilldown = (title: string, subtitle: string | undefined, subset: CashRow[]) =>
    setDrilldown({ title, subtitle, rows: subset });

  return (
    <div>
      {/* Header */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(240,112,112,0.06), rgba(124,160,244,0.06))",
          border: "1px solid var(--line)",
          borderRadius: 14,
          padding: "18px 20px",
          marginBottom: 16,
        }}
      >
        <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600 }}>
          Refunds, Deferrals & Adjustments
        </div>
        <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4, maxWidth: 720, lineHeight: 1.5 }}>
          Non-destructive adjustment tracking. Original revenue and cash stay intact — refunds, dropouts, and deferrals
          are separate records so you always see gross vs net. Ops records adjustments; closers flag them.
        </div>
      </div>

      <Controls
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
        dimensions={[
          { key: "cohort", label: "Cohort", options: cohorts, value: cohort, onChange: setCohort },
          { key: "enrManager", label: "Enr Manager", options: managers, value: enrManager, onChange: setEnrManager },
        ]}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name, email, note…"
        includeTest={includeTest}
        onIncludeTestChange={setIncludeTest}
      />

      {/* Gross → Net KPIs */}
      <KpiGrid
        items={[
          {
            label: "Gross Revenue",
            value: formatMoney(grossRevenue),
            source: { source: "Reborn Cash Tracker", field: "Revenue", formula: "SUM(Revenue) for Payment + Deposit rows" },
            hint: "Before any adjustments",
            hintColor: "green",
            onClick: () => openDrilldown("Gross Revenue — Payments & Deposits", undefined, [...payments, ...deposits]),
          },
          {
            label: "Refunded Revenue",
            value: formatMoney(refundedRevenue),
            source: { source: "Reborn Cash Tracker", field: "Revenue", formula: "SUM(Revenue) for Refund rows" },
            higherIsBetter: false,
            hint: refundRate !== null ? `${(refundRate * 100).toFixed(1)}% of gross` : undefined,
            hintColor: "red",
            onClick: () => openDrilldown("Refunded Revenue", `${refundedPeopleCount} people · ${refunds.length} rows`, refunds),
          },
          {
            label: "Net Revenue",
            value: formatMoney(netRevenue),
            source: { source: "Derived", field: "Gross − Refunds", formula: "Gross Revenue − Refunded Revenue" },
            hint: grossRevenue > 0 ? `${((netRevenue / grossRevenue) * 100).toFixed(0)}% retained` : undefined,
            hintColor: netRevenue >= grossRevenue * 0.9 ? "green" : "red",
          },
          {
            label: "Net Cash",
            value: formatMoney(netCash),
            source: { source: "Derived", field: "Gross Cash − Refunded Cash" },
            hint: grossCash > 0 ? `${((netCash / grossCash) * 100).toFixed(0)}% retained` : undefined,
            hintColor: netCash >= grossCash * 0.9 ? "green" : "muted",
          },
          {
            label: "Refunded People",
            value: formatNumber(refundedPeopleCount),
            source: { source: "Reborn Cash Tracker", field: "Unique people with Transaction Type = Refund" },
            higherIsBetter: false,
            onClick: () => openDrilldown("Refunded People", `${refunds.length} refund rows`, refunds),
          },
          {
            label: "Dropouts",
            value: formatNumber(dropoutPeopleCount),
            source: { source: "Reborn Cash Tracker", field: "Unique people with Transaction Type = Dropout" },
            higherIsBetter: false,
            onClick: () => openDrilldown("Dropouts", `${dropouts.length} dropout rows`, dropouts),
          },
          {
            label: "Deposits",
            value: formatNumber(depositPeopleCount),
            source: { source: "Reborn Cash Tracker", field: "Unique people with Transaction Type = Deposit" },
            hint: `${formatMoney(sum(deposits.map((r) => r.cashCollected)))} collected`,
            onClick: () => openDrilldown("Deposits", `${deposits.length} deposit rows`, deposits),
          },
          {
            label: "Total Adjustments",
            value: formatNumber(totalAdjustmentRows),
            source: { source: "Reborn Cash Tracker", field: "COUNT(Refund rows) + COUNT(Dropout rows)" },
            hint: totalAdjustmentRows === 0 ? "Clean slate" : undefined,
            hintColor: totalAdjustmentRows === 0 ? "green" : "muted",
          },
        ]}
      />

      {/* Revenue Waterfall */}
      <div className="chart-grid">
        <WaterfallChart title="Revenue Flow: Gross → Net" segments={waterfallSegments} />
        <WaterfallChart title="Cash Flow: Gross → Net" segments={waterfallCashSegments} />
      </div>

      {/* Operating lists by adjustment type */}
      <div className="chart-grid">
        <AdjustmentList
          title="Refunds"
          subtitle={`${refundedPeopleCount} people · ${formatMoney(refundedCash)} cash refunded`}
          rows={refunds}
          color="#f07070"
          emptyMessage="No refunds recorded this period."
          onViewAll={() => openDrilldown("All Refunds", undefined, refunds)}
        />
        <AdjustmentList
          title="Dropouts"
          subtitle={`${dropoutPeopleCount} people · money kept (no refund)`}
          rows={dropouts}
          color="#a0a0a0"
          emptyMessage="No dropouts recorded this period."
          onViewAll={() => openDrilldown("All Dropouts", undefined, dropouts)}
        />
      </div>

      {deposits.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <AdjustmentList
            title="Deposits"
            subtitle={`${depositPeopleCount} people · ${formatMoney(sum(deposits.map((r) => r.cashCollected)))} collected`}
            rows={deposits}
            color="#f5a623"
            emptyMessage="No deposits recorded."
            onViewAll={() => openDrilldown("All Deposits", undefined, deposits)}
          />
        </div>
      )}

      {/* Per-cohort adjustment breakdown */}
      {cohorts.length > 0 && (
        <CohortAdjustmentTable
          cohorts={cohorts}
          filtered={filtered}
          refunds={refunds}
          dropouts={dropouts}
          deposits={deposits}
          onDrilldown={openDrilldown}
        />
      )}

      {/* Footer: view all adjustments */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: 12,
          padding: "14px 18px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ color: "var(--muted)", fontSize: 12 }}>
          <strong style={{ color: "var(--text)" }}>{formatNumber(filtered.length)}</strong> total rows
          {" · "}
          <strong style={{ color: "#f07070" }}>{refunds.length}</strong> refunds
          {" · "}
          <strong style={{ color: "#a0a0a0" }}>{dropouts.length}</strong> dropouts
          {" · "}
          <strong style={{ color: "#f5a623" }}>{deposits.length}</strong> deposits
        </div>
        <button
          className="link-btn"
          onClick={() => openDrilldown("All Adjustment Records", undefined, [...refunds, ...dropouts, ...deposits])}
        >
          View all adjustments →
        </button>
      </div>

      <DrillDownModal
        open={!!drilldown}
        onClose={() => setDrilldown(null)}
        title={drilldown?.title || ""}
        subtitle={drilldown ? drilldown.subtitle || `${drilldown.rows.length} rows` : ""}
      >
        <DataTable
          columns={columns}
          rows={drilldown?.rows || []}
          rowKey={(r) => r.id}
          isTestRow={(r) => r.isTest}
          searchable
          searchPlaceholder="Search name, email, cohort…"
        />
      </DrillDownModal>
    </div>
  );
}

// ── Waterfall chart ──────────────────────────────────────────────

interface WaterfallSegment {
  label: string;
  value: number;
  color: string;
  type: "positive" | "negative" | "total";
}

function WaterfallChart({ title, segments }: { title: string; segments: WaterfallSegment[] }) {
  const maxAbs = Math.max(1, ...segments.map((s) => Math.abs(s.value)));

  let runningTotal = 0;
  const bars = segments.map((seg) => {
    if (seg.type === "total") {
      const bar = { ...seg, startPct: 0, widthPct: Math.max(2, (Math.abs(seg.value) / maxAbs) * 100) };
      return bar;
    }
    const prev = runningTotal;
    runningTotal += seg.value;
    const startPct = seg.type === "positive" ? 0 : (Math.abs(prev + seg.value) / maxAbs) * 100;
    return {
      ...seg,
      startPct: seg.type === "negative" ? Math.max(0, ((prev + seg.value) / maxAbs) * 100) : 0,
      widthPct: Math.max(2, (Math.abs(seg.value) / maxAbs) * 100),
    };
  });

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">{title}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "4px 0" }}>
        {bars.map((bar) => (
          <div key={bar.label}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: "var(--text)", fontWeight: bar.type === "total" ? 600 : 400 }}>{bar.label}</span>
              <span className="mono" style={{ color: bar.color, fontWeight: 600 }}>
                {bar.type === "negative" ? "−" : ""}
                {formatMoney(Math.abs(bar.value))}
              </span>
            </div>
            <div
              style={{
                height: 24,
                background: "var(--bg)",
                borderRadius: 6,
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: `${bar.startPct}%`,
                  width: `${bar.widthPct}%`,
                  height: "100%",
                  background: bar.type === "negative"
                    ? `repeating-linear-gradient(135deg, ${bar.color}22, ${bar.color}22 4px, ${bar.color}33 4px, ${bar.color}33 8px)`
                    : bar.color,
                  opacity: bar.type === "total" ? 1 : 0.85,
                  borderRadius: 6,
                  transition: "width 0.4s ease",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Operating list for a specific adjustment type ────────────────

function AdjustmentList({
  title,
  subtitle,
  rows,
  color,
  emptyMessage,
  onViewAll,
}: {
  title: string;
  subtitle: string;
  rows: CashRow[];
  color: string;
  emptyMessage: string;
  onViewAll: () => void;
}) {
  const sorted = useMemo(
    () => [...rows].sort((a, b) => ((b.enrollmentDate || "") > (a.enrollmentDate || "") ? 1 : -1)),
    [rows]
  );
  const preview = sorted.slice(0, 5);

  return (
    <div className="panel">
      <div className="panel-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: color,
              flexShrink: 0,
            }}
          />
          <div className="panel-title">{title}</div>
        </div>
        <span style={{ color: "var(--muted)", fontSize: 11 }}>{subtitle}</span>
      </div>

      {rows.length === 0 ? (
        <div style={{ color: "var(--muted)", fontSize: 12, padding: "16px 0", textAlign: "center" }}>
          {emptyMessage}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {preview.map((r) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 0",
                  borderBottom: "1px solid var(--line)",
                  gap: 8,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.name || "—"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>
                    {r.cohort || "No cohort"} · {r.enrollmentDate?.slice(0, 10) || "No date"}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div className="mono" style={{ fontSize: 13, color, fontWeight: 600 }}>
                    {formatMoney(r.cashCollected)}
                  </div>
                  {r.revenue !== null && r.revenue !== r.cashCollected && (
                    <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
                      rev {formatMoney(r.revenue)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {rows.length > 5 && (
            <button
              className="link-btn"
              onClick={onViewAll}
              style={{ marginTop: 8, fontSize: 12 }}
            >
              View all {rows.length} →
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── Cohort adjustment breakdown ──────────────────────────────────

function CohortAdjustmentTable({
  cohorts,
  filtered,
  refunds,
  dropouts,
  deposits,
  onDrilldown,
}: {
  cohorts: string[];
  filtered: CashRow[];
  refunds: CashRow[];
  dropouts: CashRow[];
  deposits: CashRow[];
  onDrilldown: (title: string, subtitle: string | undefined, rows: CashRow[]) => void;
}) {
  const data = useMemo(() => {
    return cohorts
      .map((c) => {
        const cRows = filtered.filter((r) => r.cohort === c);
        const cPayments = cRows.filter((r) => !r.transactionType || r.transactionType === "Payment");
        const cDeposits = cRows.filter((r) => r.transactionType === "Deposit");
        const cRefunds = refunds.filter((r) => r.cohort === c);
        const cDropouts = dropouts.filter((r) => r.cohort === c);

        const grossRev = sum(cPayments.map((r) => r.revenue)) + sum(cDeposits.map((r) => r.revenue));
        const refundRev = sum(cRefunds.map((r) => r.revenue));
        const dropoutRev = sum(cDropouts.map((r) => r.revenue));
        const netRev = grossRev - refundRev;
        const grossCash = sum(cPayments.map((r) => r.cashCollected)) + sum(cDeposits.map((r) => r.cashCollected));
        const refundCash = sum(cRefunds.map((r) => r.cashCollected));
        const netCash = grossCash - refundCash;

        return {
          cohort: c,
          grossRev,
          refundRev,
          dropoutRev,
          netRev,
          grossCash,
          refundCash,
          netCash,
          refundCount: cRefunds.length,
          dropoutCount: cDropouts.length,
          depositCount: cDeposits.length,
          rows: cRows,
          refundRows: cRefunds,
        };
      })
      .filter((d) => d.grossRev > 0 || d.refundCount > 0 || d.dropoutCount > 0)
      .sort((a, b) => b.grossRev - a.grossRev);
  }, [cohorts, filtered, refunds, dropouts, deposits]);

  if (!data.length) return null;

  return (
    <div className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-header">
        <div className="panel-title">Adjustments by Cohort</div>
        <span style={{ color: "var(--muted)", fontSize: 11 }}>Click a cohort to drill down</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="leaderboard">
          <thead>
            <tr>
              <th>Cohort</th>
              <th>Gross Rev</th>
              <th>Refunds</th>
              <th>Dropouts</th>
              <th>Net Rev</th>
              <th>Net Cash</th>
              <th>Refund %</th>
              <th>Adj Count</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => {
              const refPct = d.grossRev > 0 ? d.refundRev / d.grossRev : 0;
              return (
                <tr
                  key={d.cohort}
                  onClick={() => onDrilldown(`Cohort: ${d.cohort} — Adjustments`, undefined, d.rows)}
                  style={{ cursor: "pointer" }}
                >
                  <td style={{ color: "var(--text)", fontWeight: 500 }}>{d.cohort} →</td>
                  <td className="mono">{formatMoney(d.grossRev)}</td>
                  <td className="mono" style={{ color: d.refundRev > 0 ? "#f07070" : "var(--muted)" }}>
                    {d.refundRev > 0 ? `−${formatMoney(d.refundRev)}` : "—"}
                  </td>
                  <td className="mono" style={{ color: d.dropoutRev > 0 ? "#a0a0a0" : "var(--muted)" }}>
                    {d.dropoutRev > 0 ? `−${formatMoney(d.dropoutRev)}` : "—"}
                  </td>
                  <td className="mono" style={{ fontWeight: 600 }}>{formatMoney(d.netRev)}</td>
                  <td className="mono">{formatMoney(d.netCash)}</td>
                  <td className="mono" style={{ color: refPct > 0.1 ? "#f07070" : "var(--muted)" }}>
                    {refPct > 0 ? formatPercent(refPct) : "—"}
                  </td>
                  <td className="mono" style={{ fontSize: 11 }}>
                    {d.refundCount > 0 && <span style={{ color: "#f07070" }}>{d.refundCount}R</span>}
                    {d.refundCount > 0 && d.dropoutCount > 0 && " "}
                    {d.dropoutCount > 0 && <span style={{ color: "#a0a0a0" }}>{d.dropoutCount}D</span>}
                    {d.depositCount > 0 && <span style={{ color: "#f5a623" }}> {d.depositCount}$</span>}
                    {d.refundCount === 0 && d.dropoutCount === 0 && d.depositCount === 0 && "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
