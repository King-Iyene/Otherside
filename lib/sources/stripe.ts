import Stripe from "stripe";

/**
 * Stripe source adapter — READ ONLY.
 *
 * The key we accept is a Restricted Key (rk_live_... / rk_test_...) scoped
 * with Read-only permissions on Charges/Refunds/Customers/PaymentIntents.
 * This file only calls .list() methods. There is no .create/.update/.del
 * anywhere in this codebase. Even if the code tried, the restricted key
 * would return 403 from Stripe.
 *
 * We paginate the full history (Stripe caps at 100 per page) with a hard
 * safety limit of 10,000 charges per fetch. If you have more, we can add
 * a `since` cursor param.
 */

const MAX_PAGES = 100; // 100 pages × 100 items = 10k charges max per pull

export interface StripeCharge {
  id: string;
  amount: number; // cents
  amountRefunded: number; // cents
  netCollected: number; // cents (amount - amountRefunded)
  currency: string;
  status: string;
  paid: boolean;
  refunded: boolean;
  email: string | null; // lowercased
  customerId: string | null;
  description: string | null;
  createdAt: number; // epoch ms
  metadata: Record<string, string>;
  /** Best-effort product name from description or metadata.product. */
  productHint: string | null;
  /** Coupon/discount applied at the invoice level, if any. */
  couponHint: string | null;
  receiptUrl: string | null;
}

export interface StripeSyncResult {
  charges: StripeCharge[];
  totalCollectedCents: number;
  totalRefundedCents: number;
  fetchedAt: number;
  mode: "live" | "test";
  error: string | null;
}

function detectMode(key: string): "live" | "test" {
  // rk_live_..., sk_live_..., rk_test_..., sk_test_...
  return /_test_/.test(key) ? "test" : "live";
}

const norm = (s: string | null | undefined) => (s ? s.trim().toLowerCase() : "");

function extractProductHint(charge: Stripe.Charge): string | null {
  const md = charge.metadata || {};
  if (md.product) return md.product;
  if (md.plan) return md.plan;
  if (md.tier) return md.tier;
  // Fall back to the free-text description
  if (charge.description) return charge.description;
  return null;
}

function extractCouponHint(charge: Stripe.Charge): string | null {
  const md = charge.metadata || {};
  if (md.coupon) return md.coupon;
  if (md.discount) return md.discount;
  if (md.promo_code) return md.promo_code;
  return null;
}

export async function fetchStripeCharges(apiKey: string): Promise<StripeSyncResult> {
  if (!apiKey) {
    return {
      charges: [],
      totalCollectedCents: 0,
      totalRefundedCents: 0,
      fetchedAt: Date.now(),
      mode: "live",
      error: "STRIPE_SECRET_KEY is not set.",
    };
  }

  const mode = detectMode(apiKey);
  const stripe = new Stripe(apiKey, { apiVersion: "2024-09-30.acacia", typescript: true } as any);

  try {
    const charges: StripeCharge[] = [];
    let startingAfter: string | undefined = undefined;
    let totalCollected = 0;
    let totalRefunded = 0;

    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await stripe.charges.list({
        limit: 100,
        starting_after: startingAfter,
      });

      for (const c of res.data) {
        const amountRefunded = c.amount_refunded ?? 0;
        const net = c.amount - amountRefunded;
        // Only count successful/paid charges in totals
        if (c.paid && c.status === "succeeded") {
          totalCollected += net;
          totalRefunded += amountRefunded;
        }
        charges.push({
          id: c.id,
          amount: c.amount,
          amountRefunded,
          netCollected: net,
          currency: c.currency,
          status: c.status,
          paid: c.paid,
          refunded: c.refunded,
          email: norm(c.billing_details?.email ?? c.receipt_email ?? null) || null,
          customerId: typeof c.customer === "string" ? c.customer : c.customer?.id ?? null,
          description: c.description ?? null,
          createdAt: c.created * 1000,
          metadata: (c.metadata as Record<string, string>) || {},
          productHint: extractProductHint(c),
          couponHint: extractCouponHint(c),
          receiptUrl: c.receipt_url ?? null,
        });
      }

      if (!res.has_more || res.data.length === 0) break;
      startingAfter = res.data[res.data.length - 1].id;
    }

    return {
      charges,
      totalCollectedCents: totalCollected,
      totalRefundedCents: totalRefunded,
      fetchedAt: Date.now(),
      mode,
      error: null,
    };
  } catch (err: any) {
    return {
      charges: [],
      totalCollectedCents: 0,
      totalRefundedCents: 0,
      fetchedAt: Date.now(),
      mode,
      error: err?.message || "Unknown Stripe error",
    };
  }
}
