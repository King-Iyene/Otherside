import type {
  AppointmentRow,
  ApplicationRow,
  CashRow,
  ChallengeRow,
  HealthFlag,
  HealthFlagKind,
} from "./types";

/**
 * Extended data health checks. The per-row checks that need only single-row
 * context live in each source adapter. This file holds:
 *   - Canonical cohort validation (shared across sources)
 *   - Cross-row post-processing (duplicate emails, etc.) that must run after
 *     the aggregated dataset is available.
 *   - Human-friendly labels for the UI badge / tooltip.
 */

// ────────────────────────────────────────────────────────────────
// Canonical cohort names — data-health uses STRICT matching on purpose.
// A field labeled "Erupt 3 > Reborn Aug 2026" flags as inconsistent so
// ops can eyeball whether the trailing marker matches the cohort tag
// (Javid's case: tagged Erupt 3 but was really Erupt 2 — worth catching).
//
// Note: cohortFunnel.ts uses UNANCHORED containment matching for
// attribution — that's about "who belongs to this cohort in the funnel"
// which should be permissive. Data-health is about "is this row's own
// cohort field a clean, single value" which should be strict.
// ────────────────────────────────────────────────────────────────

import { COHORTS } from "./cohortFunnel";

const CANONICAL_COHORTS = [
  { canonical: "Erupt 1", match: /^erupt\s*1$|^reborn\s*dec\s*2025$|^dec\s*2025$/i },
  { canonical: "Erupt 2", match: /^erupt\s*2$|^reborn\s*apr\s*2026$|^apr\s*2026$/i },
  { canonical: "Erupt 3", match: /^erupt\s*3$|^reborn\s*aug\s*2026$|^aug\s*2026$/i },
  { canonical: "Penetrate", match: /^penetrate$/i },
];

export function classifyCohort(value: string | null | undefined):
  | { status: "empty" }
  | { status: "canonical"; name: string }
  | { status: "inconsistent"; raw: string; suggestion: string | null } {
  if (!value || !String(value).trim()) return { status: "empty" };
  const v = String(value).trim();

  const match = CANONICAL_COHORTS.find((c) => c.match.test(v));
  if (match) return { status: "canonical", name: match.canonical };

  // Fuzzy suggestion. Nothing matched canonically — look at the closest
  // marker in the raw value. Penetrate wins outright; otherwise if we see
  // "erupt", disambiguate by digit / word / month year. Order matters —
  // "erupt 3 > reborn aug 2026" must resolve to Erupt 3, not Erupt 2 just
  // because "2" appears in "2026". So Erupt N (from "eruptN") is checked
  // BEFORE month/year hints.
  const lc = v.toLowerCase();
  let suggestion: string | null = null;
  if (/penetrat/.test(lc)) {
    suggestion = "Penetrate";
  } else if (/erupt/.test(lc)) {
    // The digit adjacent to "erupt" is the authoritative signal
    const digitAdj = lc.match(/erupt[_\s-]*([123]|one|two|three)/);
    if (digitAdj) {
      const d = digitAdj[1];
      if (d === "1" || d === "one") suggestion = "Erupt 1";
      else if (d === "2" || d === "two") suggestion = "Erupt 2";
      else if (d === "3" || d === "three") suggestion = "Erupt 3";
    }
    // Fall back to month/year if the number was missing
    if (!suggestion) {
      if (/aug\s*2026/.test(lc)) suggestion = "Erupt 3";
      else if (/apr\s*2026/.test(lc)) suggestion = "Erupt 2";
      else if (/dec\s*2025/.test(lc)) suggestion = "Erupt 1";
    }
  } else {
    // No "erupt" or "penetrat" — try the month/year alone
    if (/aug\s*2026/.test(lc)) suggestion = "Erupt 3";
    else if (/apr\s*2026/.test(lc)) suggestion = "Erupt 2";
    else if (/dec\s*2025/.test(lc)) suggestion = "Erupt 1";
  }
  return { status: "inconsistent", raw: v, suggestion };
}

// ────────────────────────────────────────────────────────────────
// Per-row check helpers — called from each source adapter
// ────────────────────────────────────────────────────────────────

