import type { CashRow } from "./types";
import { extractLaunch } from "./launchNames";

/**
 * Payment anomaly detection — CROSS-ROW, per person. Unlike the row-level Data
 * Health checks, these look at all of a buyer's Cash Tracker rows together, so
 * they can reason about a payment plan the way a human would:
 *
 *  • A plan says "Total $12,000" but the rows don't add up to that.
 *  • Recurring installments got tagged to a different cohort than the first
 *    payment (the person's TRUE cohort = their earliest enrollment).
 *  • A scheduled next payment date has passed but nothing was collected.
 *  • Two identical rows (same date + amount) — a duplicated installment.
 */

export type PaymentAnomalyKind = "plan_total_mismatch" | "cohort_split" | "overdue_payment" | "duplicate_row";

export interface PaymentAnomaly {
  person: string;
  email: string | null;
  kind: PaymentAnomalyKind;
  detail: string;
  rows: CashRow[];
}

export const PAYMENT_ANOMALY_LABELS: Record<PaymentAnomalyKind, { label: string; tone: "red" | "amber" }> = {
  plan_total_mismatch: { label: "TOTAL ≠ PLAN", tone: "red" },
  cohort_split: { label: "COHORT SPLIT", tone: "amber" },
  overdue_payment: { label: "PAYMENT MISSING", tone: "red" },
  duplicate_row: { label: "DUPLICATE ROW", tone: "amber" },
};

const money = (v: string): number | null => {
  const n = Number(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};

/**
 * Parse the intended total contract value out of a Product / payment-plan
 * description. Handles, in order of confidence:
 *   1. an explicit "Total $12,000"
 *   2. "$6,000 today + $3,000 per month for 2 months"  → 6000 + 3000*2
 *   3. a single price "@ $10,000" / "$10,000"
 */
export function parsePlanTotal(product: string | null | undefined): number | null {
  if (!product) return null;
  const s = String(product);

  const totalM = s.match(/total\s*[:\-]?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (totalM) return money(totalM[1]);

  const today = s.match(/\$\s*([\d,]+(?:\.\d{1,2})?)\s*(?:today|upfront|up front|down|deposit|now)/i);
  const perMonth = s.match(/\$\s*([\d,]+(?:\.\d{1,2})?)\s*(?:per\s*month|\/\s*month|monthly|\/mo|p\/m)/i);
  const monthsM = s.match(/for\s*(\d+)\s*months?/i) || s.match(/(\d+)\s*months?/i) || s.match(/x\s*(\d+)\b/i);
  if (today || perMonth) {
    const base = today ? money(today[1]) ?? 0 : 0;
    const mo = perMonth ? money(perMonth[1]) ?? 0 : 0;
    const n = monthsM ? parseInt(monthsM[1], 10) : 0;
    const total = base + mo * n;
    if (total > 0) return total;
  }

  const at = s.match(/@\s*\$\s*([\d,]+(?:\.\d{1,2})?)/);
  if (at) return money(at[1]);
  const single = s.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
  if (single) return money(single[1]);
  return null;
}

const norm = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim().toLowerCase());

function personLabel(rows: CashRow[]): string {
  for (const r of rows) if (r.name && r.name.trim()) return r.name.trim();
  for (const r of rows) if (r.email && r.email.trim()) return r.email.trim();
  return "(unknown)";
}

function fmt(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/** Group cash rows into one bucket per real person (email, else name). */
function groupByPerson(rows: CashRow[]): CashRow[][] {
  const map = new Map<string, CashRow[]>();
  for (const r of rows) {
    const key = norm(r.email) || (norm(r.name) ? `name:${norm(r.name)}` : "");
    if (!key) continue; // blank stub — no person to attach a payment anomaly to
    const list = map.get(key) ?? [];
    list.push(r);
    map.set(key, list);
  }
  return Array.from(map.values());
}

export function detectPaymentAnomalies(
  cash: CashRow[],
  opts: { includeTest?: boolean; today?: Date } = {}
): PaymentAnomaly[] {
  const rows = opts.includeTest ? cash : cash.filter((r) => !r.isTest);
  const today = opts.today ?? new Date();
  const out: PaymentAnomaly[] = [];

  for (const group of groupByPerson(rows)) {
    const person = personLabel(group);
    const email = group.find((r) => r.email && r.email.trim())?.email ?? null;
    const sorted = [...group].sort((a, b) => (a.enrollmentDate || "").localeCompare(b.enrollmentDate || ""));

    // ── Plan total vs. recorded revenue ──────────────────────────────
    const planTotal = group.map((r) => parsePlanTotal(r.product)).find((t) => t !== null) ?? null;
    const sumRevenue = group.reduce((s, r) => s + (r.revenue ?? 0), 0);
    if (planTotal !== null && sumRevenue > 0 && Math.abs(sumRevenue - planTotal) > 1) {
      out.push({
        person,
        email,
        kind: "plan_total_mismatch",
        detail: `Plan says total ${fmt(planTotal)}, but the ${group.length} row${group.length === 1 ? "" : "s"} for this person add up to ${fmt(
          sumRevenue
        )} in Revenue. Check whether an installment was double-entered or Revenue was recorded per payment instead of once.`,
        rows: sorted,
      });
    }

    // ── Recurring installments split across cohorts ──────────────────
    const launches = Array.from(new Set(group.map((r) => extractLaunch(r.cohort)).filter(Boolean))) as string[];
    if (launches.length > 1) {
      const first = sorted.find((r) => r.enrollmentDate);
      const trueCohort = first ? extractLaunch(first.cohort) : null;
      out.push({
        person,
        email,
        kind: "cohort_split",
        detail: `Tagged across ${launches.join(" and ")}. The earliest payment${
          first?.enrollmentDate ? ` (${first.enrollmentDate})` : ""
        } is ${trueCohort || "?"}, so this looks like ONE purchase whose recurring payments were tagged to a later cohort. They should all be ${
          trueCohort || "the first-payment cohort"
        }.`,
        rows: sorted,
      });
    }

    // ── Duplicate rows (same enrollment date + same cash collected) ───
    const seen = new Map<string, CashRow[]>();
    for (const r of group) {
      const k = `${r.enrollmentDate || ""}|${r.cashCollected ?? ""}|${norm(r.product)}`;
      const list = seen.get(k) ?? [];
      list.push(r);
      seen.set(k, list);
    }
    for (const [, dupes] of seen) {
      if (dupes.length > 1) {
        out.push({
          person,
          email,
          kind: "duplicate_row",
          detail: `${dupes.length} identical rows — same date (${dupes[0].enrollmentDate || "—"}), same Cash Collected (${fmt(
            dupes[0].cashCollected ?? 0
          )}), same product. Almost certainly a duplicated installment; delete the extra${dupes.length > 2 ? "s" : ""}.`,
          rows: dupes,
        });
        break; // one duplicate flag per person is enough
      }
    }

    // ── Overdue / missing scheduled payment ──────────────────────────
    for (const r of group) {
      if (!r.nextPaymentDate) continue;
      const due = new Date(r.nextPaymentDate);
      if (Number.isNaN(due.getTime())) continue;
      if (due.getTime() < today.getTime() && (r.balance ?? 0) > 0) {
        out.push({
          person,
          email,
          kind: "overdue_payment",
          detail: `A payment was due ${r.nextPaymentDate} and they still owe ${fmt(
            r.balance ?? 0
          )}, but no newer payment is recorded. Chase the missing installment or update the record.`,
          rows: [r],
        });
        break; // one overdue flag per person
      }
    }
  }

  return out;
}
