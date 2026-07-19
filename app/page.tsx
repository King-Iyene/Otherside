"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DashboardPayload } from "@/lib/types";
import { sum } from "@/lib/filtering";
import { challengeCashStats } from "@/lib/crossSource";
import PulseBar from "@/components/PulseBar";
import Tabs, { TAB_KEYS, type TabKey } from "@/components/Tabs";
import { DEFAULT_ROLE, roleDef, tabsForRole, type Role } from "@/lib/roles";
import HealthPanel, { type HealthEntry } from "@/components/HealthPanel";
import { detectColumnHealth } from "@/lib/schemaHealth";
import NotionDiagnosticsPanel from "@/components/NotionDiagnosticsPanel";
import OverviewTab from "@/components/tabs/OverviewTab";
import CohortFunnels from "@/components/tabs/CohortFunnels";
import InsightsTab from "@/components/tabs/InsightsTab";
import CashTab from "@/components/tabs/CashTab";
import AppointmentsTab from "@/components/tabs/AppointmentsTab";
import ApplicationsTab from "@/components/tabs/ApplicationsTab";
import SalesActivityTab from "@/components/tabs/SalesActivityTab";
import ChallengeTab from "@/components/tabs/ChallengeTab";
import ReconciliationTab from "@/components/tabs/ReconciliationTab";
import GuideTab from "@/components/tabs/GuideTab";
import PaymentsTab from "@/components/tabs/PaymentsTab";
import AdjustmentsTab from "@/components/tabs/AdjustmentsTab";

const SOURCE_LABELS: Record<string, string> = {
  cash: "Reborn Cash Tracker",
  masterCrm: "Master REBORN CRM",
  appointments: "Appointments Tracker",
  applications: "REBORN Application Tracker",
  salesActivity: "Sales Activity Tracker",
  challenge: "Challenge Master Cash Tracker (Google Sheet)",
};

