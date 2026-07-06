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
// Canonical cohort names — data-health recognizes any text that CONTAINS
// one of the 4 launch names as belonging to that launch, because real Cohort
// values are often compound: "Erupt 2 > Reborn Core/Scholarship", "Erupt 2 >
// Retreat", "Erupt 3 > Bonus" are legitimate sub-offers tied to a standard
// launch, not typos. The launch name extracted here (e.g. "Erupt 2") is what
// totals/funnels roll up to; the original raw text is preserved separately
// so sub-offer breakdowns can still see "Retreat" vs "Core/Scholarship".
//
// This is intentionally more permissive than pure typo detection: genuinely
// unrecognized text (no launch keyword at all, or a mangled one like
// "Erupt_1" / "penetrating") still flags as inconsistent with a suggestion.
// Mistagging (right launch keyword, wrong launch) is NOT caught here — that's
// what cohort_window_mismatch is for (tag vs. this row's own enrollment
// date), so a compound tag like "Erupt 3 > Reborn Aug 2026" resolving
// cleanly to "Erupt 3" doesn't slip through if the enrollment date actually
// sits in Erupt 2's window (Javid's case).
//
// Note: cohortFunnel.ts uses similar unanchored containment matching for
// attribution — that's about "who belongs to this cohort in the funnel."
// Both are now permissive on purpose; window-mismatch is the strict net.
// ────────────────────────────────────────────────────────────────

import { COHORTS } from "./cohortFunnel";
import { extractLaunch, subOfferOf } from "./launchNames";

export { subOfferOf };

