import { NextRequest, NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { fetchCashTracker } from "@/lib/sources/cashTracker";
import { fetchAppointments } from "@/lib/sources/appointments";
import { fetchApplications } from "@/lib/sources/applications";
import { fetchSalesActivity } from "@/lib/sources/salesActivity";
import { fetchChallengeSheet } from "@/lib/sources/challenge";
import type { ChallengeRow, SourceResult } from "@/lib/types";

export const dynamic = "force-dynamic";

async function isolate<T>(loader: () => Promise<SourceResult<T>>): Promise<SourceResult<T>> {
  try {
    return await loader();
  } catch (err: any) {
    return { rows: [], error: err?.message || "Unknown error", fetchedAt: Date.now() };
  }
}

async function isolateChallenge(): Promise<SourceResult<ChallengeRow> & { columns: string[] }> {
  try {
    return await fetchChallengeSheet();
  } catch (err: any) {
    return { rows: [], error: err?.message || "Unknown error", fetchedAt: Date.now(), columns: [] };
  }
}

async function buildPayload() {
  const [cash, appointments, applications, salesActivity, challenge] = await Promise.all([
    isolate(fetchCashTracker),
    isolate(fetchAppointments),
    isolate(fetchApplications),
    isolate(fetchSalesActivity),
    isolateChallenge(),
  ]);

  return {
    cash,
    appointments,
    applications,
    salesActivity,
    challenge,
    generatedAt: Date.now(),
  };
}

export async function GET(request: NextRequest) {
  const fresh = request.nextUrl.searchParams.get("fresh") === "1";
  const payload = await cached("dashboard", fresh, buildPayload);
  return NextResponse.json(payload);
}
