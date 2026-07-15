"use client";

import { useMemo, useState } from "react";
import type { CashRow, MasterCrmRow, TransactionType } from "@/lib/types";
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

export default function AdjustmentsTab({ rows, masterCrm }: { rows: CashRow[]; masterCrm: MasterCrmRow[] }) {
  const [preset, setPreset] = useState<RangePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [cohort, setCohort] = useState<string[]>([]);
  const [enrManager, setEnrManager] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [includeTest, setIncludeTest] = useState(false);
  const [drilldown, setDrilldown] = useState<{ title: string; subtitle?: string; rows: CashRow[] } | null>(null);
  // CRM drilldown is separate — MasterCrmRow has a different column shape
  // (no per-transaction fields; totals + lifecycle checkboxes instead).
  const [crmDrilldown, setCrmDrilldown] = useState<{ title: string; rows: MasterCrmRow[] } | null>(null);

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

  // Split by transaction type (Cash Tracker — source of truth for refunds/dropouts)
  const payments = useMemo(() => filtered.filter((r) => !r.transactionType || r.transactionType === "Payment"), [filtered]);
  const refunds = useMemo(() => filtered.filter((r) => r.transactionType === "Refund"), [filtered]);
  const deposits = useMemo(() => filtered.filter((r) => r.transactionType === "Deposit"), [filtered]);
  const dropouts = useMemo(() => filtered.filter((r) => r.transactionType === "Dropout"), [filtered]);

  // Master CRM — deferrals + plan changes are lifecycle events tracked there,
  // not in Cash Tracker (no $ moved, so no CT row). Apply the same date /
  // cohort / search / test filters as CashRow. enrManager isn't on CRM rows,
  // so it's skipped for CRM (adding it would exclude every CRM row when a
  // manager is selected).
  const filteredCrm = useMemo(() => {
    return masterCrm.filter((r) => {
      if (!includeTest && r.isTest) return false;
      if (!inRange(r.enrollmentDate, from, to)) return false;
      if (!selected(cohort, r.cohort)) return false;
      if (!matchesSearch([r.name, r.email, r.note], search)) return false;
      return true;
    });
  }, [masterCrm, from, to, cohort, search, includeTest]);
  const deferrals = useMemo(() => filteredCrm.filter((r) => r.adjustmentType === "Deferral"), [filteredCrm]);
  const planChanges = useMemo(() => filteredCrm.filter((r) => r.adjustmentType === "Plan Change"), [filteredCrm]);

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
  // Master CRM rows are already 1-per-person by design, so length = people.
  const deferralPeopleCount = deferrals.length;
  const planChangePeopleCount = planChanges.length;

  const totalAdjustmentRows =
    refunds.length + dropouts.length + deferrals.length + planChanges.length;
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

  // Master CRM has one row per person (lifecycle tracker), not per transaction,
  // so its drilldown shows totals + the reason note instead of per-payment fields.
  const crmColumns: Column<MasterCrmRow>[] = [
    { key: "name", label: "Name", render: (r) => r.name || "—", sortValue: (r) => r.name },
    { key: "email", label: "Email", render: (r) => r.email || "—", sortValue: (r) => r.email },
    {
      key: "adjustmentType",
      label: "Adjustment",
      render: (r) => r.adjustmentType || "—",
      sortValue: (r) => r.adjustmentType,
    },
    { key: "cohort", label: "Cohort", render: (r) => r.cohort || "—", sortValue: (r) => r.cohort },
    { key: "product", label: "Product", render: (r) => r.product || "—", sortValue: (r) => r.product },
    {
      key: "enrollmentDate",
      label: "Enrolled",
      render: (r) => (r.enrollmentDate ? r.enrollmentDate.slice(0, 10) : "—"),
      sortValue: (r) => r.enrollmentDate,
    },
    {
      key: "totalRevenue",
      label: "Total Revenue",
      render: (r) => (r.totalRevenue == null ? "—" : formatMoney(r.totalRevenue)),
      sortValue: (r) => r.totalRevenue ?? 0,
    },
    {
      key: "totalCash",
      label: "Total Cash",
      render: (r) => (r.totalCashCollected == null ? "—" : formatMoney(r.totalCashCollected)),
      sortValue: (r) => r.totalCashCollected ?? 0,
    },
    {
      key: "paymentCount",
      label: "Payments",
      render: (r) => (r.paymentCount == null ? "—" : String(r.paymentCount)),
      sortValue: (r) => r.paymentCount ?? 0,
    },
    { key: "note", label: "Reason / Note", render: (r) => r.note || "—" },
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
            onClick: () => openDrilldown("Net Revenue — Payments + Deposits", `${payments.length + deposits.length} contributing rows`, [...payments, ...deposits]),
          },
          {
            label: "Net Cash",
            value: formatMoney(netCash),
            source: { source: "Derived", field: "Gross Cash − Refunded Cash" },
            hint: grossCash > 0 ? `${((netCash / grossCash) * 100).toFixed(0)}% retained` : undefined,
            hintColor: netCash >= grossCash * 0.9 ? "green" : "muted",
            onClick: () => openDrilldown("Net Cash — Payments + Deposits", `${payments.length + deposits.length} contributing rows`, [...payments, ...deposits]),
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
            label: "Deferrals",
            value: formatNumber(deferralPeopleCount),
            source: {
              source: "Master REBORN CRM",
              field: 'People with Adjustment Type = "Deferral"',
              formula: "money kept, timeline shifted",
            },
            higherIsBetter: false,
            hint: deferralPeopleCount === 0 ? "None deferred" : "money kept, timeline shifted",
            hintColor: deferralPeopleCount === 0 ? "green" : "muted",
            onClick: deferralPeopleCount > 0 ? () => setCrmDrilldown({ title: "All Deferrals", rows: deferrals }) : undefined,
          },
          {
            label: "Plan Changes",
            value: formatNumber(planChangePeopleCount),
            source: {
              source: "Master REBORN CRM",
              field: 'People with Adjustment Type = "Plan Change"',
              formula: "plan restructured, no refund",
            },
            higherIsBetter: false,
            hint: planChangePeopleCount === 0 ? undefined : "plan restructured, no refund",
            hintColor: "muted",
            onClick: planChangePeopleCount > 0 ? () => setCrmDrilldown({ title: "All Plan Changes", rows: planChanges }) : undefined,
          },
          {
            label: "Total Adjustments",
            value: formatNumber(totalAdjustmentRows),
            source: {
              source: "Cash Tracker + Master CRM",
              field: "COUNT(Refund) + COUNT(Dropout) + COUNT(Deferral) + COUNT(Plan Change)",
              formula: "All revenue-affecting or lifecycle events combined",
            },
            hint: totalAdjustmentRows === 0 ? "Clean slate" : `${refunds.length + dropouts.length + deposits.length} Cash-Tracker · ${deferrals.length + planChanges.length} CRM`,
            hintColor: totalAdjustmentRows === 0 ? "green" : "muted",
            onClick: totalAdjustmentRows > 0 ? () => openDrilldown("All Cash-Tracker Adjustments", `Refunds + Dropouts + Deposits · ${refunds.length + dropouts.length + deposits.length} rows`, [...refunds, ...dropouts, ...deposits]) : undefined,
          },
        ]}
      />

      {/* Revenue Waterfall */}
      <div className="chart-grid">
        <WaterfallChart title="Revenue Flow: Gross → Net" segments={waterfallSegments} />
        <WaterfallChart title="Cash Flow: Gross → Net" segments={waterfallCashSegments} />
      </div>

      {/* Adjustment breakdown — bar chart of every adjustment type side-by-side.
          Each row is a button — click a category to open its leads drilldown. */}
      <AdjustmentBreakdownChart
        items={[
          {
            label: "Refunds",
            count: refundedPeopleCount,
            amount: -refundedCash,
            color: "#f07070",
            source: "Cash Tracker",
            onClick: refunds.length > 0 ? () => openDrilldown("All Refunds", `${refunds.length} refund rows`, refunds) : undefined,
          },
          {
            label: "Dropouts",
            count: dropoutPeopleCount,
            amount: null,
            color: "#a0a0a0",
            source: "Cash Tracker",
            onClick: dropouts.length > 0 ? () => openDrilldown("All Dropouts", `${dropouts.length} dropout rows`, dropouts) : undefined,
          },
          {
            label: "Deferrals",
            count: deferralPeopleCount,
            amount: null,
            color: "#7ca0f4",
            source: "Master CRM",
            onClick: deferrals.length > 0 ? () => setCrmDrilldown({ title: "All Deferrals", rows: deferrals }) : undefined,
          },
          {
            label: "Plan Changes",
            count: planChangePeopleCount,
            amount: null,
            color: "#c58af9",
            source: "Master CRM",
            onClick: planChanges.length > 0 ? () => setCrmDrilldown({ title: "All Plan Changes", rows: planChanges }) : undefined,
          },
          {
            label: "Deposits",
            count: depositPeopleCount,
            amount: sum(deposits.map((r) => r.cashCollected)),
            color: "#f5a623",
            source: "Cash Tracker",
            onClick: deposits.length > 0 ? () => openDrilldown("All Deposits", `${deposits.length} deposit rows`, deposits) : undefined,
          },
        ]}
      />

      {/* Operating lists by adjustment type — refunds & dropouts (Cash Tracker) */}
      <div className="chart-grid">
        <AdjustmentList
          title="Refunds"
          subtitle={`${refundedPeopleCount} people · ${formatMoney(refundedCash)} cash refunded`}
          rows={refunds}
          color="#f07070"
          emptyMessage="No refunds recorded this period."
          onViewAll={() => openDrilldown("All Refunds", undefined, refunds)}
          amountOf={(r) => r.cashCollected}
          secondaryOf={(r) => r.revenue}
        />
        <AdjustmentList
          title="Dropouts"
          subtitle={`${dropoutPeopleCount} people · money kept (no refund)`}
          rows={dropouts}
          color="#a0a0a0"
          emptyMessage="No dropouts recorded this period."
          onViewAll={() => openDrilldown("All Dropouts", undefined, dropouts)}
          amountOf={(r) => r.cashCollected}
          secondaryOf={(r) => r.revenue}
        />
      </div>

      {/* Operating lists — deferrals & plan changes (Master CRM lifecycle) */}
      <div className="chart-grid">
        <AdjustmentList
          title="Deferrals"
          subtitle={`${deferralPeopleCount} people · money kept, timeline shifted`}
          rows={deferrals}
          color="#7ca0f4"
          emptyMessage="No deferrals on file — the Adjustment Type field in Master CRM is empty or nothing set to Deferral."
          onViewAll={() => setCrmDrilldown({ title: "All Deferrals", rows: deferrals })}
          amountOf={(r) => r.totalCashCollected}
          secondaryOf={(r) => r.totalRevenue}
        />
        <AdjustmentList
          title="Plan Changes"
          subtitle={`${planChangePeopleCount} people · plan restructured, no refund`}
          rows={planChanges}
          color="#c58af9"
          emptyMessage="No plan changes on file — nothing in Master CRM set to Plan Change."
          onViewAll={() => setCrmDrilldown({ title: "All Plan Changes", rows: planChanges })}
          amountOf={(r) => r.totalCashCollected}
          secondaryOf={(r) => r.totalRevenue}
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
            amountOf={(r) => r.cashCollected}
            secondaryOf={(r) => r.revenue}
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
          <strong style={{ color: "var(--text)" }}>{formatNumber(filtered.length)}</strong> Cash Tracker rows
          {" · "}
          <strong style={{ color: "#f07070" }}>{refunds.length}</strong> refunds
          {" · "}
          <strong style={{ color: "#a0a0a0" }}>{dropouts.length}</strong> dropouts
          {" · "}
          <strong style={{ color: "#7ca0f4" }}>{deferrals.length}</strong> deferrals
          {" · "}
          <strong style={{ color: "#c58af9" }}>{planChanges.length}</strong> plan changes
          {" · "}
          <strong style={{ color: "#f5a623" }}>{deposits.length}</strong> deposits
        </div>
        <button
          className="link-btn"
          onClick={() => openDrilldown("All Cash-Tracker Adjustments", undefined, [...refunds, ...dropouts, ...deposits])}
        >
          View all Cash-Tracker rows →
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

      {/* CRM drilldown — MasterCrmRow has totals + lifecycle checkboxes, not
          per-transaction fields; render a distinct column set instead of
          reusing the Cash-Tracker columns. */}
      <DrillDownModal
        open={!!crmDrilldown}
        onClose={() => setCrmDrilldown(null)}
        title={crmDrilldown?.title || ""}
        subtitle={crmDrilldown ? `${crmDrilldown.rows.length} people` : ""}
      >
        <DataTable
          columns={crmColumns}
          rows={crmDrilldown?.rows || []}
          rowKey={(r) => r.id}
          isTestRow={(r) => r.isTest}
          searchable
          searchPlaceholder="Search name, email, note…"
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

