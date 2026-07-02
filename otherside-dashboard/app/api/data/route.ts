import { NextRequest, NextResponse } from "next/server";
import { queryAllPages } from "@/lib/notion";
import { fetchChallengeSheet } from "@/lib/sheets";
import {
  transformCash, transformAppointments, transformApplications, transformSalesActivity,
} from "@/lib/transform";
import type { DashboardData, HealthFlag } from "@/lib/types";

export const dynamic = "force-dynamic";

// Database IDs — verified against the live Notion workspace schemas.
const DB = {
  cash: "367c2386-6468-80af-bbe1-d5f6d2510876",          // Reborn Cash Tracker
  appointments: "368c2386-6468-803e-8fac-fe68a4ed8a6a",  // Appointments Tracker
  applications: "33ec2386-6468-8004-b411-d9243b1f17e5",  // REBORN Application Tracker
  salesActivity: "25ac2fe5-3b3e-450b-bf9f-4a485cf6a410", // Sales Activity Tracker Daily Inputs
};

// In-memory cache. Keeps us far below Notion's 3 req/s average limit and
// makes the dashboard instant for everyone after the first load.
const CACHE_TTL_MS = 120_000; // 2 minutes
let cache: { at: number; data: DashboardData } | null = null;
let inflight: Promise<DashboardData> | null = null;

async function loadAll(): Promise<DashboardData> {
  const health: HealthFlag[] = [];
  const errors: { dataset: string; message: string }[] = [];

  // Each dataset is isolated: one failure never blanks the whole dashboard.
  const safe = async <T>(dataset: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await fn(); }
    catch (e: any) {
      errors.push({ dataset, message: e?.message ?? "Unknown error" });
      return fallback;
    }
  };

  const [cashPages, apptPages, appPages, salesPages, challengeSheet] = await Promise.all([
    safe("Cash Tracker", () => queryAllPages(DB.cash), [] as any[]),
    safe("Appointments", () => queryAllPages(DB.appointments), [] as any[]),
    safe("Applications", () => queryAllPages(DB.applications), [] as any[]),
    safe("Sales Activity", () => queryAllPages(DB.salesActivity), [] as any[]),
    fetchChallengeSheet(),
  ]);

  return {
    fetchedAt: new Date().toISOString(),
    cash: transformCash(cashPages, health),
    appointments: transformAppointments(apptPages, health),
    applications: transformApplications(appPages, health),
    salesActivity: transformSalesActivity(salesPages, health),
    challengeSheet,
    health,
    errors,
  };
}

export async function GET(req: NextRequest) {
  const fresh = req.nextUrl.searchParams.get("fresh") === "1";
  const now = Date.now();

  if (!fresh && cache && now - cache.at < CACHE_TTL_MS) {
    return NextResponse.json({ ...cache.data, cached: true });
  }
  // Deduplicate concurrent loads so parallel visitors trigger one fetch.
  if (!inflight) {
    inflight = loadAll().finally(() => { inflight = null; });
  }
  try {
    const data = await inflight;
    cache = { at: Date.now(), data };
    return NextResponse.json({ ...data, cached: false });
  } catch (e: any) {
    if (cache) return NextResponse.json({ ...cache.data, cached: true, stale: true });
    return NextResponse.json({ error: e?.message ?? "Failed to load data" }, { status: 500 });
  }
}