// Which cohort does an enrollment date fall inside? Uses the COHORTS launch
// windows already defined for the funnel. Returns null if the date is
// outside every window (or missing).
function cohortForDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const t = new Date(dateStr).getTime();
  if (isNaN(t)) return null;
  for (const c of COHORTS) {
    if (!c.window) continue;
    const s = new Date(c.window.start).getTime();
    const e = new Date(c.window.end).getTime();
    if (t >= s && t <= e) return c.label;
  }
  return null;
}

export function cashRowHealthChecks(row: {
  cohort: string | null;
  enrManager: string | null;
  revenue: number | null;
  cashCollected: number | null;
  balance: number | null;
  nextPaymentDate: string | null;
  enrollmentDate?: string | null;
}): HealthFlag[] {
  const flags: HealthFlag[] = [];

  const cohortStatus = classifyCohort(row.cohort);
  if (cohortStatus.status === "empty") {
    flags.push({
      field: "Cohort",
      kind: "missing_cohort",
      raw: "",
      hint: `Open Notion → "Reborn Cash Tracker" → find this row (search by the Name column) → set the Cohort field to one of: Erupt 1, Erupt 2, Erupt 3, or Penetrate. Every enrollment needs a cohort tag or it won't show up in the correct funnel.`,
    });
  } else if (cohortStatus.status === "inconsistent") {
    const suggested = cohortStatus.suggestion || "Erupt 1 / Erupt 2 / Erupt 3 / Penetrate";
    flags.push({
      field: "Cohort",
      kind: "inconsistent_cohort",
      raw: cohortStatus.raw,
      hint: `The Cohort field currently reads "${cohortStatus.raw}" but the funnel expects a single canonical name. FIX: Open Notion → "Reborn Cash Tracker" → search the Name column for this record → change the Cohort field to "${suggested}". Nothing needs to change on the Google Sheet — the flag is on Notion, not the sheet.`,
    });
  } else if (cohortStatus.status === "canonical" && row.enrollmentDate) {
    // Cross-check: cohort tag is clean, BUT does the enrollment date fall in
    // that cohort's launch window? Catches the Javid case — tagged Erupt 3
    // but enrolled during Erupt 2's window (Feb–May 2026).
    const expected = cohortForDate(row.enrollmentDate);
    if (expected && expected !== cohortStatus.name) {
      flags.push({
        field: "Cohort",
        kind: "cohort_window_mismatch",
        raw: `Tagged ${cohortStatus.name}, enrolled ${row.enrollmentDate} (${expected} window)`,
        hint: `Tag says "${cohortStatus.name}" but Enrollment Date ${row.enrollmentDate} sits inside "${expected}"'s launch window. FIX: Open Notion → "Reborn Cash Tracker" → search Name for this record. Then either (a) change Cohort to "${expected}" if the enrollment date is right, OR (b) change the Enrollment Date if the cohort tag is right.`,
      });
    }
  }

  if (!row.enrManager || !row.enrManager.trim()) {
    flags.push({
      field: "Enr Manager",
      kind: "missing_closer",
      raw: "",
      hint: `Open Notion → "Reborn Cash Tracker" → search Name for this record → set the "Enr Manager" field to the closer who owned this deal. Without it, the deal doesn't roll up on their scorecard.`,
    });
  }

  // Distinguish blank Revenue (forgot to enter) from an intentional $0 (comp).
  // We only flag when there's clearly a real transaction: someone was paid
  // (cashCollected > 0) but the deal size was left blank.
  if (row.revenue === null && (row.cashCollected ?? 0) > 0) {
    flags.push({
      field: "Revenue",
      kind: "zero_revenue_enrollment",
      raw: "(blank)",
      hint: `Open Notion → "Reborn Cash Tracker" → search Name for this record. Cash Collected shows $${row.cashCollected} but the Revenue (deal size) column is blank. Enter the full deal amount so cohort economics are accurate.`,
    });
  } else if (row.revenue === 0 && (row.cashCollected ?? 0) > 0) {
    flags.push({
      field: "Revenue",
      kind: "zero_revenue_enrollment",
      raw: "$0",
      hint: `Open Notion → "Reborn Cash Tracker" → search Name for this record. Revenue = $0 but $${row.cashCollected} was collected. Either fix the Revenue column to the real deal size, OR add a note like "comp" so it isn't miscounted.`,
    });
  }

  // Cash collected greater than revenue is arithmetically impossible
  if (row.revenue !== null && row.cashCollected !== null && row.cashCollected > row.revenue) {
    flags.push({
      field: "Cash Collected",
      kind: "cash_gt_revenue",
      raw: `Cash $${row.cashCollected} > Revenue $${row.revenue}`,
      hint: `Open Notion → "Reborn Cash Tracker" → search Name for this record. Cash Collected ($${row.cashCollected}) is bigger than Revenue ($${row.revenue}) — arithmetically impossible. One of the two numbers is wrong.`,
    });
  }

  // Outstanding balance with no next payment date scheduled
  if (row.balance !== null && row.balance > 0 && !row.nextPaymentDate) {
    flags.push({
      field: "Date of Next Payment",
      kind: "outstanding_no_next_payment",
      raw: `Balance $${row.balance}`,
      hint: `Open Notion → "Reborn Cash Tracker" → search Name for this record. They owe $${row.balance} but "Date of Next Payment" is blank. Set the next collection date so accounts receivable doesn't lose track.`,
    });
  }

  return flags;
}

