"use client";
import { useEffect, useMemo, useState } from "react";
import type { DashboardData } from "@/lib/types";
import { fmtMoney, fmtInt, fmtPct, fmtDateTime, timeSeries, groupSum, type Granularity } from "@/lib/format";
import { Kpi, Card, Chips } from "@/components/ui";
import { TimeAreaChart, BreakdownBars, COLORS } from "@/components/charts";
import { CashTab } from "@/components/tabCash";
import { AppointmentsTab } from "@/components/tabAppointments";
import { ApplicationsTab } from "@/components/tabApplications";
import { SalesTab } from "@/components/tabSales";
import { SheetTab } from "@/components/tabSheet";

const TABS = ["Overview", "Cash", "Appointments", "Applications", "Sales Activity", "Challenge"] as const;
type Tab = (typeof TABS)[number];

export default function Dashboard() {
  const [data, setData] = useState<(DashboardData & { cached?: boolean; stale?: boolean }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>("Overview");
  const [includeTest, setIncludeTest] = useState(false);
  const [showHealth, setShowHealth] = useState(false);

  async function load(fresh: boolean) {
    fresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/data${fresh ? "?fresh=1" : ""}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      setData(json);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(false); }, []);

  // Filtered-by-test-toggle datasets shared with every tab
  const d = useMemo(() => {
    if (!data) return null;
    const keep = <T extends { isTest: boolean }>(rows: T[]) => (includeTest ? rows : rows.filter((r) => !r.isTest));
    return {
      ...data,
      cash: keep(data.cash),
      appointments: keep(data.appointments),
      applications: keep(data.applications),
      salesActivity: keep(data.salesActivity),
    };
  }, [data, includeTest]);

  const totals = useMemo(() => {
    if (!d) return null;
    const revenue = d.cash.reduce((s, r) => s + (r.revenue ?? 0), 0);
    const cash = d.cash.reduce((s, r) => s + (r.cashCollected ?? 0), 0);
    return { revenue, cash, outstanding: revenue - cash };
  }, [d]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-mark">Otherside</div>
        <div className="loading-note">Pulling live numbers from Notion…</div>
      </div>
    );
  }
  if (error || !d || !totals) {
    return (
      <div className="app-shell">
        <div className="loading-screen">
          <div className="loading-mark">Otherside</div>
          <div className="alert error">
            Could not load dashboard data: {error ?? "unknown error"}.
            <br />Check that NOTION_TOKEN is set and the integration has access to all four databases, then{" "}
            <button className="health-summary" onClick={() => load(true)}>try again</button>.
          </div>
        </div>
      </div>
    );
  }

  const testCount =
    (data!.cash.length - d.cash.length) + (data!.appointments.length - d.appointments.length) +
    (data!.applications.length - d.applications.length) + (data!.salesActivity.length - d.salesActivity.length);

  return (
    <div className="app-shell">
      <header className="pulse-bar">
        <div className="brand">
          <span className="brand-name">Otherside</span>
          <span className="brand-sub">Command Center</span>
        </div>
        <div className="pulse-ticker">
          <div className="tick">
            <span className="tick-label">Cash collected</span>
            <span className="tick-value gold">{fmtMoney(totals.cash)}</span>
          </div>
          <div className="tick">
            <span className="tick-label">Revenue booked</span>
            <span className="tick-value">{fmtMoney(totals.revenue)}</span>
          </div>
          <div className="tick">
            <span className="tick-label">Outstanding</span>
            <span className="tick-value">{fmtMoney(totals.outstanding)}</span>
          </div>
          <span className="sync-note">
            <span className={`sync-dot ${data?.stale ? "stale" : ""}`} />
            Synced {fmtDateTime(d.fetchedAt)}
          </span>
          <button className="refresh-btn" onClick={() => load(true)} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      {d.errors.length > 0 && (
        <div className="alert error" style={{ marginTop: 14 }}>
          Some sources failed to load — the numbers below are incomplete:
          <ul>{d.errors.map((e, i) => <li key={i}><strong>{e.dataset}:</strong> {e.message}</li>)}</ul>
        </div>
      )}

      {d.health.length > 0 && (
        <div className="alert warn" style={{ marginTop: 14 }}>
          <button className="health-summary" onClick={() => setShowHealth(!showHealth)}>
            Data health: {d.health.length} item{d.health.length === 1 ? "" : "s"} need attention {showHealth ? "▲" : "▼"}
          </button>{" "}
          — these rows are shown, but flagged so totals stay honest.
          {showHealth && (
            <ul>
              {d.health.slice(0, 50).map((h, i) => (
                <li key={i}><strong>{h.dataset}</strong> · {h.row}: {h.issue}</li>
              ))}
              {d.health.length > 50 && <li>…and {d.health.length - 50} more.</li>}
            </ul>
          )}
        </div>
      )}

      <nav className="tabs" aria-label="Dashboards">
        {TABS.map((t) => (
          <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t}
            <span className="tab-badge">
              {t === "Cash" ? d.cash.length : t === "Appointments" ? d.appointments.length :
               t === "Applications" ? d.applications.length : t === "Sales Activity" ? d.salesActivity.length :
               t === "Challenge" ? (d.challengeSheet.ok ? d.challengeSheet.rows.length : "!") : ""}
            </span>
          </button>
        ))}
        <div className="toggle-row">
          <input id="inc-test" type="checkbox" checked={includeTest} onChange={(e) => setIncludeTest(e.target.checked)} />
          <label htmlFor="inc-test">Include {testCount} test record{testCount === 1 ? "" : "s"}</label>
        </div>
      </nav>

      {tab === "Overview" && <OverviewTab d={d} />}
      {tab === "Cash" && <CashTab rows={d.cash} />}
      {tab === "Appointments" && <AppointmentsTab rows={d.appointments} />}
      {tab === "Applications" && <ApplicationsTab rows={d.applications} />}
      {tab === "Sales Activity" && <SalesTab rows={d.salesActivity} />}
      {tab === "Challenge" && <SheetTab sheet={d.challengeSheet} />}

      <div className="footnote">
        Live from Notion and Google Sheets · cached for 2 minutes · use Refresh for up-to-the-second numbers.
        Test records are excluded by default.
      </div>
    </div>
  );
}

