"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DashboardPayload } from "@/lib/types";
import { sum } from "@/lib/filtering";
import PulseBar from "@/components/PulseBar";
import Tabs, { type TabKey } from "@/components/Tabs";
import HealthPanel, { type HealthEntry } from "@/components/HealthPanel";
import NotionDiagnosticsPanel from "@/components/NotionDiagnosticsPanel";
import OverviewTab from "@/components/tabs/OverviewTab";
import CashTab from "@/components/tabs/CashTab";
import AppointmentsTab from "@/components/tabs/AppointmentsTab";
import ApplicationsTab from "@/components/tabs/ApplicationsTab";
import SalesActivityTab from "@/components/tabs/SalesActivityTab";
import ChallengeTab from "@/components/tabs/ChallengeTab";

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
      if (r.health.length) entries.push({ source: "Cash", id: r.id, label: r.name || r.id, flags: r.health });
    }
    for (const r of data.appointments.rows) {
      if (r.health.length) entries.push({ source: "Appointments", id: r.id, label: r.name || r.id, flags: r.health });
    }
    for (const r of data.applications.rows) {
      if (r.health.length)
        entries.push({ source: "Applications", id: r.id, label: r.firstName || r.id, flags: r.health });
    }
    for (const r of data.salesActivity.rows) {
      if (r.health.length) entries.push({ source: "Sales Activity", id: r.id, label: r.entry || r.id, flags: r.health });
    }
    for (const r of data.challenge.rows) {
      if (r.health.length) entries.push({ source: "Challenge", id: r.id, label: r.id, flags: r.health });
    }
    return entries;
  }, [data]);

  const cashCollected = data ? sum(data.cash.rows.filter((r) => !r.isTest).map((r) => r.cashCollected)) : 0;
  const revenueBooked = data ? sum(data.cash.rows.filter((r) => !r.isTest).map((r) => r.revenue)) : 0;
  const outstanding = data ? sum(data.cash.rows.filter((r) => !r.isTest).map((r) => r.balance)) : 0;

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
        outstanding={outstanding}
        updatedAt={data?.generatedAt ?? null}
        loading={loading}
        onRefresh={() => load(true)}
      />
      <div className="app-body">
        <Tabs active={activeTab} onChange={setActiveTab} />

        {loadError && <div className="error-banner">Failed to load dashboard: {loadError}</div>}

        {hasNotionError && <NotionDiagnosticsPanel />}

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
              />
            )}
            {activeTab === "cash" && <CashTab rows={data.cash.rows} />}
            {activeTab === "appointments" && <AppointmentsTab rows={data.appointments.rows} />}
            {activeTab === "applications" && <ApplicationsTab rows={data.applications.rows} />}
            {activeTab === "sales" && <SalesActivityTab rows={data.salesActivity.rows} />}
            {activeTab === "challenge" && <ChallengeTab rows={data.challenge.rows} columns={data.challenge.columns} />}

            <HealthPanel entries={healthEntries} />
          </>
        )}
      </div>
    </div>
  );
}