export function appointmentRowHealthChecks(row: {
  cohort: string | null;
  enrManager: string | null;
  status: string | null;
  appointmentTime: string | null;
}): HealthFlag[] {
  const flags: HealthFlag[] = [];

  const cohortStatus = classifyCohort(row.cohort);
  if (cohortStatus.status === "empty") {
    flags.push({
      field: "Cohort",
      kind: "missing_cohort",
      raw: "",
      hint: `Open Notion → "Appointments Tracker" → find this call (search Name column) → set the Cohort field to one of: Erupt 1, Erupt 2, Erupt 3, Penetrate. Without a cohort tag the call won't roll up in the correct funnel.`,
    });
  } else if (cohortStatus.status === "inconsistent") {
    const suggested = cohortStatus.suggestion || "Erupt 1 / Erupt 2 / Erupt 3 / Penetrate";
    flags.push({
      field: "Cohort",
      kind: "inconsistent_cohort",
      raw: cohortStatus.raw,
      hint: `Cohort field is "${cohortStatus.raw}" but the funnel expects a single canonical name. FIX: Open Notion → "Appointments Tracker" → search Name for this record → change Cohort to "${suggested}".`,
    });
  }

  if (!row.enrManager || !row.enrManager.trim()) {
    flags.push({
      field: "Enr Manager",
      kind: "missing_closer",
      raw: "",
      hint: `Open Notion → "Appointments Tracker" → search Name for this record → set the "Enr Manager" field to whichever closer took the call. Without it the call doesn't count on their scorecard.`,
    });
  }

  // Appointment time in the past but status is still blank
  if (row.appointmentTime) {
    const t = new Date(row.appointmentTime).getTime();
    if (!isNaN(t) && t < Date.now() && (!row.status || !row.status.trim())) {
      flags.push({
        field: "Appointment Status",
        kind: "showed_no_status",
        raw: "(blank)",
        hint: `Open Notion → "Appointments Tracker" → search Name for this record. The call time ${row.appointmentTime} has passed but the "Appointment Status" field is still blank. Mark it as Showed, No show, Cancelled, or Rescheduled so the funnel counts it correctly.`,
      });
    }
  }

  return flags;
}

export function applicationRowHealthChecks(row: {
  annualEarnings: string | null;
}): HealthFlag[] {
  const flags: HealthFlag[] = [];
  if (!row.annualEarnings || !row.annualEarnings.trim()) {
    flags.push({
      field: "Annual Earnings",
      kind: "missing_income_bracket",
      raw: "",
      hint: `Open Notion → "REBORN Application Tracker" → find this application (search First Name / Email) → fill in the "Annual Earnings" field. The income bracket drives lead scoring — without it, this application won't show up in bracket-filtered views.`,
    });
  }
  return flags;
}

// ────────────────────────────────────────────────────────────────
// Cross-row post-processing — mutates rows to add duplicate flags
// ────────────────────────────────────────────────────────────────

const norm = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim().toLowerCase());

/** Flag applicants who submitted multiple applications. Same email applying
 *  twice is worth a second look — either a real re-application (fine, but
 *  worth noting) or a mistake. */
