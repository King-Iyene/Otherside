import { NextRequest, NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { fetchCashTracker } from "@/lib/sources/cashTracker";
import { fetchAppointments } from "@/lib/sources/appointments";
import { fetchApplications } from "@/lib/sources/applications";
import { fetchSalesActivity } from "@/lib/sources/salesActivity";
import { fetchChallengeSheet } from "@/lib/sources/challenge";
import { resolveTokenFromRequest } from "@/lib/notionAuth";
// Duplicate detection is kept for Applications and Challenge registrations —
// the Cash Tracker is intentionally per-transaction so duplicates there are
// expected (installments/upgrades), but a duplicate application or same-person
// registering twice for the same challenge is a real ops issue.
import {
  flagDuplicateApplications,
  flagDuplicateChallengeRegistrations,
  reconcileCrossSourceCohortFlags,
} from "@/lib/dataHealth";
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

async function buildPayload(token: string | null, authMode: string) {
  const notionCall = async <T>(fn: (t: string) => Promise<SourceResult<T>>): Promise<SourceResult<T>> => {
    if (!token) {
      return {
        rows: [],
        error:
          "No Notion access. Either connect your own Notion account (top-right Connect button), or set NOTION_TOKEN in Vercel env vars.",
        fetchedAt: Date.now(),
      };
    }
    return isolate(() => fn(token));
  };

  const [cash, appointments, applications, salesActivity, challenge] = await Promise.all([
    notionCall(fetchCashTracker),
    notionCall(fetchAppointments),
    notionCall(fetchApplications),
    notionCall(fetchSalesActivity),
    isolateChallenge(),
  ]);

  // Cross-row post-pass — flag duplicate applications and duplicate Challenge
  // registrations (same email + same product). Cash duplicates are intentional.
  if (applications.rows.length) flagDuplicateApplications(applications.rows);
  if (challenge.rows.length) flagDuplicateChallengeRegistrations(challenge.rows);
  // Cross-source cohort reconciliation: if a Cash Tracker row's Cohort field
  // isn't canonical but a matching Challenge Sheet row (same email) has the
  // exact same text, both systems already agree — drop the flag instead of
  // treating Notion in isolation.
  if (cash.rows.length && challenge.rows.length) reconcileCrossSourceCohortFlags(cash.rows, challenge.rows);

  return {
    cash,
    appointments,
    applications,
    salesActivity,
    challenge,
    authMode,
    generatedAt: Date.now(),
  };
}

export async function GET(request: NextRequest) {
  const fresh = request.nextUrl.searchParams.get("fresh") === "1";
  const { token, authMode } = resolveTokenFromRequest(request);
  // Cache-key includes the auth mode + token identity so an OAuth user's data
  // doesn't leak into the env-fallback cache and vice versa.
  const cacheKey = `dashboard:${authMode}:${token ? token.slice(-8) : "none"}`;
  const payload = await cached(cacheKey, fresh, () => buildPayload(token, authMode));
  return NextResponse.json(payload);
}