// ── Adjustment breakdown bar chart ───────────────────────────────
// Horizontal bars, one per adjustment category, sized by person-count.
// Colored dot + name on the left, mini source-of-truth tag under it, and
// the count (plus optional cash amount) pinned right. Shared max scale so
// bars are visually comparable across all categories.

interface AdjustmentBreakdownItem {
  label: string;
  count: number;
  amount: number | null;
  color: string;
  source: string;
  /** Optional — click a row to open that category's leads drilldown. */
  onClick?: () => void;
}

function AdjustmentBreakdownChart({ items }: { items: AdjustmentBreakdownItem[] }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  const total = items.reduce((acc, i) => acc + i.count, 0);
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: 12,
        padding: 20,
        marginBottom: 20,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <div style={{ fontSize: 12, letterSpacing: 0.4, color: "var(--muted)", fontWeight: 600 }}>
          ADJUSTMENTS BREAKDOWN · BY PEOPLE
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)" }}>
          <strong style={{ color: "var(--text)" }}>{total}</strong> people affected
        </div>
      </div>

      {total === 0 ? (
        <div style={{ color: "var(--muted)", fontSize: 12, padding: "16px 0", textAlign: "center" }}>
          No adjustments in this period.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((i) => {
            const clickable = !!i.onClick && i.count > 0;
            return (
              <button
                key={i.label}
                type="button"
                onClick={i.onClick}
                disabled={!clickable}
                aria-label={clickable ? `View ${i.count} ${i.label} leads` : undefined}
                style={{
                  // Reset the browser button defaults so this looks/lays out like a row.
                  all: "unset",
                  boxSizing: "border-box",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "8px 10px",
                  borderRadius: 8,
                  cursor: clickable ? "pointer" : "default",
                  transition: "background 120ms ease, transform 120ms ease",
                }}
                onMouseEnter={(e) => {
                  if (!clickable) return;
                  e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                  e.currentTarget.style.transform = "translateX(2px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "";
                  e.currentTarget.style.transform = "";
                }}
              >
                <div style={{ width: 130, flexShrink: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: i.color,
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>{i.label}</div>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginLeft: 16, letterSpacing: 0.3 }}>
                    {i.source}
                  </div>
                </div>
                <div
                  style={{
                    flex: 1,
                    background: "rgba(255,255,255,0.04)",
                    borderRadius: 4,
                    height: 22,
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${(i.count / max) * 100}%`,
                      minWidth: i.count > 0 ? 2 : 0,
                      background: i.color,
                      height: "100%",
                      borderRadius: 4,
                      transition: "width 200ms ease",
                    }}
                  />
                </div>
                <div style={{ width: 110, textAlign: "right", flexShrink: 0 }}>
                  <div className="mono" style={{ fontSize: 13, color: "var(--text)", fontWeight: 600 }}>
                    {i.count}
                  </div>
                  {i.amount != null && i.amount !== 0 ? (
                    <div className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
                      {i.amount < 0 ? "−" : ""}
                      {formatMoney(Math.abs(i.amount))}
                    </div>
                  ) : clickable ? (
                    <div style={{ fontSize: 10, color: "var(--muted)" }}>click →</div>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Operating list for a specific adjustment type ────────────────

interface AdjustmentListRow {
  id: string;
  name: string;
  cohort: string | null;
  enrollmentDate: string | null;
}

function AdjustmentList<T extends AdjustmentListRow>({
  title,
  subtitle,
  rows,
  color,
  emptyMessage,
  onViewAll,
  amountOf,
  secondaryOf,
}: {
  title: string;
  subtitle: string;
  rows: T[];
  color: string;
  emptyMessage: string;
  onViewAll: () => void;
  /** Primary amount shown on the right of each row (colored). */
  amountOf: (r: T) => number | null;
  /** Optional secondary amount shown muted underneath — hidden if equal to primary. */
  secondaryOf?: (r: T) => number | null;
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
                    {formatMoney(amountOf(r))}
                  </div>
                  {(() => {
                    const primary = amountOf(r);
                    const secondary = secondaryOf?.(r);
                    if (secondary == null || secondary === primary) return null;
                    return (
                      <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
                        rev {formatMoney(secondary)}
                      </div>
                    );
                  })()}
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
