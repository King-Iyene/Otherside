"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DashboardPayload } from "@/lib/types";
import { sum } from "@/lib/filtering";
import { challengeCashStats } from "@/lib/crossSource";
import PulseBar from "@/components/PulseBar";
import Tabs, { type TabKey } from "@/components/Tabs";
import HealthPanel, { type HealthEntry } from "@/components/HealthPanel";
import NotionDiagnosticsPanel from "@/components/NotionDiagnosticsPanel";
import OverviewTab from "@/components/tabs/OverviewTab";
import CohortFunnels from "@/components/tabs/CohortFunnels";
import CashTab from "@/components/tabs/CashTab";
import AppointmentsTab from "@/components/tabs/AppointmentsTab";
import ApplicationsTab from "@/components/tabs/ApplicationsTab";
import SalesActivityTab from "@/components/tabs/SalesActivityTab";
import ChallengeTab from "@/components/tabs/ChallengeTab";
import ReconciliationTab from "@/components/tabs/ReconciliationTab";
import GuideTab from "@/components/tabs/GuideTab";
import PaymentsTab from "@/components/tabs/PaymentsTab";

const SOURCE_LABELS: Record<string, string> = {
  cash: "Reborn Cash Tracker",
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
  // Challenge-sheet duplicate registrations are noisy and often expected, so they
  // are ignored by default. A toggle in the Data Health panel brings them back.
  const [includeChallengeDupes, setIncludeChallengeDupes] = useState(false);

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
    // Source labels spell out the actual system + database name so a non-technical
    // reader can go straight to the right place. "Cash" alone doesn't tell you it
    // lives in Notion under "Reborn Cash Tracker".
    for (const r of data.cash.rows) {
      if (r.health.length) entries.push({ source: "Notion · Reborn Cash Tracker", id: r.id, label: r.name || r.id, flags: r.health });
    }
    for (const r of data.appointments.rows) {
      if (r.health.length) entries.push({ source: "Notion · Appointments Tracker", id: r.id, label: r.name || r.id, flags: r.health });
    }
    for (const r of data.applications.rows) {
      if (r.health.length)
        entries.push({ source: "Notion · REBORN Application Tracker", id: r.id, label: r.firstName || r.id, flags: r.health });
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
  }, [data, includeChallengeDupes]);

  const rebornCash = data ? sum(data.cash.rows.filter((r) => !r.isTest).map((r) => r.cashCollected)) : 0;
  const challengeCash = data ? challengeCashStats(data.challenge.rows).cashCollected : 0;
  // Top header is the all-time pulse — Cash Collected combines both revenue
  // streams (Reborn + Challenge) so it's the true total. Revenue Booked is
  // Reborn only. (Outstanding intentionally omitted: once the cash tracker logs
  // every installment on its own row, a per-row balance can't be trusted.)
  const cashCollected = rebornCash + challengeCash;
  const revenueBooked = data ? sum(data.cash.rows.filter((r) => !r.isTest).map((r) => r.revenue)) : 0;

  const sourceErrors = data
    ? (["cash", "appointments", "applications", "salesActivity", "challenge"] as const)
        .map((key) => ({ key, error: data[key].error }))
        .filter((x) => x.error)
    : [];

  const hasNotionError = data
    ? !!(data.cash.error || data.appointments.error || data.applications.error || data.salesActivity.error)
    : false;

  return (
    <div className="app-shell">
      <PulseBar
        cashCollected={cashCollected}
        revenueBooked={revenueBooked}
        updatedAt={data?.generatedAt ?? null}
        loading={loading}
        onRefresh={() => load(true)}
        dataQualityIssues={healthEntries.reduce((s, e) => s + e.flags.length, 0)}
        scopeNote="All-time · Cash Collected includes Challenge"
      />
      <div className="app-body">
        <Tabs active={activeTab} onChange={setActiveTab} />

        {loadError && <div className="error-banner">Failed to load dashboard: {loadError}</div>}

        {data && <NotionDiagnosticsPanel alwaysShow />}
        {/* eslint-disable-next-line @typescript-eslint/no-unused-expressions */}
        {hasNotionError && null}

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
              />
            )}
            {activeTab === "insights" && (
              <CohortFunnels
                cash={data.cash.rows}
                appointments={data.appointments.rows}
                applications={data.applications.rows}
                challenge={data.challenge.rows}
              />
            )}
            {activeTab === "cash" && <CashTab rows={data.cash.rows} />}
            {activeTab === "payments" && <PaymentsTab rows={data.cash.rows} />}
            {activeTab === "appointments" && <AppointmentsTab rows={data.appointments.rows} />}
            {activeTab === "applications" && <ApplicationsTab rows={data.applications.rows} />}
            {activeTab === "sales" && <SalesActivityTab rows={data.salesActivity.rows} />}
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

            {activeTab !== "guide" && (
              <HealthPanel
                entries={healthEntries}
                includeChallengeDupes={includeChallengeDupes}
                onToggleChallengeDupes={setIncludeChallengeDupes}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