export function flagDuplicateApplications(apps: ApplicationRow[]): void {
  const counts = new Map<string, number>();
  for (const r of apps) {
    const e = norm(r.email);
    if (!e) continue;
    counts.set(e, (counts.get(e) ?? 0) + 1);
  }
  for (const r of apps) {
    const e = norm(r.email);
    if (!e) continue;
    const count = counts.get(e) ?? 0;
    if (count > 1) {
      r.health.push({
        field: "Email",
        kind: "duplicate_application",
        raw: `${e} applied ${count}× times`,
        hint: `Open Notion → "REBORN Application Tracker" → search Email for "${e}" — you'll see ${count} applications. Verify whether this is a legitimate re-application (fine) or a duplicate submission that should be merged/deleted.`,
      });
    }
  }
}

/** Flag registrants who signed up for the same Product/Challenge more than
 *  once. Same email on multiple different products is fine (they took
 *  Penetrate then Erupt), same email on the same product is a dupe. */
export function flagDuplicateChallengeRegistrations(challenge: ChallengeRow[]): void {
  const counts = new Map<string, number>();
  const emailOf = (r: ChallengeRow) => {
    for (const k of Object.keys(r)) if (k.toLowerCase().includes("email")) return norm(r[k]);
    return "";
  };
  const productOf = (r: ChallengeRow) => {
    for (const k of Object.keys(r)) {
      const lk = k.toLowerCase();
      if (lk === "product" || lk === "challange" || lk === "challenge") return String(r[k] ?? "").toLowerCase();
    }
    return "";
  };
  for (const r of challenge) {
    const e = emailOf(r);
    const p = productOf(r);
    if (!e || !p) continue;
    const key = `${e}||${p}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const r of challenge) {
    const e = emailOf(r);
    const p = productOf(r);
    if (!e || !p) continue;
    const count = counts.get(`${e}||${p}`) ?? 0;
    if (count > 1) {
      r.health.push({
        field: "Email",
        kind: "duplicate_challenge_registration",
        raw: `${e} registered ${count}× for the same product`,
        hint: `Open the Google Sheet "Challenge Master Cash Tracker" → filter Email = "${e}" → they registered ${count} times for the same Product. Different products for the same email are fine (Penetrate then Erupt is a real sequence); same product twice is usually a duplicate to delete.`,
      });
    }
  }
}

export function flagDuplicateCashEmails(cash: CashRow[]): void {
  const counts = new Map<string, number>();
  for (const r of cash) {
    const e = norm(r.email);
    if (!e) continue;
    counts.set(e, (counts.get(e) ?? 0) + 1);
  }
  for (const r of cash) {
    const e = norm(r.email);
    if (!e) continue;
    const count = counts.get(e) ?? 0;
    if (count > 1) {
      r.health.push({
        field: "Email",
        kind: "duplicate_email_in_cash",
        raw: `${e} appears ${count}×`,
        hint: `Open Notion → "Reborn Cash Tracker" → search Email for "${e}" — you'll see ${count} rows. If it's an intentional activation + upgrade (or installment plan), leave it. If it's a truly duplicated record, delete the extras.`,
      });
    }
  }
}

// ────────────────────────────────────────────────────────────────
// UI-friendly labels for badges
// ────────────────────────────────────────────────────────────────

export const HEALTH_LABELS: Record<HealthFlagKind, { label: string; tone: "red" | "amber" | "muted" }> = {
  unparseable_money: { label: "UNPARSEABLE $", tone: "red" },
  missing_date: { label: "MISSING DATE", tone: "muted" },
  missing_value: { label: "MISSING VALUE", tone: "muted" },
  missing_cohort: { label: "NO COHORT", tone: "amber" },
  inconsistent_cohort: { label: "COHORT NAME", tone: "amber" },
  missing_closer: { label: "NO CLOSER", tone: "amber" },
  duplicate_email_in_cash: { label: "DUPLICATE EMAIL", tone: "amber" },
  duplicate_application: { label: "DUPLICATE APPLICATION", tone: "amber" },
  duplicate_challenge_registration: { label: "DUPLICATE REGISTRATION", tone: "amber" },
  cohort_window_mismatch: { label: "TAG ≠ WINDOW", tone: "amber" },
  zero_revenue_enrollment: { label: "$0 DEAL", tone: "red" },
  cash_gt_revenue: { label: "CASH > REVENUE", tone: "red" },
  outstanding_no_next_payment: { label: "OWES + NO DATE", tone: "amber" },
  showed_no_status: { label: "CALL NO STATUS", tone: "amber" },
  missing_income_bracket: { label: "NO INCOME", tone: "muted" },
};
