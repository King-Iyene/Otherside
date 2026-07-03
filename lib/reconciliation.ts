import type { CashRow } from "./types";
import type { StripeCharge } from "./sources/stripe";

/**
 * Reconciliation engine — matches Cash Tracker rows against Stripe charges.
 *
 * Matching is a fuzzy multi-signal join. We try progressively looser matches
 * and record which signal succeeded so the UI can show WHY something
 * matched (or didn't). Read-only — never writes back to Cash Tracker or Stripe.
 *
 * The main verdicts:
 *   MATCHED_EXACT     — same email + amount (cents) + date ±3 days
 *   MATCHED_LOOSE     — same email + amount (any date)
 *   MATCHED_FEE       — same email + amount within ±5%  (catches Stripe processing fees)
 *   AMOUNT_MISMATCH   — same email exists in Stripe but amounts differ
 *   REFUND_UNRECORDED — Stripe shows a refund; Cash Tracker hasn't been updated
 *   NO_STRIPE_CHARGE  — Cash Tracker row has no Stripe match (could be wire/PayPal/comp)
 *   STRIPE_ONLY       — Stripe charge with no matching Cash Tracker row (missing enrollment entry)
 */

export type Verdict =
  | "MATCHED_EXACT"
  | "MATCHED_LOOSE"
  | "MATCHED_FEE"
  | "AMOUNT_MISMATCH"
  | "REFUND_UNRECORDED"
  | "NO_STRIPE_CHARGE"
  | "STRIPE_ONLY";

export interface ReconciliationRow {
  verdict: Verdict;
  cashRow: CashRow | null;
  stripeCharge: StripeCharge | null;
  /** Delta in cents when both sides present. Positive = Stripe collected less than Cash Tracker says. */
  deltaCents: number | null;
  /** How the match was found — for the UI drill-down. */
  matchSignal: string;
  /** Days between enrollment date and Stripe charge (for matched rows). */
  daysApart: number | null;
  /** Notes about coupon / product mismatches. */
  notes: string[];
}

export interface ReconciliationReport {
  rows: ReconciliationRow[];
  summary: {
    totalCashTrackerRows: number;
    totalStripeCharges: number;
    matched: number;
    amountMismatch: number;
    refundUnrecorded: number;
    noStripeCharge: number;
    stripeOnly: number;
    cashTrackerTotalCents: number;
    stripeCollectedCents: number;
    stripeRefundedCents: number;
    /** Cash Tracker total ÷ Stripe collected. 1.0 = perfect agreement. */
    coverageRatio: number | null;
  };
  fetchedAt: number;
  mode: "live" | "test";
  error: string | null;
}

const DAY_MS = 86_400_000;
const EXACT_DAYS = 3;

function toCents(dollars: number | null | undefined): number {
  if (dollars === null || dollars === undefined) return 0;
  return Math.round(dollars * 100);
}

function daysBetween(a: number, b: number): number {
  return Math.abs(a - b) / DAY_MS;
}

function norm(v: string | null | undefined): string {
  return v ? v.trim().toLowerCase() : "";
}

function stringsMentionEachOther(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const na = a.toLowerCase();
  const nb = b.toLowerCase();
  return na.includes(nb) || nb.includes(na);
}

/**
 * Try to match a single Cash Tracker row against every remaining Stripe
 * charge for the same email. Returns the best match and its signal.
 */
