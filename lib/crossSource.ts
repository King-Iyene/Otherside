import type { ApplicationRow, CashRow, ChallengeRow } from "./types";
import { detectAmountColumn, parseAmount } from "./challengeColumns";

function normalizeEmail(email: string | null | undefined): string {
  return (email || "").trim().toLowerCase();
}

function emailFromChallenge(row: ChallengeRow): string {
  for (const key of Object.keys(row)) {
    if (key.toLowerCase().includes("email")) {
      const v = row[key];
      if (typeof v === "string") return normalizeEmail(v);
    }
  }
  return "";
}

function productFromChallenge(row: ChallengeRow): string | null {
  for (const key of Object.keys(row)) {
    if (key.toLowerCase() === "product") {
      const v = row[key];
      if (typeof v === "string" && v.trim()) return v;
    }
  }
  return null;
}

function couponFromChallenge(row: ChallengeRow): string | null {
  for (const key of Object.keys(row)) {
    if (key.toLowerCase() === "coupon") {
      const v = row[key];
      if (typeof v === "string" && v.trim()) return v;
    }
  }
  return null;
}

function amountFromChallenge(row: ChallengeRow): number | null {
  for (const key of Object.keys(row)) {
    if (key.toLowerCase() === "amount") {
      const v = row[key];
      if (typeof v === "number") return v;
    }
  }
  return null;
}

/**
 * Cash Tracker rows indexed by email for fast lookup.
 */
export function indexCashByEmail(cashRows: CashRow[], includeTest = false) {
  const map = new Map<string, CashRow>();
  for (const r of cashRows) {
    if (!includeTest && r.isTest) continue;
    if (r.transactionType === "Refund" || r.transactionType === "Dropout") continue;
    const email = normalizeEmail(r.email);
    if (!email) continue;
    if (!map.has(email)) map.set(email, r);
  }
  return map;
}

/**
 * Application rows indexed by email.
 */
export function indexAppsByEmail(applications: ApplicationRow[], includeTest = false) {
  const map = new Map<string, ApplicationRow>();
  for (const r of applications) {
    if (!includeTest && r.isTest) continue;
    const email = normalizeEmail(r.email);
    if (!email) continue;
    if (!map.has(email)) map.set(email, r);
  }
  return map;
}

/**
 * Total money and unique registrations from the Challenge (Google Sheet). The
 * sheet's columns vary, so we pick the most money-like numeric column present
 * (parsed upstream by the CSV loader) — preferring a "cash"/"amount"/"paid"
 * header — and sum it. Kept separate from Reborn Cash Tracker totals on purpose
 * so the two revenue streams are never silently blended.
 */
const CHALLENGE_META_KEYS = new Set(["id", "isTest", "health", "url"]);

export function challengeCashStats(
  challengeRows: ChallengeRow[],
  includeTest = false
): { cashCollected: number; registrations: number; columnUsed: string | null } {
  const rows = challengeRows.filter((r) => includeTest || !r.isTest);
  if (!rows.length) return { cashCollected: 0, registrations: 0, columnUsed: null };
  // Derive the sheet's columns from the row keys, then find the money column by
  // content (same detector the Challenge tab uses, so the two always agree).
  const columns = Object.keys(rows[0]).filter((k) => !CHALLENGE_META_KEYS.has(k));
  const amountCol = detectAmountColumn(columns, rows);
  let cashCollected = 0;
  const emails = new Set<string>();
  for (const r of rows) {
    if (amountCol) cashCollected += parseAmount(r[amountCol]) ?? 0;
    const e = emailFromChallenge(r);
    if (e) emails.add(e);
  }
  // Prefer unique sign-ups by email; if the sheet has no email column, fall
  // back to the row count so this never reads 0 when there are registrations.
  const registrations = emails.size > 0 ? emails.size : rows.length;
  return { cashCollected, registrations, columnUsed: amountCol };
}

// ─── Challenge → Reborn ─────────────────────────────────────────────