export function classifyCohort(value: string | null | undefined):
  | { status: "empty" }
  | { status: "canonical"; name: string; raw: string }
  | { status: "inconsistent"; raw: string; suggestion: string | null } {
  if (!value || !String(value).trim()) return { status: "empty" };
  const v = String(value).trim();

  const launch = extractLaunch(v);
  if (launch) return { status: "canonical", name: launch, raw: v };

  // Nothing recognizable — fuzzy suggestion for a typo'd or malformed tag.
  // Penetrate wins outright; otherwise if we see "erupt", disambiguate by
  // digit / word / month year. Order matters — "erupt_3_something_2026"
  // must resolve to Erupt 3, not Erupt 2 just because "2" appears in "2026".
  // So Erupt N (from "eruptN") is checked BEFORE month/year hints.
  const lc = v.toLowerCase();
  let suggestion: string | null = null;
  if (/penetrat/.test(lc)) {
    suggestion = "Penetrate";
  } else if (/erupt/.test(lc)) {
    const digitAdj = lc.match(/erupt[_\s-]*([123]|one|two|three)/);
    if (digitAdj) {
      const d = digitAdj[1];
      if (d === "1" || d === "one") suggestion = "Erupt 1";
      else if (d === "2" || d === "two") suggestion = "Erupt 2";
      else if (d === "3" || d === "three") suggestion = "Erupt 3";
    }
    if (!suggestion) {
      if (/aug\s*2026/.test(lc)) suggestion = "Erupt 3";
      else if (/apr\s*2026/.test(lc)) suggestion = "Erupt 2";
      else if (/dec\s*2025/.test(lc)) suggestion = "Erupt 1";
    }
  } else {
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
  name?: string | null;
  email?: string | null;
}): HealthFlag[] {
  const flags: HealthFlag[] = [];

  // Empty stub row: a Cohort tag was set but there's no person attached (no
  // name AND no email). These are blank Notion rows that silently inflate
  // unique-people counts in the funnel. Flag them so they get deleted or
  // filled in. Only fires when a cohort tag exists — a fully blank row is
  // just noise, but a cohort-tagged blank is a real stub someone half-created.
  const hasName = !!(row.name && row.name.trim());
  const hasEmail = !!(row.email && row.email.trim());
  const hasCohortTag = !!(row.cohort && row.cohort.trim());
  if (hasCohortTag && !hasName && !hasEmail) {
    flags.push({
      field: "Name / Email",
      kind: "empty_enrollment_row",
      raw: `Cohort "${row.cohort}" but no name or email`,
      hint: `In Notion ("Reborn Cash Tracker") this row has a Cohort of "${row.cohort}" but no Name and no Email — it's a blank/half-created row. It gets counted as a person in the "${row.cohort}" funnel even though there's nobody attached. FIX: Open Notion → "Reborn Cash Tracker" → find the row tagged "${row.cohort}" with an empty Name → either fill in who this enrollment belongs to, or delete the row.`,
    });
  }

  const cohortStatus = classifyCohort(row.cohort);
  if (cohortStatus.status === "empty") {
    flags.push({
      field: "Cohort",
      kind: "missing_cohort",
      raw: "",
      hint: `This person doesn't have a Cohort (launch) set in Notion. FIX: Open Notion → "Reborn Cash Tracker" → search the Name column for this person → set Cohort to whichever launch they enrolled in: Erupt 1, Erupt 2, Erupt 3, or Penetrate.`,
    });
  } else if (cohortStatus.status === "inconsistent") {
    const suggested = cohortStatus.suggestion || "Erupt 1, Erupt 2, Erupt 3, or Penetrate";
    flags.push({
      field: "Cohort",
      kind: "inconsistent_cohort",
      raw: cohortStatus.raw,
      hint: `In Notion, this person's Cohort says "${cohortStatus.raw}" — that's not one of the 4 launch names our reports look for (Erupt 1, Erupt 2, Erupt 3, Penetrate), so they may not get counted correctly. Best guess based on the text: ${suggested}. FIX: Open Notion → "Reborn Cash Tracker" → search the Name column for this person → double-check which launch they're actually in, then set Cohort to that exact name.`,
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
        hint: `In Notion, this person's Cohort is set to "${cohortStatus.name}" — but their Enrollment Date (${row.enrollmentDate}) actually falls inside the "${expected}" launch's date range, not "${cohortStatus.name}"'s. One of the two is wrong. FIX: Open Notion → "Reborn Cash Tracker" → search Name for this person → check with them which launch they were actually in, then either change Cohort to "${expected}" (if the date is right) or fix the Enrollment Date (if the Cohort tag is right).`,
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
      hint: `This call doesn't have a Cohort (launch) set in Notion. FIX: Open Notion → "Appointments Tracker" → search the Name column for this call → set Cohort to whichever launch it belongs to: Erupt 1, Erupt 2, Erupt 3, or Penetrate.`,
    });
  } else if (cohortStatus.status === "inconsistent") {
    const suggested = cohortStatus.suggestion || "Erupt 1, Erupt 2, Erupt 3, or Penetrate";
    flags.push({
      field: "Cohort",
      kind: "inconsistent_cohort",
      raw: cohortStatus.raw,
      hint: `In Notion, this call's Cohort says "${cohortStatus.raw}" — that's not one of the 4 launch names our reports look for. Best guess: ${suggested}. FIX: Open Notion → "Appointments Tracker" → search Name for this record → set Cohort to the correct exact launch name.`,
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

/** Cross-source reconciliation: an `inconsistent_cohort` flag on a Cash Tracker
 *  row means the Notion Cohort field, taken alone, isn't one of the 4 clean
 *  canonical names. But if the Challenge Master Cash Tracker (Google Sheet)
 *  has a matching person (same email) whose Product/Challenge column reads
 *  the exact same text, that's not a data-entry mistake — both systems agree,
 *  it's just not canonical. Drop the flag in that case. If there's no
 *  matching sheet row, or the sheet disagrees, the flag stays: strict when
 *  there's nothing to cross-check against, flexible when both sides align. */
function challengeEmailOf(r: ChallengeRow): string {
  for (const k of Object.keys(r)) if (k.toLowerCase().includes("email")) return norm(r[k]);
  return "";
}
function challengeCohortTextOf(r: ChallengeRow): string {
  for (const k of Object.keys(r)) {
    const lk = k.toLowerCase();
    if (lk === "product" || lk === "challange" || lk === "challenge" || lk.includes("cohort")) {
      return String(r[k] ?? "").trim();
    }
  }
  return "";
}

export function reconcileCrossSourceCohortFlags(cash: CashRow[], challenge: ChallengeRow[]): void {
  if (!cash.length || !challenge.length) return;
  const sheetTextsByEmail = new Map<string, string[]>();
  for (const r of challenge) {
    const e = challengeEmailOf(r);
    const p = challengeCohortTextOf(r);
    if (!e || !p) continue;
    const list = sheetTextsByEmail.get(e) ?? [];
    list.push(p);
    sheetTextsByEmail.set(e, list);
  }
  for (const row of cash) {
    const e = norm(row.email);
    if (!e) continue;
    const sheetTexts = sheetTextsByEmail.get(e);
    if (!sheetTexts || !sheetTexts.length) continue;
    row.health = row.health
      .filter((f) => {
        if (f.kind !== "inconsistent_cohort") return true;
        const notionRaw = norm(f.raw);
        const agreesWithSheet = sheetTexts.some((v) => norm(v) === notionRaw);
        return !agreesWithSheet;
      })
      .map((f) => {
        if (f.kind !== "inconsistent_cohort") return f;
        // Both sources have data for this person but they disagree — say so
        // plainly instead of pretending the Google Sheet doesn't exist.
        return {
          ...f,
          hint: `Notion ("Reborn Cash Tracker") says this person's Cohort is "${f.raw}". The Google Sheet ("Challenge Master Cash Tracker") has a different value for the same email: "${sheetTexts[0]}". These don't match — find out which one is actually correct, then fix the other one to match.`,
        };
      });
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
  empty_enrollment_row: { label: "EMPTY ROW", tone: "red" },
  zero_revenue_enrollment: { label: "$0 DEAL", tone: "red" },
  cash_gt_revenue: { label: "CASH > REVENUE", tone: "red" },
  outstanding_no_next_payment: { label: "OWES + NO DATE", tone: "amber" },
  showed_no_status: { label: "CALL NO STATUS", tone: "amber" },
  missing_income_bracket: { label: "NO INCOME", tone: "muted" },
};