function findBestMatch(cash: CashRow, candidates: StripeCharge[]): {
  charge: StripeCharge | null;
  verdict: Verdict;
  signal: string;
  daysApart: number | null;
  deltaCents: number | null;
  notes: string[];
} {
  const cashCents = toCents(cash.cashCollected);
  const cashDate = cash.enrollmentDate ? new Date(cash.enrollmentDate).getTime() : null;
  const notes: string[] = [];

  // Precompute for candidates. We check against BOTH gross amount and net
  // (post-refund) so a fully-refunded charge that was originally the right
  // size still matches — but with a REFUND_UNRECORDED verdict.
  const withMeta = candidates.map((ch) => {
    const netCents = ch.netCollected;
    const grossCents = ch.amount;
    const daysApart = cashDate ? daysBetween(cashDate, ch.createdAt) : null;
    const netDelta = cashCents - netCents;
    const grossDelta = cashCents - grossCents;
    return { ch, netCents, grossCents, daysApart, netDelta, grossDelta };
  });

  // 1a) Refund case: cash matches the GROSS Stripe amount but the charge was
  // refunded (in whole or in part). Cash Tracker didn't reflect the refund.
  const refundHit = withMeta.find((m) => m.grossDelta === 0 && m.ch.amountRefunded > 0);
  if (refundHit) {
    notes.push(`Stripe shows a refund of $${(refundHit.ch.amountRefunded / 100).toFixed(2)} — verify Cash Tracker reflects it.`);
    return {
      charge: refundHit.ch,
      verdict: "REFUND_UNRECORDED",
      signal: "gross amount matches; refund not applied in Cash Tracker",
      daysApart: refundHit.daysApart,
      deltaCents: refundHit.netDelta,
      notes,
    };
  }

  // 1b) Exact match: NET amount + date within window
  const exact = withMeta.find((m) => m.netDelta === 0 && (m.daysApart === null || m.daysApart <= EXACT_DAYS));
  if (exact) {
    return {
      charge: exact.ch,
      verdict: "MATCHED_EXACT",
      signal: "exact amount + date within 3 days",
      daysApart: exact.daysApart,
      deltaCents: 0,
      notes,
    };
  }

  // 2) Loose exact-amount but any date
  const loose = withMeta.find((m) => m.netDelta === 0);
  if (loose) {
    return {
      charge: loose.ch,
      verdict: "MATCHED_LOOSE",
      signal: "exact amount, dates diverge",
      daysApart: loose.daysApart,
      deltaCents: 0,
      notes,
    };
  }

  // 3) Fee-tolerance — within 5%
  const feeToleranceCents = Math.round(cashCents * 0.05);
  const feeMatch = withMeta.find((m) => Math.abs(m.netDelta) <= feeToleranceCents && cashCents > 0);
  if (feeMatch) {
    notes.push(`Stripe collected $${(feeMatch.ch.netCollected / 100).toFixed(2)}, Cash Tracker says $${(cashCents / 100).toFixed(2)}. Delta $${(feeMatch.netDelta / 100).toFixed(2)} — possibly Stripe fees.`);
    return {
      charge: feeMatch.ch,
      verdict: "MATCHED_FEE",
      signal: "email + amount within 5% (Stripe fees?)",
      daysApart: feeMatch.daysApart,
      deltaCents: feeMatch.netDelta,
      notes,
    };
  }

  // 4) Same email but different amount — real mismatch
  if (withMeta.length > 0) {
    // Pick the closest by amount
    const closest = withMeta.slice().sort((a, b) => Math.abs(a.netDelta) - Math.abs(b.netDelta))[0];
    notes.push(
      `Cash Tracker: $${(cashCents / 100).toFixed(2)} — Stripe: $${(closest.ch.netCollected / 100).toFixed(2)}. Delta $${(closest.netDelta / 100).toFixed(2)}.`
    );
    // Coupon/product cross-check
    if (cash.couponCode && closest.ch.couponHint && !stringsMentionEachOther(cash.couponCode, closest.ch.couponHint)) {
      notes.push(`Coupon mismatch: Cash Tracker "${cash.couponCode}" vs Stripe "${closest.ch.couponHint}".`);
    }
    if (cash.product && closest.ch.productHint && !stringsMentionEachOther(cash.product, closest.ch.productHint)) {
      notes.push(`Product mismatch: Cash Tracker "${cash.product}" vs Stripe "${closest.ch.productHint}".`);
    }
    return {
      charge: closest.ch,
      verdict: "AMOUNT_MISMATCH",
      signal: "same email, amounts diverge",
      daysApart: closest.daysApart,
      deltaCents: closest.netDelta,
      notes,
    };
  }

  return { charge: null, verdict: "NO_STRIPE_CHARGE", signal: "no Stripe charge for this email", daysApart: null, deltaCents: null, notes };
}

