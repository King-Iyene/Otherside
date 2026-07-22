"use client";

import { useMemo, useState } from "react";
import type { ApplicationRow, AppointmentRow, CashRow, ChallengeRow, SalesActivityRow } from "@/lib/types";
import {
  analyzeAppToPurchase,
  analyzeChallengeToReborn,
  analyzeCouponPurchase,
  analyzeDepositLifecycle,
  type DepositLead,
  type ChallengeLead,
} from "@/lib/crossSource";
import { allLaunchesForData, computeSubOfferBreakdown } from "@/lib/cohortFunnel";
import { formatMoney, formatNumber, formatPercent } from "@/lib/money";
import DrillDownModal from "../DrillDownModal";
import BreakdownChart from "../BreakdownChart";
import type { Column } from "../DataTable";
import DataTable from "../DataTable";

interface Props {
  cash: CashRow[];
  appointments: AppointmentRow[];
  applications: ApplicationRow[];
  salesActivity: SalesActivityRow[];
  challenge: ChallengeRow[];
}

const SHOWED = new Set(["Showed", "Client Won", "Finisher"]);

/** Small helper — a card with source annotation baked in. */
function InsightCard({
  label,
  value,
  hint,
  color,
  source,
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  color?: string;
  source: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      style={{
        background: "var(--gradient-surface)",
        border: "1px solid var(--line)",
        borderRadius: 14,
        padding: "16px 18px",
        cursor: onClick ? "pointer" : "default",
        textAlign: "left",
        transition: "transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
        position: "relative",
        overflow: "hidden",
        color: "var(--text)",
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.borderColor = "var(--line-strong)";
          e.currentTarget.style.boxShadow = "var(--shadow-lg)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.borderColor = "";
        e.currentTarget.style.boxShadow = "";
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: color || "var(--accent)", opacity: 0.7 }} />
      <div className="kpi-label">{label}</div>
      <div className="kpi-value mono" style={{ color: color || "var(--text)", marginTop: 4 }}>
        {value}
      </div>
      {hint && <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 4 }}>{hint}</div>}
      <div
        style={{
          fontSize: 9,
          color: "var(--muted)",
          fontFamily: "var(--font-mono)",
          marginTop: 8,
          paddingTop: 8,
          borderTop: "1px dashed var(--line)",
          letterSpacing: 0.05,
          textTransform: "uppercase",
        }}
      >
        Source: {source} {onClick && "· click to see leads"}
      </div>
    </button>
  );
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ margin: "24px 0 12px" }}>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 20,
          fontWeight: 600,
          background: "var(--gradient-accent)",
          backgroundClip: "text",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          letterSpacing: 0.01,
        }}
      >
        {title}
      </div>
      {sub && <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function InsightsTab({ cash, applications, appointments, salesActivity, challenge }: Props) {
  const [drilldown, setDrilldown] = useState<{ title: string; subtitle?: string; rows: any[]; columns: Column<any>[] } | null>(null);

  const subOfferBreakdowns = useMemo(
    () =>
      allLaunchesForData({ cash, appointments, applications, challenge })
        .map((cohort) => ({ cohort, items: computeSubOfferBreakdown(cash, cohort) }))
        .filter((b) => b.items.length > 0),
    [cash, appointments, applications, challenge]
  );

  const c2r = useMemo(() => analyzeChallengeToReborn(challenge, cash), [challenge, cash]);
  const a2p = useMemo(() => analyzeAppToPurchase(applications, cash), [applications, cash]);
  const coupon = useMemo(() => analyzeCouponPurchase(challenge, cash), [challenge, cash]);
  const dep = useMemo(() => analyzeDepositLifecycle(cash), [cash]);

  const depColumns: Column<DepositLead>[] = [
    { key: "name", label: "Name", render: (r) => r.name || "—", sortValue: (r) => r.name },
    { key: "email", label: "Email", render: (r) => r.email, sortValue: (r) => r.email },
    { key: "cohort", label: "Cohort", render: (r) => r.cohort || "—", sortValue: (r) => r.cohort },
    { key: "product", label: "Product", render: (r) => r.product || "—", sortValue: (r) => r.product },
    { key: "deposit", label: "Deposit", render: (r) => formatMoney(r.depositCash), sortValue: (r) => r.depositCash },
    { key: "totalCash", label: "Cash Collected", render: (r) => formatMoney(r.totalCash), sortValue: (r) => r.totalCash },
    { key: "totalRevenue", label: "Booked Revenue", render: (r) => formatMoney(r.totalRevenue), sortValue: (r) => r.totalRevenue },
    { key: "paymentCount", label: "Payments", render: (r) => String(r.paymentCount), sortValue: (r) => r.paymentCount },
    {
      key: "outcome",
      label: "Outcome",
      render: (r) => r.outcome.replace(/_/g, " "),
      sortValue: (r) => r.outcome,
    },
  ];
  const openDepDrill = (title: string, rows: DepositLead[]) =>
    setDrilldown({ title, subtitle: `${rows.length} depositors`, rows, columns: depColumns });

  const challengeLeadColumns: Column<ChallengeLead>[] = [
    { key: "email", label: "Email", render: (r) => r.email, sortValue: (r) => r.email },
    { key: "product", label: "Challenge Product", render: (r) => r.product || "—", sortValue: (r) => r.product },
    { key: "amount", label: "Amount", render: (r) => r.amount != null ? formatMoney(r.amount) : "—", sortValue: (r) => r.amount },
    { key: "coupon", label: "Coupon", render: (r) => r.coupon || "—", sortValue: (r) => r.coupon },
    { key: "type", label: "Type", render: (r) => r.isFree ? "Free / Coupon" : "Paid", sortValue: (r) => r.isFree ? 0 : 1 },
    { key: "bought", label: "Bought Reborn", render: (r) => {
      const color = r.boughtReborn ? "var(--green)" : "var(--muted)";
      return <span style={{ color, fontWeight: 500 }}>{r.boughtReborn ? "Yes" : "No"}</span>;
    }, sortValue: (r) => r.boughtReborn ? 1 : 0 },
  ];
  const openChallengeDrill = (title: string, rows: ChallengeLead[]) =>
    setDrilldown({ title, subtitle: `${rows.length} leads`, rows, columns: challengeLeadColumns });

  // Adeyemi approval → purchase rate
  const adeyemiAppRows = applications.filter((r) => !r.isTest && r.applicationStatus?.startsWith("Adeyemi"));
  const adeyemiApproved = adeyemiAppRows.filter((r) => r.applicationStatus === "Adeyemi Approved DQ App");
  const adeyemiApprovedBought = adeyemiApproved.filter((r) => r.purchased);
  const adeyemiApproveRate = adeyemiApproved.length ? adeyemiApprovedBought.length / adeyemiApproved.length : null;

  // Ready-to-invest → purchase
  const rti = applications.filter((r) => !r.isTest && r.applicationStatus === "Ready to Invest");
  const rtiBought = rti.filter((r) => r.purchased);
  const rtiRate = rti.length ? rtiBought.length / rti.length : null;

  // Appointments showed → cash tracker purchase
  const cashByEmail = new Map<string, CashRow>();
  for (const r of cash) {
    if (r.isTest) continue;
    if (r.transactionType === "Refund" || r.transactionType === "Dropout") continue;
    const e = (r.email || "").trim().toLowerCase();
    if (e) cashByEmail.set(e, r);
  }
  const showedAppts = appointments.filter((r) => !r.isTest && r.status && SHOWED.has(r.status));
  const showedBought = showedAppts.filter((r) => {
    const e = (r.email || "").trim().toLowerCase();
    return e && cashByEmail.has(e);
  });
  const showToCloseAcrossSystems = showedAppts.length ? showedBought.length / showedAppts.length : null;

  // Calls per day per closer
  const dailyCallsPerCloser = useMemo(() => {
    const map = new Map<string, { totalCalls: number; days: Set<string> }>();
    for (const r of salesActivity) {
      if (r.isTest || !r.enrManager) continue;
      const e = map.get(r.enrManager) || { totalCalls: 0, days: new Set() };
      e.totalCalls += r.newCalls ?? 0;
      if (r.date) e.days.add(r.date);
      map.set(r.enrManager, e);
    }
    return Array.from(map.entries())
      .map(([manager, v]) => ({
        manager,
        totalCalls: v.totalCalls,
        activeDays: v.days.size,
        callsPerDay: v.days.size > 0 ? v.totalCalls / v.days.size : 0,
      }))
      .sort((a, b) => b.callsPerDay - a.callsPerDay);
  }, [salesActivity]);

  const rebornMatchColumns: Column<any>[] = [
    { key: "email", label: "Email", render: (r) => r.email, sortValue: (r) => r.email },
    { key: "challengeProduct", label: "Challenge Product", render: (r) => r.challengeProduct || "—" },
    { key: "challengeCoupon", label: "Coupon", render: (r) => r.challengeCoupon || "—" },
    { key: "challengeAmount", label: "Paid Challenge", render: (r) => (r.challengeAmount != null ? `$${r.challengeAmount}` : "—") },
    { key: "rebornProduct", label: "Reborn Product", render: (r) => r.rebornProduct || "—" },
    { key: "rebornCohort", label: "Reborn Cohort", render: (r) => r.rebornCohort || "—" },
    { key: "rebornCashCollected", label: "Cash Collected", render: (r) => formatMoney(r.rebornCashCollected), sortValue: (r) => r.rebornCashCollected },
  ];

  const showedBoughtColumns: Column<AppointmentRow>[] = [
    { key: "name", label: "Name", render: (r) => r.name, sortValue: (r) => r.name },
    { key: "email", label: "Email", render: (r) => r.email || "—", sortValue: (r) => r.email },
    { key: "status", label: "Status", render: (r) => r.status || "—", sortValue: (r) => r.status },
    { key: "cohort", label: "Cohort", render: (r) => r.cohort || "—", sortValue: (r) => r.cohort },
    { key: "enrManager", label: "Closer", render: (r) => r.enrManager || "—", sortValue: (r) => r.enrManager },
    { key: "appointmentTime", label: "Appointment", render: (r) => r.appointmentTime || "—", sortValue: (r) => r.appointmentTime },
  ];

  const appMatchColumns: Column<any>[] = [
    { key: "email", label: "Email", render: (r) => r.email, sortValue: (r) => r.email },
    { key: "annualEarnings", label: "Earnings Bracket", render: (r) => r.annualEarnings || "—" },
    { key: "applicationStatus", label: "App Status", render: (r) => r.applicationStatus || "—" },
    { key: "rebornProduct", label: "Reborn Product", render: (r) => r.rebornProduct || "—" },
    { key: "rebornCohort", label: "Cohort", render: (r) => r.rebornCohort || "—" },
    { key: "rebornCashCollected", label: "Cash Collected", render: (r) => formatMoney(r.rebornCashCollected), sortValue: (r) => r.rebornCashCollected },
  ];

  return (
    <div>
      <div
        style={{
          background: "linear-gradient(135deg, rgba(242,182,60,0.08), rgba(97,170,242,0.05))",
          border: "1px solid var(--line)",
          borderRadius: 14,
          padding: "18px 20px",
          marginBottom: 20,
        }}
      >
        <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600 }}>Cross-Source Insights</div>
        <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
          Joins every dataset by email — Challenge Sheet, Reborn Cash Tracker, Application Tracker, Appointments, Sales Activity — to answer
          the questions raw single-source views can&apos;t. Every card is clickable → see the matched leads.
        </div>
      </div>

      {/* DEPOSIT LIFECYCLE — what happens after someone puts down a deposit? */}
      <SectionHeader
        title="Deposit Lifecycle"
        sub="Group by person, then bucket every depositor by what actually happened next. Priority: refunded → dropped-out → paid-in-full → still-refilling → deposit-only (stalled). Every card is clickable."
      />
      <div className="kpi-grid">
        <InsightCard
          label="Total Depositors"
          value={formatNumber(dep.totalDepositors)}
          hint="People with ≥1 Deposit row"
          color="#f5a623"
          source="Cash Tracker · rows WHERE Transaction Type = Deposit, grouped by Email"
          onClick={dep.totalDepositors ? () => openDepDrill("All Depositors", [...dep.paidInFull, ...dep.continuing, ...dep.refunded, ...dep.droppedOut, ...dep.depositOnly]) : undefined}
        />
        <InsightCard
          label="Paid in Full"
          value={formatNumber(dep.paidInFull.length)}
          hint={dep.totalDepositors ? `${formatPercent(dep.paidInFull.length / dep.totalDepositors)} of depositors` : undefined}
          color="#45d093"
          source="Cash Tracker · Cash Collected ≥ Revenue booked"
          onClick={dep.paidInFull.length ? () => openDepDrill("Deposit → Paid in Full", dep.paidInFull) : undefined}
        />
        <InsightCard
          label="Still Refilling"
          value={formatNumber(dep.continuing.length)}
          hint={dep.totalDepositors ? `${formatPercent(dep.continuing.length / dep.totalDepositors)} still on payment plan` : undefined}
          color="#7ca0f4"
          source="Cash Tracker · has Payment rows after Deposit, not yet paid off"
          onClick={dep.continuing.length ? () => openDepDrill("Deposit → Still Refilling", dep.continuing) : undefined}
        />
        <InsightCard
          label="Refunded"
          value={formatNumber(dep.refunded.length)}
          hint={dep.totalDepositors ? `${formatPercent(dep.refunded.length / dep.totalDepositors)} of depositors` : undefined}
          color="#f07070"
          source="Cash Tracker · Deposit followed by ≥1 Refund row"
          onClick={dep.refunded.length ? () => openDepDrill("Deposit → Refunded", dep.refunded) : undefined}
        />
        <InsightCard
          label="Dropped Out"
          value={formatNumber(dep.droppedOut.length)}
          hint={dep.totalDepositors ? `${formatPercent(dep.droppedOut.length / dep.totalDepositors)} money kept, gone silent` : undefined}
          color="#a0a0a0"
          source="Cash Tracker · Deposit followed by Dropout, no refund"
          onClick={dep.droppedOut.length ? () => openDepDrill("Deposit → Dropped Out", dep.droppedOut) : undefined}
        />
        <InsightCard
          label="Deposit Only (Stalled)"
          value={formatNumber(dep.depositOnly.length)}
          hint={dep.totalDepositors ? `${formatPercent(dep.depositOnly.length / dep.totalDepositors)} never converted` : undefined}
          color="#c58af9"
          source="Cash Tracker · Deposit is the ONLY row for this person"
          onClick={dep.depositOnly.length ? () => openDepDrill("Deposit → Only, Never Converted", dep.depositOnly) : undefined}
        />
      </div>

      {/* Deposit outcome breakdown — horizontal bar chart */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: 12,
          padding: 20,
          marginTop: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
          <div style={{ fontSize: 12, letterSpacing: 0.4, color: "var(--muted)", fontWeight: 600 }}>
            OUTCOME BREAKDOWN · WHERE DEPOSITORS ENDED UP
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>
            <strong style={{ color: "var(--text)" }}>{dep.totalDepositors}</strong> depositors total · click a row to see leads
          </div>
        </div>
        {dep.totalDepositors === 0 ? (
          <div style={{ color: "var(--muted)", fontSize: 12, padding: "16px 0", textAlign: "center" }}>
            No depositors in the current dataset.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { label: "Paid in Full",     count: dep.paidInFull.length,  color: "#45d093", rows: dep.paidInFull },
              { label: "Still Refilling",  count: dep.continuing.length,  color: "#7ca0f4", rows: dep.continuing },
              { label: "Refunded",         count: dep.refunded.length,    color: "#f07070", rows: dep.refunded },
              { label: "Dropped Out",      count: dep.droppedOut.length,  color: "#a0a0a0", rows: dep.droppedOut },
              { label: "Deposit Only",     count: dep.depositOnly.length, color: "#c58af9", rows: dep.depositOnly },
            ].map((row) => {
              const pct = dep.totalDepositors ? row.count / dep.totalDepositors : 0;
              return (
                <div
                  key={row.label}
                  role={row.count > 0 ? "button" : undefined}
                  tabIndex={row.count > 0 ? 0 : undefined}
                  onClick={row.count > 0 ? () => openDepDrill(`Deposit → ${row.label}`, row.rows) : undefined}
                  onKeyDown={row.count > 0 ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDepDrill(`Deposit → ${row.label}`, row.rows); } } : undefined}
                  style={{ display: "flex", alignItems: "center", gap: 12, cursor: row.count > 0 ? "pointer" : "default", borderRadius: 6, padding: "4px 6px", transition: "background 0.15s ease" }}
                  onMouseEnter={(e) => { if (row.count > 0) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
                >
                  <div style={{ width: 140, flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: row.color, flexShrink: 0 }} />
                    <div style={{ fontSize: 13, color: "var(--text)" }}>{row.label}</div>
                  </div>
                  <div style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 4, height: 22, overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${pct * 100}%`,
                        minWidth: row.count > 0 ? 2 : 0,
                        background: row.color,
                        height: "100%",
                        borderRadius: 4,
                        transition: "width 200ms ease",
                      }}
                    />
                  </div>
                  <div style={{ width: 100, textAlign: "right", flexShrink: 0 }}>
                    <div className="mono" style={{ fontSize: 13, color: "var(--text)", fontWeight: 600 }}>
                      {row.count}
                    </div>
                    <div className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
                      {formatPercent(pct)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CHALLENGE → REBORN */}
      <SectionHeader title="Challenge → Reborn Conversion" sub="Which Challenge registrants went on to buy the main Reborn offer?" />
      <div className="kpi-grid">
        <InsightCard
          label="Unique Challenge Emails"
          value={formatNumber(c2r.challengeUniqueEmails)}
          source="Challenge Sheet · Email"
          color="var(--blue)"
          onClick={() => openChallengeDrill("All Challenge Leads", c2r.allLeads)}
        />
        <InsightCard
          label="Bought Reborn"
          value={formatNumber(c2r.challengeBoughtReborn)}
          source="Challenge ∩ Cash Tracker"
          color="var(--green)"
          onClick={() => setDrilldown({ title: "Challenge → Reborn Converters", rows: c2r.matches, columns: rebornMatchColumns })}
        />
        <InsightCard
          label="Conversion Rate"
          value={formatPercent(c2r.conversionRate)}
          source="Bought ÷ Total Challenge"
          color="var(--accent)"
        />
        <InsightCard
          label="Revenue From Converters"
          value={formatMoney(c2r.revenueFromConverters)}
          source="SUM(Cash Collected) matched"
          color="var(--green)"
          onClick={() => setDrilldown({ title: "Revenue Converters", rows: c2r.matches, columns: rebornMatchColumns })}
        />
        <InsightCard
          label="Free (Coupon) Users Who Bought"
          value={`${formatNumber(c2r.freeToBought.converted)} / ${formatNumber(c2r.freeToBought.total)}`}
          hint={formatPercent(c2r.freeToBought.total ? c2r.freeToBought.converted / c2r.freeToBought.total : null)}
          source="Coupon or $0 amount → Reborn"
          color="var(--purple)"
          onClick={() => openChallengeDrill("Free / Coupon Challenge Leads", c2r.allLeads.filter((l) => l.isFree))}
        />
        <InsightCard
          label="Paid Users Who Bought"
          value={`${formatNumber(c2r.paidToBought.converted)} / ${formatNumber(c2r.paidToBought.total)}`}
          hint={formatPercent(c2r.paidToBought.total ? c2r.paidToBought.converted / c2r.paidToBought.total : null)}
          source="Paid Challenge → Reborn"
          color="var(--accent)"
          onClick={() => openChallengeDrill("Paid Challenge Leads", c2r.allLeads.filter((l) => !l.isFree))}
        />
      </div>

      {/* COUPON BREAKDOWN */}
      <SectionHeader title="Coupon-Code Performance" sub="Which discount codes actually attracted future Reborn buyers?" />
      <div
        className="panel"
        style={{ marginBottom: 8 }}
      >
        <table className="leaderboard">
          <thead>
            <tr>
              <th>Coupon Code</th>
              <th>Challenge Uses</th>
              <th>Bought Reborn</th>
              <th>Conversion %</th>
              <th>Revenue Generated</th>
            </tr>
          </thead>
          <tbody>
            {coupon.perCoupon.slice(0, 20).map((c) => (
              <tr key={c.code}>
                <td className="mono">{c.code}</td>
                <td className="mono">{formatNumber(c.challengeUses)}</td>
                <td className="mono">{formatNumber(c.boughtReborn)}</td>
                <td
                  className="mono"
                  style={{ color: c.conversionRate !== null && c.conversionRate >= 0.05 ? "var(--green)" : "var(--text)" }}
                >
                  {formatPercent(c.conversionRate)}
                </td>
                <td className="mono">{formatMoney(c.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* INCOME BRACKET → PURCHASE (Oliver's ask) */}
      <SectionHeader
        title="Income Bracket → Purchase"
        sub="Who at each income level actually purchased? The number he asked about specifically."
      />
      <div className="panel" style={{ marginBottom: 8 }}>
        <table className="leaderboard">
          <thead>
            <tr>
              <th>Annual Earnings</th>
              <th>Applications</th>
              <th>Purchased</th>
              <th>Conversion %</th>
              <th>Revenue Generated</th>
            </tr>
          </thead>
          <tbody>
            {a2p.bucketBreakdown.map((b) => (
              <tr
                key={b.bracket}
                onClick={() =>
                  setDrilldown({
                    title: `Income Bracket → Purchase — ${b.bracket}`,
                    rows: a2p.matches.filter((m) => m.annualEarnings === b.bracket),
                    columns: appMatchColumns,
                  })
                }
                style={{ cursor: "pointer" }}
              >
                <td style={{ fontWeight: 500 }}>{b.bracket} →</td>
                <td className="mono">{formatNumber(b.applications)}</td>
                <td className="mono">{formatNumber(b.purchased)}</td>
                <td
                  className="mono"
                  style={{ color: b.conversionRate !== null && b.conversionRate >= 0.1 ? "var(--green)" : "var(--text)" }}
                >
                  {formatPercent(b.conversionRate)}
                </td>
                <td className="mono">{formatMoney(b.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* APPLICATION STATUS → PURCHASE */}
      <SectionHeader title="Application Status → Purchase" sub="Adeyemi's approval rate, Ready-to-Invest rate, etc." />
      <div className="kpi-grid">
        <InsightCard
          label="Adeyemi Approved DQ → Bought"
          value={`${formatNumber(adeyemiApprovedBought.length)} / ${formatNumber(adeyemiApproved.length)}`}
          hint={formatPercent(adeyemiApproveRate)}
          source="Applications · Status = Adeyemi Approved DQ App"
          color="var(--accent)"
          onClick={() =>
            setDrilldown({
              title: "Adeyemi Approved DQ App — Purchased",
              rows: a2p.matches.filter((m) => m.applicationStatus === "Adeyemi Approved DQ App"),
              columns: appMatchColumns,
            })
          }
        />
        <InsightCard
          label="Ready to Invest → Bought"
          value={`${formatNumber(rtiBought.length)} / ${formatNumber(rti.length)}`}
          hint={formatPercent(rtiRate)}
          source="Applications · Status = Ready to Invest"
          color="var(--green)"
          onClick={() =>
            setDrilldown({
              title: "Ready to Invest — Purchased",
              rows: a2p.matches.filter((m) => m.applicationStatus === "Ready to Invest"),
              columns: appMatchColumns,
            })
          }
        />
        <InsightCard
          label="Showed → Bought (cross-system)"
          value={`${formatNumber(showedBought.length)} / ${formatNumber(showedAppts.length)}`}
          hint={formatPercent(showToCloseAcrossSystems)}
          source="Appointments ∩ Cash Tracker on email"
          color="var(--blue)"
          onClick={showedBought.length ? () => setDrilldown({ title: "Showed → Bought", subtitle: `${showedBought.length} leads who showed and purchased`, rows: showedBought, columns: showedBoughtColumns }) : undefined}
        />
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-header">
          <div className="panel-title">All Application Statuses vs Purchase</div>
        </div>
        <table className="leaderboard">
          <thead>
            <tr>
              <th>Status</th>
              <th>Applications</th>
              <th>Purchased</th>
              <th>Conversion %</th>
              <th>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {a2p.statusBreakdown.map((s) => (
              <tr
                key={s.status}
                onClick={() =>
                  setDrilldown({
                    title: `App Status → Purchase — ${s.status}`,
                    rows: a2p.matches.filter((m) => m.applicationStatus === s.status),
                    columns: appMatchColumns,
                  })
                }
                style={{ cursor: "pointer" }}
              >
                <td style={{ fontWeight: 500 }}>{s.status} →</td>
                <td className="mono">{formatNumber(s.applications)}</td>
                <td className="mono">{formatNumber(s.purchased)}</td>
                <td
                  className="mono"
                  style={{ color: s.conversionRate !== null && s.conversionRate >= 0.1 ? "var(--green)" : "var(--text)" }}
                >
                  {formatPercent(s.conversionRate)}
                </td>
                <td className="mono">{formatMoney(s.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* SUB-OFFERS WITHIN EACH LAUNCH */}
      {subOfferBreakdowns.length > 0 && (
        <>
          <SectionHeader
            title="Sub-Offers Within Each Launch"
            sub="Enrolled buyers in each launch, split by which offer they bought (Reborn, Reborn Core, Retreat, Scholarship…). Taken from a sub-offer on the Cohort field if present (e.g. “Erupt 2 > Retreat”), otherwise inferred from the Product column. Every bar still counts toward that launch’s total in Cohort Funnels — this just shows the offer mix."
          />
          <div className="kpi-grid">
            {subOfferBreakdowns.map(({ cohort, items }) => (
              <BreakdownChart
                key={cohort.id}
                title={`${cohort.label} — by sub-offer`}
                items={items.map((i) => ({ key: i.key, value: i.value }))}
                valueFormatter={(v) => `${v} buyer${v === 1 ? "" : "s"}`}
              />
            ))}
          </div>
        </>
      )}

      {/* CALLS PER DAY PER CLOSER */}
      <SectionHeader title="Calls Per Day — Per Closer" sub="Average daily call volume for each closer over their active days." />
      <div className="panel">
        <table className="leaderboard">
          <thead>
            <tr>
              <th>Closer</th>
              <th>Total Calls</th>
              <th>Active Days</th>
              <th>Calls / Day</th>
            </tr>
          </thead>
          <tbody>
            {dailyCallsPerCloser.map((r) => (
              <tr key={r.manager}>
                <td>{r.manager}</td>
                <td className="mono">{formatNumber(r.totalCalls)}</td>
                <td className="mono">{formatNumber(r.activeDays)}</td>
                <td
                  className="mono"
                  style={{ color: r.callsPerDay >= 8 ? "var(--green)" : r.callsPerDay >= 5 ? "var(--accent)" : "var(--red)" }}
                >
                  {r.callsPerDay.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DrillDownModal
        open={!!drilldown}
        onClose={() => setDrilldown(null)}
        title={drilldown?.title || ""}
        subtitle={drilldown ? drilldown.subtitle || `${drilldown.rows.length} matched leads` : ""}
      >
        {drilldown && (
          <DataTable
            columns={drilldown.columns}
            rows={drilldown.rows}
            rowKey={(r) => r.email || Math.random().toString()}
            searchable
            searchPlaceholder="Search name, email, product…"
          />
        )}
      </DrillDownModal>
    </div>
  );
}