export default function Home() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [role, setRole] = useState<Role>(DEFAULT_ROLE);
  const [viewerName, setViewerName] = useState<string>("");
  const [includeChallengeDupes, setIncludeChallengeDupes] = useState(false);
  const [includeAppDupes, setIncludeAppDupes] = useState(false);

  const isCloser = role === "closer";

  useEffect(() => {
    let alive = true;
    fetch("/api/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && j?.role) setRole(j.role as Role);
      })
      .catch(() => {});
    try {
      const n = window.localStorage.getItem("otherside_name");
      if (n) setViewerName(n);
    } catch {
      /* ignore */
    }
    return () => {
      alive = false;
    };
  }, []);

  const allowedTabs = useMemo(() => tabsForRole(role, TAB_KEYS), [role]);
  useEffect(() => {
    if (!allowedTabs.includes(activeTab)) setActiveTab(allowedTabs[0] ?? "overview");
  }, [allowedTabs, activeTab]);

  const load = useCallback(async (fresh: boolean) => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/dashboard${fresh ? "?fresh=1" : ""}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
      const json: DashboardPayload = await res.json();
      setData(json);
    } catch (err: any) {
      setLoadError(err?.message || "Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  const healthEntries: HealthEntry[] = useMemo(() => {
    if (!data) return [];
    const entries: HealthEntry[] = [];
    for (const r of data.cash.rows) {
      if (r.health.length) entries.push({ source: "Notion · Reborn Cash Tracker", id: r.id, label: r.name || r.id, flags: r.health });
    }
    for (const r of data.appointments.rows) {
      if (r.health.length) entries.push({ source: "Notion · Appointments Tracker", id: r.id, label: r.name || r.id, flags: r.health });
    }
    for (const r of data.applications.rows) {
      const flags = includeAppDupes ? r.health : r.health.filter((f) => f.kind !== "duplicate_application");
      if (flags.length) entries.push({ source: "Notion · REBORN Application Tracker", id: r.id, label: r.firstName || r.id, flags });
    }
    for (const r of data.salesActivity.rows) {
      if (r.health.length) entries.push({ source: "Notion · Sales Activity Tracker", id: r.id, label: r.entry || r.id, flags: r.health });
    }
    for (const r of data.challenge.rows) {
      const flags = includeChallengeDupes
        ? r.health
        : r.health.filter((f) => f.kind !== "duplicate_challenge_registration");
      if (flags.length) entries.push({ source: "Google Sheet · Challenge Master Cash Tracker", id: r.id, label: r.id, flags });
    }
    return entries;
  }, [data, includeChallengeDupes, includeAppDupes]);

  const columnWarnings = useMemo(() => (data ? detectColumnHealth(data) : []), [data]);

  const nonTestCash = data ? data.cash.rows.filter((r) => !r.isTest) : [];
  const isPositiveTx = (r: typeof nonTestCash[number]) => r.transactionType !== "Refund";
  const isRefundTx = (r: typeof nonTestCash[number]) => r.transactionType === "Refund";

  const grossRebornCash = data ? sum(nonTestCash.filter(isPositiveTx).map((r) => r.cashCollected)) : 0;
  const refundedCash = data ? sum(nonTestCash.filter(isRefundTx).map((r) => r.cashCollected)) : 0;
  const rebornCash = grossRebornCash - refundedCash;
  const challengeCash = data ? challengeCashStats(data.challenge.rows).cashCollected : 0;
  const cashCollected = rebornCash + challengeCash;

  const grossRevenue = data ? sum(nonTestCash.filter(isPositiveTx).map((r) => r.revenue)) : 0;
  const refundedRevenue = data ? sum(nonTestCash.filter(isRefundTx).map((r) => r.revenue)) : 0;
  const revenueBooked = grossRevenue - refundedRevenue + challengeCash;

  const sourceErrors = data
    ? (["cash", "masterCrm", "appointments", "applications", "salesActivity", "challenge"] as const)
        .map((key) => ({ key, error: data[key].error }))
        .filter((x) => x.error)
    : [];

  return (
    <div className="app-shell">
      <PulseBar
        cashCollected={cashCollected}
        revenueBooked={revenueBooked}
        updatedAt={data?.generatedAt ?? null}
        loading={loading}
        onRefresh={() => load(true)}
        dataQualityIssues={isCloser ? 0 : healthEntries.reduce((s, e) => s + e.flags.length, 0)}
        scopeNote="All-time · Cash Collected includes Challenge"
      />
      <div className="app-body">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "0 0 12px" }}>
          <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.06, color: "var(--muted)", fontWeight: 700 }}>
            {viewerName ? `${viewerName} · ` : ""}
            {roleDef(role).label}
          </span>
          <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{roleDef(role).blurb}</span>
          <a
            href="/api/logout"
            style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)", textDecoration: "none" }}
            title="Sign out and switch role"
          >
            Sign out ↩
          </a>
        </div>
        <Tabs active={activeTab} onChange={setActiveTab} allowed={allowedTabs} />

        {loadError && <div className="error-banner">Failed to load dashboard: {loadError}</div>}

        {!isCloser && data && <NotionDiagnosticsPanel alwaysShow />}

        {sourceErrors.map(({ key, error }) => (
          <div className="error-banner" key={key}>
            {SOURCE_LABELS[key]} failed to load: {error}. Other tabs remain available.
          </div>
        ))}

        {!data && !loadError && <div className="empty-state">Loading dashboard…</div>}

        {data && (
          <>
            {activeTab === "overview" && (
              <OverviewTab
                cash={data.cash.rows}
                appointments={data.appointments.rows}
                applications={data.applications.rows}
                salesActivity={data.salesActivity.rows}
                challenge={data.challenge.rows}
                hideOpsUI={isCloser}
              />
            )}
            {activeTab === "insights" && (
              <>
                <InsightsTab
                  cash={data.cash.rows}
                  applications={data.applications.rows}
                  appointments={data.appointments.rows}
                  salesActivity={data.salesActivity.rows}
                  challenge={data.challenge.rows}
                />
                <CohortFunnels
                  cash={data.cash.rows}
                  appointments={data.appointments.rows}
                  applications={data.applications.rows}
                  challenge={data.challenge.rows}
                />
              </>
            )}
            {activeTab === "cash" && <CashTab rows={data.cash.rows} hideOpsUI={isCloser} />}
            {activeTab === "adjustments" && (
              <AdjustmentsTab rows={data.cash.rows} masterCrm={data.masterCrm.rows} hideOpsUI={isCloser} />
            )}
            {activeTab === "payments" && <PaymentsTab rows={data.cash.rows} />}
            {activeTab === "appointments" && <AppointmentsTab rows={data.appointments.rows} hideOpsUI={isCloser} />}
            {activeTab === "applications" && <ApplicationsTab rows={data.applications.rows} hideOpsUI={isCloser} />}
            {activeTab === "sales" && <SalesActivityTab rows={data.salesActivity.rows} hideOpsUI={isCloser} />}
            {activeTab === "challenge" && (
              <ChallengeTab
                rows={data.challenge.rows}
                columns={data.challenge.columns}
                gid={data.challenge.gid}
                sheetUrl={data.challenge.sheetUrl}
              />
            )}
            {activeTab === "reconciliation" && <ReconciliationTab />}
            {activeTab === "guide" && <GuideTab />}

            {activeTab !== "guide" && !isCloser && (
              <HealthPanel
                entries={healthEntries}
                includeChallengeDupes={includeChallengeDupes}
                onToggleChallengeDupes={setIncludeChallengeDupes}
                includeAppDupes={includeAppDupes}
                onToggleAppDupes={setIncludeAppDupes}
                columnWarnings={columnWarnings}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