export function reconcile(cashRows: CashRow[], charges: StripeCharge[]): Omit<ReconciliationReport, "fetchedAt" | "mode" | "error"> {
  // Index Stripe charges by normalized email
  const chargesByEmail = new Map<string, StripeCharge[]>();
  for (const ch of charges) {
    if (!ch.email) continue;
    const list = chargesByEmail.get(ch.email) ?? [];
    list.push(ch);
    chargesByEmail.set(ch.email, list);
  }

  const usedChargeIds = new Set<string>();
  const rows: ReconciliationRow[] = [];

  // First pass: reconcile every Cash Tracker row
  for (const cash of cashRows) {
    if (cash.isTest) continue;
    const email = norm(cash.email);
    if (!email) {
      rows.push({
        verdict: "NO_STRIPE_CHARGE",
        cashRow: cash,
        stripeCharge: null,
        deltaCents: null,
        matchSignal: "Cash Tracker row has no email — cannot reconcile",
        daysApart: null,
        notes: [],
      });
      continue;
    }
    const candidates = (chargesByEmail.get(email) ?? []).filter((c) => !usedChargeIds.has(c.id));
    const match = findBestMatch(cash, candidates);
    if (match.charge) usedChargeIds.add(match.charge.id);
    rows.push({
      verdict: match.verdict,
      cashRow: cash,
      stripeCharge: match.charge,
      deltaCents: match.deltaCents,
      matchSignal: match.signal,
      daysApart: match.daysApart,
      notes: match.notes,
    });
  }

  // Second pass: Stripe-only charges (no Cash Tracker row claimed them)
  for (const ch of charges) {
    if (usedChargeIds.has(ch.id)) continue;
    // Skip $0 and unpaid ones — not real "missing enrollments"
    if (!ch.paid || ch.status !== "succeeded" || ch.netCollected <= 0) continue;
    rows.push({
      verdict: "STRIPE_ONLY",
      cashRow: null,
      stripeCharge: ch,
      deltaCents: null,
      matchSignal: "Stripe charge with no matching Cash Tracker row",
      daysApart: null,
      notes: ["Someone paid via Stripe but was never entered in the Cash Tracker. Add them to close the loop."],
    });
  }

  const cashTrackerTotal = cashRows
    .filter((r) => !r.isTest)
    .reduce((s, r) => s + toCents(r.cashCollected), 0);
  const stripeCollected = charges
    .filter((c) => c.paid && c.status === "succeeded")
    .reduce((s, c) => s + c.netCollected, 0);
  const stripeRefunded = charges.reduce((s, c) => s + c.amountRefunded, 0);

  const summary = {
    totalCashTrackerRows: cashRows.filter((r) => !r.isTest).length,
    totalStripeCharges: charges.length,
    matched: rows.filter((r) => r.verdict === "MATCHED_EXACT" || r.verdict === "MATCHED_LOOSE" || r.verdict === "MATCHED_FEE").length,
    amountMismatch: rows.filter((r) => r.verdict === "AMOUNT_MISMATCH").length,
    refundUnrecorded: rows.filter((r) => r.verdict === "REFUND_UNRECORDED").length,
    noStripeCharge: rows.filter((r) => r.verdict === "NO_STRIPE_CHARGE").length,
    stripeOnly: rows.filter((r) => r.verdict === "STRIPE_ONLY").length,
    cashTrackerTotalCents: cashTrackerTotal,
    stripeCollectedCents: stripeCollected,
    stripeRefundedCents: stripeRefunded,
    coverageRatio: stripeCollected > 0 ? cashTrackerTotal / stripeCollected : null,
  };

  return { rows, summary };
}
