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
// Canonical cohort names — everything else is flagged as inconsistent
// ────────────────────────────────────────────────────────────────

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

  // Try a fuzzy suggestion
  const lc = v.toLowerCase();
  let suggestion: string | null = null;
  if (/erupt/i.test(lc)) {
    if (/1|one|dec/.test(lc)) suggestion = "Erupt 1";
    else if (/2|two|apr/.test(lc)) suggestion = "Erupt 2";
    else if (/3|three|aug/.test(lc)) suggestion = "Erupt 3";
  } else if (/penetrat/.test(lc)) {
    suggestion = "Penetrate";
  }
  return { status: "inconsistent", raw: v, suggestion };
}

// ────────────────────────────────────────────────────────────────
// Per-row check helpers — called from each source adapter
// ────────────────────────────────────────────────────────────────

export function cashRowHealthChecks(row: {
  cohort: string | null;
  enrManager: string | null;
  revenue: number | null;
  cashCollected: number | null;
  balance: number | null;
  nextPaymentDate: string | null;
}): HealthFlag[] {
  const flags: HealthFlag[] = [];

  const cohortStatus = classifyCohort(row.cohort);
  if (cohortStatus.status === "empty") {
    flags.push({
      field: "Cohort",
      kind: "missing_cohort",
      raw: "",
      hint: "Every enrollment should be tagged with Erupt 1 / Erupt 2 / Erupt 3 / Penetrate.",
    });
  } else if (cohortStatus.status === "inconsistent") {
    flags.push({
      field: "Cohort",
      kind: "inconsistent_cohort",
      raw: cohortStatus.raw,
      hint: cohortStatus.suggestion
        ? `Rename to "${cohortStatus.suggestion}" so it matches the funnel.`
        : "Rename to one of: Erupt 1, Erupt 2, Erupt 3, Penetrate.",
    });
  }

  if (!row.enrManager || !row.enrManager.trim()) {
    flags.push({
      field: "Enr Manager",
      kind: "missing_closer",
      raw: "",
      hint: "Set which closer owns this deal so it shows up on their scorecard.",
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
      hint: `Cash was collected ($${row.cashCollected}) but the Revenue / deal size field is blank. Enter the deal amount so cohort economics are accurate.`,
    });
  } else if (row.revenue === 0 && (row.cashCollected ?? 0) > 0) {
    flags.push({
      field: "Revenue",
      kind: "zero_revenue_enrollment",
      raw: "$0",
      hint: `Deal size is $0 but $${row.cashCollected} was collected — either fix the Revenue field, or note this is a comp so it isn't miscounted.`,
    });
  }

  // Cash collected greater than revenue is arithmetically impossible
  if (row.revenue !== null && row.cashCollected !== null && row.cashCollected > row.revenue) {
    flags.push({
      field: "Cash Collected",
      kind: "cash_gt_revenue",
      raw: `Cash $${row.cashCollected} > Revenue $${row.revenue}`,
      hint: "Cash Collected cannot exceed Revenue — one of the two numbers is wrong.",
    });
  }

  // Outstanding balance with no next payment date scheduled
  if (row.balance !== null && row.balance > 0 && !row.nextPaymentDate) {
    flags.push({
      field: "Date of Next Payment",
      kind: "outstanding_no_next_payment",
      raw: `Balance $${row.balance}`,
      hint: "This buyer owes money but has no Next Payment Date — set one so collections doesn't miss it.",
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
      hint: "Tag the call with which launch it's for (Erupt 1/2/3/Penetrate).",
    });
  } else if (cohortStatus.status === "inconsistent") {
    flags.push({
      field: "Cohort",
      kind: "inconsistent_cohort",
      raw: cohortStatus.raw,
      hint: cohortStatus.suggestion
        ? `Rename to "${cohortStatus.suggestion}".`
        : "Rename to one of: Erupt 1, Erupt 2, Erupt 3, Penetrate.",
    });
  }

  if (!row.enrManager || !row.enrManager.trim()) {
    flags.push({
      field: "Enr Manager",
      kind: "missing_closer",
      raw: "",
      hint: "Assign a closer so the call shows on their scorecard.",
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
        hint: "Call time has passed but status is blank — mark it Showed / No show / Rescheduled.",
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
      hint: "Income bracket drives lead scoring — capture it on every application.",
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
        hint: "Same email appears on multiple applications — verify whether this is a re-application or a duplicate submission.",
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
        hint: "Same email + same challenge product on multiple rows. Different products are fine; same product twice is likely a duplicate.",
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
        hint: "Same buyer on multiple Cash rows — probably an activation + upgrade pair. Verify these aren't accidental duplicates.",
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
  zero_revenue_enrollment: { label: "$0 DEAL", tone: "red" },
  cash_gt_revenue: { label: "CASH > REVENUE", tone: "red" },
  outstanding_no_next_payment: { label: "OWES + NO DATE", tone: "amber" },
  showed_no_status: { label: "CALL NO STATUS", tone: "amber" },
  missing_income_bracket: { label: "NO INCOME", tone: "muted" },
};