function OverviewTab({ d }: { d: DashboardData }) {
  const [gran, setGran] = useState<Granularity>("month");

  const revenue = d.cash.reduce((s, r) => s + (r.revenue ?? 0), 0);
  const cash = d.cash.reduce((s, r) => s + (r.cashCollected ?? 0), 0);
  const clients = d.cash.length;
  const apps = d.applications.length;
  const readyToInvest = d.applications.filter((a) => a.status === "Ready to Invest").length;
  const appts = d.appointments.length;

  const sa = d.salesActivity;
  const newCalls = sa.reduce((s, r) => s + r.newCalls, 0);
  const showed = sa.reduce((s, r) => s + r.showed, 0);
  const sales = sa.reduce((s, r) => s + r.salesMade, 0);
  const showRate = newCalls > 0 ? showed / newCalls : null;
  const closeRate = showed > 0 ? sales / showed : null;

  const cashOverTime = useMemo(
    () => timeSeries(d.cash, (r) => r.enrollmentDate, gran, [
      { key: "cash", get: (r) => r.cashCollected ?? 0 },
      { key: "revenue", get: (r) => r.revenue ?? 0 },
    ]),
    [d.cash, gran],
  );
  const byCohort = useMemo(() => groupSum(d.cash, (r) => r.cohort, (r) => r.cashCollected ?? 0), [d.cash]);

  return (
    <>
      <div className="kpi-grid">
        <Kpi label="Cash collected" value={fmtMoney(cash)} accent={COLORS.gold} sub="Sum of all Cash Tracker payments" />
        <Kpi label="Revenue booked" value={fmtMoney(revenue)} accent={COLORS.blue} sub="Full contract value" />
        <Kpi label="Outstanding" value={fmtMoney(revenue - cash)} accent={COLORS.red} sub="Revenue minus cash collected" />
        <Kpi label="Paying clients" value={fmtInt(clients)} sub="Rows in the Cash Tracker" />
        <Kpi label="Applications" value={fmtInt(apps)} sub={`${fmtInt(readyToInvest)} ready to invest`} />
        <Kpi label="Appointments" value={fmtInt(appts)} sub="All statuses" />
        <Kpi label="Show rate" value={fmtPct(showRate)} accent={COLORS.green} sub="Showed ÷ new calls (Sales Activity)" />
        <Kpi label="Close rate" value={fmtPct(closeRate)} accent={COLORS.green} sub="Sales ÷ shows (Sales Activity)" />
      </div>

      <Card
        title="Cash & revenue over time"
        sub="By enrollment date. Rows without a date are flagged in Data health and not plotted."
        right={<Chips options={[{ key: "day", label: "Daily" }, { key: "week", label: "Weekly" }, { key: "month", label: "Monthly" }]} active={gran} onChange={(k) => setGran(k as Granularity)} />}
      >
        <TimeAreaChart
          data={cashOverTime}
          isMoney
          series={[
            { key: "cash", name: "Cash collected", color: COLORS.gold },
            { key: "revenue", name: "Revenue booked", color: COLORS.blue },
          ]}
        />
      </Card>

      <Card title="Cash collected by cohort" sub="Which launch each dollar came from">
        <BreakdownBars data={byCohort} isMoney horizontal />
      </Card>
    </>
  );
}
