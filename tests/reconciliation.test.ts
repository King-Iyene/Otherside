import { describe, expect, it } from "vitest";
import { reconcile } from "../lib/reconciliation";
import type { CashRow } from "../lib/types";
import type { StripeCharge } from "../lib/sources/stripe";

describe("reconciliation.reconcile", () => {
  it("matches exact amount + email + same-day date", () => {
    const cash = [row("kelly@x.com", 8000, "2025-12-15", "Erupt 1")];
    const stripe = [charge("kelly@x.com", 800_000, "2025-12-15")]; // 8000 dollars = 800_000 cents
    const r = reconcile(cash, stripe);
    expect(r.rows[0].verdict).toBe("MATCHED_EXACT");
    expect(r.rows[0].deltaCents).toBe(0);
    expect(r.summary.matched).toBe(1);
  });

  it("matches within date tolerance (±3 days)", () => {
    const cash = [row("kelly@x.com", 500, "2025-12-15")];
    const stripe = [charge("kelly@x.com", 50_000, "2025-12-17")]; // 2 days later
    const r = reconcile(cash, stripe);
    expect(r.rows[0].verdict).toBe("MATCHED_EXACT");
  });

  it("falls back to MATCHED_LOOSE when dates diverge", () => {
    const cash = [row("kelly@x.com", 500, "2025-12-01")];
    const stripe = [charge("kelly@x.com", 50_000, "2025-06-01")]; // 6 months apart
    const r = reconcile(cash, stripe);
    expect(r.rows[0].verdict).toBe("MATCHED_LOOSE");
    expect(r.rows[0].deltaCents).toBe(0);
  });

  it("catches Stripe fees via 5% tolerance", () => {
    // Cash Tracker says $1000, Stripe collected $970 (3% fee eaten)
    const cash = [row("kelly@x.com", 1000, "2025-12-15")];
    const stripe = [charge("kelly@x.com", 97_000, "2025-12-15")];
    const r = reconcile(cash, stripe);
    expect(r.rows[0].verdict).toBe("MATCHED_FEE");
    expect(r.rows[0].deltaCents).toBe(3000); // Cash Tracker 100000 - Stripe 97000 = 3000 cents
  });

  it("flags amount mismatch when Cash Tracker and Stripe don't agree", () => {
    const cash = [row("kelly@x.com", 8000, "2025-12-15")];
    const stripe = [charge("kelly@x.com", 500_000, "2025-12-15")]; // Stripe only got $5000
    const r = reconcile(cash, stripe);
    expect(r.rows[0].verdict).toBe("AMOUNT_MISMATCH");
    expect(r.rows[0].deltaCents).toBe(300_000); // 800000 - 500000 = 300000
  });

  it("flags refund not recorded in Cash Tracker", () => {
    // Cash Tracker still shows $1000; Stripe collected $1000 gross but $500 refunded
    const cash = [row("kelly@x.com", 1000, "2025-12-15")];
    const stripe = [{ ...charge("kelly@x.com", 100_000, "2025-12-15"), amountRefunded: 50_000, netCollected: 50_000 }];
    const r = reconcile(cash, stripe);
    expect(r.rows[0].verdict).toBe("REFUND_UNRECORDED");
  });

  it("flags no Stripe charge when email has none", () => {
    const cash = [row("wire-payer@x.com", 5000, "2025-12-15")];
    const stripe = [charge("someone-else@x.com", 500_000, "2025-12-15")];
    const r = reconcile(cash, stripe);
    expect(r.rows[0].verdict).toBe("NO_STRIPE_CHARGE");
    expect(r.summary.noStripeCharge).toBe(1);
  });

  it("surfaces Stripe-only charges (missing enrollment entry)", () => {
    const cash: CashRow[] = [];
    const stripe = [charge("ghost@x.com", 500_000, "2025-12-15")];
    const r = reconcile(cash, stripe);
    expect(r.rows[0].verdict).toBe("STRIPE_ONLY");
    expect(r.summary.stripeOnly).toBe(1);
  });

  it("ignores test rows in Cash Tracker", () => {
    const cash = [{ ...row("real@x.com", 100, "2025-12-15") }, { ...row("test@x.com", 999, "2025-12-15"), isTest: true }];
    const stripe = [charge("real@x.com", 10_000, "2025-12-15")];
    const r = reconcile(cash, stripe);
    // Only the real row is reconciled
    expect(r.rows.length).toBe(1);
    expect(r.rows[0].cashRow?.email).toBe("real@x.com");
    expect(r.summary.totalCashTrackerRows).toBe(1);
  });

  it("matches multiple invoices to multiple Stripe charges 1:1", () => {
    // Javid's payment plan: 2 rows × $3000, 2 Stripe charges × $3000
    const cash = [
      row("javid@x.com", 3000, "2025-06-27"),
      row("javid@x.com", 3000, "2025-07-27"),
    ];
    const stripe = [
      charge("javid@x.com", 300_000, "2025-06-27"),
      charge("javid@x.com", 300_000, "2025-07-27"),
    ];
    const r = reconcile(cash, stripe);
    expect(r.rows.filter((x) => x.verdict === "MATCHED_EXACT").length).toBe(2);
    // No stripe-only leftovers
    expect(r.summary.stripeOnly).toBe(0);
  });

  it("computes coverage ratio", () => {
    const cash = [row("a@x.com", 100, "2025-12-15")];
    const stripe = [charge("a@x.com", 10_000, "2025-12-15")];
    const r = reconcile(cash, stripe);
    expect(r.summary.coverageRatio).toBe(1);
  });

  it("case-insensitive on email match", () => {
    const cash = [row("Kelly@Example.com", 100, "2025-12-15")];
    // Stripe charge already normalized to lowercase in the source adapter
    const stripe = [charge("kelly@example.com", 10_000, "2025-12-15")];
    const r = reconcile(cash, stripe);
    // Cash tracker email is not lowercased here — but the reconciler normalizes internally
    expect(r.rows[0].verdict).toBe("MATCHED_EXACT");
  });
});

// ────────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────────

function row(email: string, cashCollected: number, enrollmentDate: string, product: string | null = null): CashRow {
  return {
    id: Math.random().toString(),
    isTest: false,
    health: [],
    name: "T",
    email,
    product,
    cohort: null,
    enrollmentDate,
    revenue: cashCollected,
    cashCollected,
    balance: null,
    couponCode: null,
    paymentMethod: null,
    nextPaymentDate: null,
    enrManager: null,
    note: null,
  };
}

function charge(email: string, amountCents: number, dateStr: string): StripeCharge {
  const t = new Date(dateStr).getTime();
  return {
    id: `ch_${Math.random().toString(36).slice(2, 10)}`,
    amount: amountCents,
    amountRefunded: 0,
    netCollected: amountCents,
    currency: "usd",
    status: "succeeded",
    paid: true,
    refunded: false,
    email,
    customerId: null,
    description: null,
    createdAt: t,
    metadata: {},
    productHint: null,
    couponHint: null,
    receiptUrl: null,
  };
}