export interface ChallengeMatch {
  email: string;
  challengeProduct: string | null;
  challengeCoupon: string | null;
  challengeAmount: number | null;
  rebornProduct: string | null;
  rebornCohort: string | null;
  rebornRevenue: number | null;
  rebornCashCollected: number | null;
}

export interface ChallengeToRebornAnalysis {
  challengeUniqueEmails: number;
  challengeBoughtReborn: number;
  conversionRate: number | null;
  revenueFromConverters: number;
  matches: ChallengeMatch[];
  /** Split by coupon usage. */
  freeToBought: { total: number; converted: number };
  paidToBought: { total: number; converted: number };
}

export function analyzeChallengeToReborn(
  challengeRows: ChallengeRow[],
  cashRows: CashRow[]
): ChallengeToRebornAnalysis {
  const challengeEmails = new Map<string, ChallengeRow>();
  for (const r of challengeRows) {
    if (r.isTest) continue;
    const email = emailFromChallenge(r);
    if (!email) continue;
    if (!challengeEmails.has(email)) challengeEmails.set(email, r);
  }

  const cashByEmail = indexCashByEmail(cashRows);

  const matches: ChallengeMatch[] = [];
  let freeTotal = 0;
  let freeBought = 0;
  let paidTotal = 0;
  let paidBought = 0;

  for (const [email, cRow] of challengeEmails) {
    const rebornRow = cashByEmail.get(email);
    const amount = amountFromChallenge(cRow);
    const coupon = couponFromChallenge(cRow);
    const isFree = (amount ?? 0) === 0 || !!coupon;

    if (isFree) freeTotal += 1;
    else paidTotal += 1;

    if (rebornRow) {
      if (isFree) freeBought += 1;
      else paidBought += 1;
      matches.push({
        email,
        challengeProduct: productFromChallenge(cRow),
        challengeCoupon: coupon,
        challengeAmount: amount,
        rebornProduct: rebornRow.product,
        rebornCohort: rebornRow.cohort,
        rebornRevenue: rebornRow.revenue,
        rebornCashCollected: rebornRow.cashCollected,
      });
    }
  }

  const totalChallenge = challengeEmails.size;
  const bought = matches.length;
  const revenueFromConverters = matches.reduce((s, m) => s + (m.rebornCashCollected ?? 0), 0);

  return {
    challengeUniqueEmails: totalChallenge,
    challengeBoughtReborn: bought,
    conversionRate: totalChallenge > 0 ? bought / totalChallenge : null,
    revenueFromConverters,
    matches: matches.sort((a, b) => (b.rebornCashCollected ?? 0) - (a.rebornCashCollected ?? 0)),
    freeToBought: { total: freeTotal, converted: freeBought },
    paidToBought: { total: paidTotal, converted: paidBought },
  };
}

// ─── Application → Purchase ─────────────────────────────────────────

export interface AppPurchaseAnalysis {
  bucketBreakdown: {
    bracket: string;
    applications: number;
    purchased: number;
    conversionRate: number | null;
    revenue: number;
  }[];
  statusBreakdown: {
    status: string;
    applications: number;
    purchased: number;
    conversionRate: number | null;
    revenue: number;
  }[];
  /** All applicant emails that also appear in Cash Tracker with the joined data. */
  matches: {
    email: string;
    applicationStatus: string | null;
    annualEarnings: string | null;
    rebornProduct: string | null;
    rebornCohort: string | null;
    rebornCashCollected: number | null;
    rebornRevenue: number | null;
  }[];
}

