import { NextRequest, NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { fetchCashTracker } from "@/lib/sources/cashTracker";
import { fetchStripeCharges } from "@/lib/sources/stripe";
import { reconcile, type ReconciliationReport } from "@/lib/reconciliation";
import { resolveTokenFromRequest } from "@/lib/notionAuth";

export const dynamic = "force-dynamic";

async function buildReport(notionToken: string | null): Promise<ReconciliationReport> {
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeKey) {
    return {
      rows: [],
      summary: {
        totalCashTrackerRows: 0,
        totalStripeCharges: 0,
        matched: 0,
        amountMismatch: 0,
        refundUnrecorded: 0,
        noStripeCharge: 0,
        stripeOnly: 0,
        cashTrackerTotalCents: 0,
        stripeCollectedCents: 0,
        stripeRefundedCents: 0,
        coverageRatio: null,
      },
      fetchedAt: Date.now(),
      mode: "live",
      error: "STRIPE_SECRET_KEY is not set in the environment.",
    };
  }

  if (!notionToken) {
    return {
      rows: [],
      summary: {
        totalCashTrackerRows: 0,
        totalStripeCharges: 0,
        matched: 0,
        amountMismatch: 0,
        refundUnrecorded: 0,
        noStripeCharge: 0,
        stripeOnly: 0,
        cashTrackerTotalCents: 0,
        stripeCollectedCents: 0,
        stripeRefundedCents: 0,
        coverageRatio: null,
      },
      fetchedAt: Date.now(),
      mode: "live",
      error: "No Notion token available. Connect Notion first.",
    };
  }

  // Fetch both sources in parallel
  const [cash, stripe] = await Promise.all([
    fetchCashTracker(notionToken).catch((err) => ({ rows: [], error: err?.message || String(err), fetchedAt: Date.now() })),
    fetchStripeCharges(stripeKey),
  ]);

  if (stripe.error) {
    return {
      rows: [],
      summary: {
        totalCashTrackerRows: cash.rows.length,
        totalStripeCharges: 0,
        matched: 0,
        amountMismatch: 0,
        refundUnrecorded: 0,
        noStripeCharge: 0,
        stripeOnly: 0,
        cashTrackerTotalCents: 0,
        stripeCollectedCents: 0,
        stripeRefundedCents: 0,
        coverageRatio: null,
      },
      fetchedAt: Date.now(),
      mode: stripe.mode,
      error: stripe.error,
    };
  }

  const result = reconcile(cash.rows, stripe.charges);
  return {
    ...result,
    fetchedAt: Date.now(),
    mode: stripe.mode,
    error: null,
  };
}

export async function GET(request: NextRequest) {
  const fresh = request.nextUrl.searchParams.get("fresh") === "1";
  const { token } = resolveTokenFromRequest(request);
  const cacheKey = `reconciliation:${token ? token.slice(-8) : "none"}`;
  const payload = await cached(cacheKey, fresh, () => buildReport(token));
  return NextResponse.json(payload);
}