export function analyzeAppToPurchase(applications: ApplicationRow[], cashRows: CashRow[]): AppPurchaseAnalysis {
  const cashByEmail = indexCashByEmail(cashRows);

  const bracketMap = new Map<string, { applications: number; purchased: number; revenue: number }>();
  const statusMap = new Map<string, { applications: number; purchased: number; revenue: number }>();
  const matches: AppPurchaseAnalysis["matches"] = [];

  for (const app of applications) {
    if (app.isTest) continue;
    const bracket = app.annualEarnings || "(unspecified)";
    const status = app.applicationStatus || "(no status)";

    const bEntry = bracketMap.get(bracket) || { applications: 0, purchased: 0, revenue: 0 };
    bEntry.applications += 1;
    const sEntry = statusMap.get(status) || { applications: 0, purchased: 0, revenue: 0 };
    sEntry.applications += 1;

    const email = normalizeEmail(app.email);
    const rebornRow = email ? cashByEmail.get(email) : undefined;
    if (rebornRow) {
      const cash = rebornRow.cashCollected ?? 0;
      bEntry.purchased += 1;
      bEntry.revenue += cash;
      sEntry.purchased += 1;
      sEntry.revenue += cash;
      matches.push({
        email,
        applicationStatus: app.applicationStatus,
        annualEarnings: app.annualEarnings,
        rebornProduct: rebornRow.product,
        rebornCohort: rebornRow.cohort,
        rebornCashCollected: rebornRow.cashCollected,
        rebornRevenue: rebornRow.revenue,
      });
    }

    bracketMap.set(bracket, bEntry);
    statusMap.set(status, sEntry);
  }

  const bucketBreakdown = Array.from(bracketMap.entries())
    .map(([bracket, v]) => ({
      bracket,
      applications: v.applications,
      purchased: v.purchased,
      conversionRate: v.applications > 0 ? v.purchased / v.applications : null,
      revenue: v.revenue,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const statusBreakdown = Array.from(statusMap.entries())
    .map(([status, v]) => ({
      status,
      applications: v.applications,
      purchased: v.purchased,
      conversionRate: v.applications > 0 ? v.purchased / v.applications : null,
      revenue: v.revenue,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    bucketBreakdown,
    statusBreakdown,
    matches: matches.sort((a, b) => (b.rebornCashCollected ?? 0) - (a.rebornCashCollected ?? 0)),
  };
}

// ─── Coupon-user conversion ─────────────────────────────────────────

export interface CouponPurchaseAnalysis {
  perCoupon: {
    code: string;
    challengeUses: number;
    boughtReborn: number;
    conversionRate: number | null;
    revenue: number;
  }[];
}

export function analyzeCouponPurchase(challengeRows: ChallengeRow[], cashRows: CashRow[]): CouponPurchaseAnalysis {
  const cashByEmail = indexCashByEmail(cashRows);
  const perCoupon = new Map<string, { challengeUses: number; boughtReborn: number; revenue: number }>();

  for (const r of challengeRows) {
    if (r.isTest) continue;
    const coupon = couponFromChallenge(r) || "(no coupon)";
    const email = emailFromChallenge(r);
    if (!email) continue;
    const entry = perCoupon.get(coupon) || { challengeUses: 0, boughtReborn: 0, revenue: 0 };
    entry.challengeUses += 1;
    const rebornRow = cashByEmail.get(email);
    if (rebornRow) {
      entry.boughtReborn += 1;
      entry.revenue += rebornRow.cashCollected ?? 0;
    }
    perCoupon.set(coupon, entry);
  }

  return {
    perCoupon: Array.from(perCoupon.entries())
      .map(([code, v]) => ({
        code,
        challengeUses: v.challengeUses,
        boughtReborn: v.boughtReborn,
        conversionRate: v.challengeUses > 0 ? v.boughtReborn / v.challengeUses : null,
        revenue: v.revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue),
  };
}

// ── Deposit lifecycle ─────────────────────────────────────────────
// "After someone puts down a deposit, what actually happens?" Groups
// Cash Tracker rows by person (email) and buckets each depositor into
// one terminal outcome — outcome priority (highest wins):
//   1. refunded   — any Refund row on file
//   2. droppedOut — any Dropout row on file (but no refund)
//   3. paidInFull — total cash collected ≥ total revenue booked
//   4. continuing — has at least one Payment row after the deposit
//                   (still on a payment plan / installment refills)
//   5. depositOnly — the deposit is the ONLY row for this person
//                   (stalled — never converted to a real enrollment)
//
// Refund/dropout beat "paid in full" so a person who paid it off but
// was later refunded lands in the refunded bucket, not paid-in-full.

export type DepositOutcome = "paid_in_full" | "continuing" | "refunded" | "dropped_out" | "deposit_only";

export interface DepositLead {
  email: string;
  name: string;
  cohort: string | null;
  product: string | null;
  /** SUM of Cash Collected across this person's Deposit rows. */
  depositCash: number;
  /** SUM of Cash Collected across all positive rows (Deposit + Payment). */
  totalCash: number;
  /** SUM of Revenue across all positive rows (what they owe in total). */
  totalRevenue: number;
  /** SUM of Cash Collected across Refund rows (what came back to them). */
  totalRefunded: number;
  paymentCount: number;
  hasRefund: boolean;
  hasDropout: boolean;
  outcome: DepositOutcome;
}

export interface DepositLifecycleAnalysis {
  totalDepositors: number;
  paidInFull: DepositLead[];
  continuing: DepositLead[];
  refunded: DepositLead[];
  droppedOut: DepositLead[];
  depositOnly: DepositLead[];
}

export function analyzeDepositLifecycle(cashRows: CashRow[], includeTest = false): DepositLifecycleAnalysis {
  const byEmail = new Map<string, CashRow[]>();
  for (const r of cashRows) {
    if (!includeTest && r.isTest) continue;
    const email = normalizeEmail(r.email);
    if (!email) continue;
    const bucket = byEmail.get(email);
    if (bucket) bucket.push(r);
    else byEmail.set(email, [r]);
  }

  const paidInFull: DepositLead[] = [];
  const continuing: DepositLead[] = [];
  const refunded: DepositLead[] = [];
  const droppedOut: DepositLead[] = [];
  const depositOnly: DepositLead[] = [];

  for (const [email, personRows] of byEmail) {
    const deposits = personRows.filter((r) => r.transactionType === "Deposit");
    if (deposits.length === 0) continue;

    const payments = personRows.filter((r) => !r.transactionType || r.transactionType === "Payment");
    const refunds = personRows.filter((r) => r.transactionType === "Refund");
    const dropouts = personRows.filter((r) => r.transactionType === "Dropout");

    const depositCash = deposits.reduce((s, r) => s + (r.cashCollected || 0), 0);
    const positive = [...payments, ...deposits];
    const totalCash = positive.reduce((s, r) => s + (r.cashCollected || 0), 0);
    const totalRevenue = positive.reduce((s, r) => s + (r.revenue || 0), 0);
    const totalRefunded = refunds.reduce((s, r) => s + (r.cashCollected || 0), 0);

    // Priority: refund > dropout > paid-in-full > continuing > deposit-only.
    // Paid-in-full is inclusive of a $1 rounding tolerance to survive
    // fractional cents from currency conversion / gateway rounding.
    let outcome: DepositOutcome;
    if (refunds.length > 0) outcome = "refunded";
    else if (dropouts.length > 0) outcome = "dropped_out";
    else if (totalRevenue > 0 && totalCash >= totalRevenue - 1) outcome = "paid_in_full";
    else if (payments.length > 0) outcome = "continuing";
    else outcome = "deposit_only";

    const anchor = deposits[0] || personRows[0];
    const lead: DepositLead = {
      email,
      name: anchor.name,
      cohort: anchor.cohort,
      product: anchor.product,
      depositCash,
      totalCash,
      totalRevenue,
      totalRefunded,
      paymentCount: payments.length,
      hasRefund: refunds.length > 0,
      hasDropout: dropouts.length > 0,
      outcome,
    };

    if (outcome === "refunded") refunded.push(lead);
    else if (outcome === "dropped_out") droppedOut.push(lead);
    else if (outcome === "paid_in_full") paidInFull.push(lead);
    else if (outcome === "continuing") continuing.push(lead);
    else depositOnly.push(lead);
  }

  return {
    totalDepositors: paidInFull.length + continuing.length + refunded.length + droppedOut.length + depositOnly.length,
    paidInFull,
    continuing,
    refunded,
    droppedOut,
    depositOnly,
  };
}
