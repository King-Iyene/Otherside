import type { ApplicationRow, AppointmentRow, CashRow, ChallengeRow } from "./types";
import { subOfferOf } from "./launchNames";

/**
 * Cohort Funnel — the high-level "one-click" sales story.
 *
 * A cohort is a named launch (Erupt 1, Erupt 2, Penetrate). For each cohort we
 * compute the full sales funnel:
 *   Challenge Registered → Applied → Booked Call → Showed → Enrolled → Cash
 *
 * Every stage is a UNIQUE-EMAIL count (a single person who registered 3× is
 * one person, not three). Conversion rates are computed both stage-to-stage
 * and against the top of the funnel.
 *
 * The heuristics: we identify each stage's members by BOTH the dataset's
 * native cohort field (Cash.cohort, Appointments.cohort, Challenge.Product)
 * AND email intersection with the previous stage — so we catch people who
 * came in via multiple paths.
 */

const norm = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim().toLowerCase());
/** Any of these substrings anywhere in the status string counts as "showed".
 *  Case-insensitive. Errs on the side of catching real appearances — a No Show
 *  or Cancelled is explicitly excluded, everything else that looks positive
 *  gets counted. */
const SHOWED_PATTERNS = [/show/i, /attend/i, /confirm/i, /client\s*won/i, /finish/i, /completed/i];
const NOT_SHOWED_PATTERNS = [/no\s*show/i, /cancel/i, /resched/i, /didn.?t/i, /missed/i];
function isShowedStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = String(status);
  if (NOT_SHOWED_PATTERNS.some((p) => p.test(s))) return false;
  return SHOWED_PATTERNS.some((p) => p.test(s));
}

export interface CohortDef {
  id: string;
  label: string;
  emoji: string;
  color: string;
  /** Match rows whose cohort/product/challange field contains one of these patterns. */
  patterns: RegExp[];
  /** Launch window — used as fallback attribution when the cohort tag is blank. */
  window?: { start: string; end: string };
}

/**
 * Cohorts assigned to categorical slots from the Claude dataviz reference
 * palette in FIXED order (--cat-1..--cat-8 in globals.css). A new cohort
 * takes the next slot, never a rotated hue.
 */
export const COHORTS: CohortDef[] = [
  {
    id: "penetrate",
    label: "Penetrate",
    emoji: "",
    color: "var(--cat-1)",           // blue — slot 1
    patterns: [/penetrate/i],
  },
  {
    id: "erupt1",
    label: "Erupt 1",
    emoji: "",
    color: "var(--cat-2)",           // aqua — slot 2
    patterns: [/erupt\s*1/i, /reborn\s*dec\s*2025/i, /dec\s*2025/i],
    window: { start: "2025-10-01", end: "2026-01-31" },
  },
  {
    id: "erupt2",
    label: "Erupt 2",
    emoji: "",
    color: "var(--cat-3)",           // yellow — slot 3
    patterns: [/erupt\s*2/i, /reborn\s*apr\s*2026/i, /apr\s*2026/i],
    window: { start: "2026-02-01", end: "2026-05-31" },
  },
  {
    id: "erupt3",
    label: "Erupt 3",
    emoji: "",
    color: "var(--cat-5)",           // violet — slot 5 (skip slot 4 green for CVD)
    patterns: [/erupt\s*3/i, /reborn\s*aug\s*2026/i, /aug\s*2026/i],
    window: { start: "2026-06-01", end: "2026-09-30" },
  },
];

function inWindow(dateStr: string | null | undefined, window?: { start: string; end: string }): boolean {
  if (!window || !dateStr) return false;
  const t = new Date(dateStr).getTime();
  if (isNaN(t)) return false;
  const s = new Date(window.start).getTime();
  const e = new Date(window.end).getTime();
  return t >= s && t <= e;
}

function matchesCohort(value: unknown, cohort: CohortDef): boolean {
  if (value === null || value === undefined) return false;
  const s = String(value);
  return cohort.patterns.some((p) => p.test(s));
}

function challengeEmailOf(r: ChallengeRow): string {
  for (const k of Object.keys(r)) if (k.toLowerCase().includes("email")) return norm(r[k]);
  return "";
}

function challengeProductOf(r: ChallengeRow): string {
  // The challenge sheet exposes the cohort under Product or Challange column
  for (const k of Object.keys(r)) {
    const lk = k.toLowerCase();
    if (lk === "product" || lk === "challange" || lk === "challenge") return String(r[k] ?? "");
  }
  return "";
}

function challengeAmountOf(r: ChallengeRow): number {
  for (const k of Object.keys(r)) {
    const lk = k.toLowerCase();
    if (lk === "amount" || lk.includes("price") || lk.includes("revenue")) {
      const v = r[k];
      if (typeof v === "number") return v;
      const parsed = Number(String(v).replace(/[$,\s]/g, ""));
      return isNaN(parsed) ? 0 : parsed;
    }
  }
  return 0;
}

function challengeSaleDateOf(r: ChallengeRow): string | null {
  for (const k of Object.keys(r)) {
    const lk = k.toLowerCase();
    if (lk.includes("sale date") || lk === "date") {
      const v = r[k];
      return v ? String(v) : null;
    }
  }
  return null;
}

export interface FunnelStage {
  key: "registered" | "applied" | "booked" | "showed" | "enrolled";
  label: string;
  emoji: string;
  /** Unique-lead count for this stage. */
  count: number;
  /** Raw rows in this stage (deduped by email — one row per person). */
  rows: any[];
  /** Optional dollar amount attached (currently only for `cash`). */
  dollarAmount?: number;
  /** Which dataset the rows came from (for the drill-down table renderer). */
  source: "challenge" | "applications" | "appointments" | "cash";
  /** Plain-English explanation of how this number was calculated. */
  howCalculated: string;
}

export interface CohortFunnel {
  cohort: CohortDef;
  stages: FunnelStage[];
  /** Total cash collected on the Cash stage. */
  totalCash: number;
  /** Total challenge revenue (Product sale). */
  challengeRevenue: number;
}

export interface FunnelBundle {
  applications: ApplicationRow[];
  cash: CashRow[];
  appointments: AppointmentRow[];
  challenge: ChallengeRow[];
}

function dedupeByEmail<T>(rows: T[], getEmail: (r: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const e = getEmail(r);
    if (!e) {
      out.push(r);
      continue;
    }
    if (seen.has(e)) continue;
    seen.add(e);
    out.push(r);
  }
  return out;
}

function emailSetOf<T>(rows: T[], getEmail: (r: T) => string): Set<string> {
  const s = new Set<string>();
  for (const r of rows) {
    const e = getEmail(r);
    if (e) s.add(e);
  }
  return s;
}

export function computeCohortFunnel(cohort: CohortDef, data: FunnelBundle, includeTest = false): CohortFunnel {
  const chal = includeTest ? data.challenge : data.challenge.filter((r) => !r.isTest);
  const apps = includeTest ? data.applications : data.applications.filter((r) => !r.isTest);
  const appts = includeTest ? data.appointments : data.appointments.filter((r) => !r.isTest);
  const cash = includeTest ? data.cash : data.cash.filter((r) => !r.isTest);

  // ─── STAGE 5 FIRST — Enrolled anchor ─────────────────────────────────
  // Computing enrolled first gives us the ground-truth set of buyers for
  // this cohort. Every earlier stage can then retro-attribute (i.e. "of
  // the eventual buyers, how many applied") which surfaces people who
  // came in via untagged paths.
  const enrolledByCohort = cash.filter((c) => matchesCohort(c.cohort, cohort));
  const enrolledByWindow = cohort.window
    ? cash.filter((c) => !c.cohort && inWindow(c.enrollmentDate, cohort.window))
    : [];
  const enrolled = Array.from(new Set([...enrolledByCohort, ...enrolledByWindow]));
  const enrolledDedup = dedupeByEmail(enrolled, (r) => norm(r.email));
  const enrolledEmails = emailSetOf(enrolledDedup, (r) => norm(r.email));
  const totalCash = enrolled.reduce((s, r) => s + (r.cashCollected ?? 0), 0);

  // ─── STAGE 1 — Registered ────────────────────────────────────────────
  // Product name match  ∪  sale date inside window  ∪  email is an eventual buyer
  const registered = chal.filter((r) => {
    if (matchesCohort(challengeProductOf(r), cohort)) return true;
    if (cohort.window && inWindow(challengeSaleDateOf(r), cohort.window)) return true;
    const e = challengeEmailOf(r);
    if (e && enrolledEmails.has(e)) return true;
    return false;
  });
  const registeredDedup = dedupeByEmail(registered, challengeEmailOf);
  const registeredEmails = emailSetOf(registeredDedup, challengeEmailOf);
  const challengeRevenue = registered.reduce((s, r) => s + challengeAmountOf(r), 0);

  // ─── STAGE 2 — Applied ───────────────────────────────────────────────
  // email is a registered lead  ∪  email is an eventual buyer  ∪  applied inside window
  const applied = apps.filter((a) => {
    const e = norm(a.email);
    if (e && registeredEmails.has(e)) return true;
    if (e && enrolledEmails.has(e)) return true;
    if (cohort.window && inWindow(a.dateCreated, cohort.window)) return true;
    return false;
  });
  const appliedDedup = dedupeByEmail(applied, (r) => norm(r.email));
  const appliedEmails = emailSetOf(appliedDedup, (r) => norm(r.email));

  // ─── STAGE 3 — Booked ────────────────────────────────────────────────
  // cohort tag  ∪  email in reg/applied/enrolled  ∪  appointment time inside window
  const bookedAll = appts.filter((a) => {
    if (matchesCohort(a.cohort, cohort)) return true;
    const e = norm(a.email);
    if (e && (registeredEmails.has(e) || appliedEmails.has(e) || enrolledEmails.has(e))) return true;
    if (cohort.window && !a.cohort && inWindow(a.appointmentTime, cohort.window)) return true;
    return false;
  });
  const bookedDedup = dedupeByEmail(bookedAll, (r) => norm(r.email));

  // ─── STAGE 4 — Showed ────────────────────────────────────────────────
  // Substring match — catches "Showed", "Showed Up", "Attended", "Confirmed",
  // "Client Won", "Finisher", "Completed". Explicitly excludes "No Show",
  // "Cancelled", "Rescheduled".
  const showed = bookedAll.filter((a) => isShowedStatus(a.status));
  const showedDedup = dedupeByEmail(showed, (r) => norm(r.email));

  const stages: FunnelStage[] = [
    {
      key: "registered",
      label: "Challenge Registered",
      emoji: "",
      count: registeredDedup.length,
      rows: registeredDedup,
      source: "challenge",
      dollarAmount: challengeRevenue,
      howCalculated: `Unique people in the Challenge sheet whose Product/Challange field matches "${cohort.label}"${
        cohort.window ? ` OR whose Sale Date falls between ${cohort.window.start} and ${cohort.window.end}` : ""
      } OR whose email also appears in the Enrolled list (retro-attribution). Duplicates by email are counted once.`,
    },
    {
      key: "applied",
      label: "Applied",
      emoji: "",
      count: appliedDedup.length,
      rows: appliedDedup,
      source: "applications",
      howCalculated: `Unique applications whose email is in the Registered list OR the Enrolled list${
        cohort.window ? ` OR that were created between ${cohort.window.start} and ${cohort.window.end}` : ""
      }. Retro-attribution catches people who applied without going through the challenge.`,
    },
    {
      key: "booked",
      label: "Booked Call",
      emoji: "",
      count: bookedDedup.length,
      rows: bookedDedup,
      source: "appointments",
      howCalculated: `Unique appointments where the cohort field matches "${cohort.label}" OR the email matches a Registered / Applied lead${
        cohort.window ? ` OR the appointment falls between ${cohort.window.start} and ${cohort.window.end}` : ""
      }. Catches bookings even if the cohort field was left blank.`,
    },
    {
      key: "showed",
      label: "Showed",
      emoji: "",
      count: showedDedup.length,
      rows: showedDedup,
      source: "appointments",
      howCalculated: `Booked calls whose status is "Showed", "Client Won", or "Finisher". Deduped by email.`,
    },
    {
      key: "enrolled",
      label: "Enrolled",
      emoji: "",
      count: enrolledDedup.length,
      rows: enrolledDedup,
      source: "cash",
      // Cash lives on the Enrolled stage — same rows, different lens. The card
      // header shows the total dollar figure; each stage row keeps focus on
      // people-counts so the funnel reads as a single story.
      dollarAmount: totalCash,
      howCalculated: `Unique buyers in the Cash Tracker whose cohort field matches "${cohort.label}"${
        cohort.window ? ` OR whose enrollment date falls between ${cohort.window.start} and ${cohort.window.end}` : ""
      }. Deduped by email — one buyer = one enrollment even if they paid on multiple invoices. Cash Collected is the sum of every payment.`,
    },
  ];

  return { cohort, stages, totalCash, challengeRevenue };
}

/** Compute funnels for every configured cohort. */
export function computeAllCohortFunnels(data: FunnelBundle, includeTest = false): CohortFunnel[] {
  return COHORTS.map((c) => computeCohortFunnel(c, data, includeTest));
}

/** Percentage from previous stage. Null when previous is 0. */
export function stageToStageRate(prev: number, curr: number): number | null {
  if (prev <= 0) return null;
  return curr / prev;
}

/** Percentage from top of funnel. */
export function stageOfTotalRate(top: number, curr: number): number | null {
  if (top <= 0) return null;
  return curr / top;
}

export interface SubOfferBreakdownItem {
  key: string;
  value: number;
  cashCollected: number;
}

/** Within one launch (Erupt 2, Penetrate, ...), split enrolled buyers by the
 *  sub-offer tacked onto their Cohort field — "Erupt 2 > Retreat" vs. "Erupt 2
 *  > Reborn Core/Scholarship" vs. the plain standard launch. Every row still
 *  rolls up into the launch's total via computeCohortFunnel; this is a lens
 *  on top of the same Enrolled set, not a separate count. */
export function computeSubOfferBreakdown(
  cash: CashRow[],
  cohort: CohortDef,
  includeTest = false
): SubOfferBreakdownItem[] {
  const rows = (includeTest ? cash : cash.filter((c) => !c.isTest)).filter((c) => {
    if (matchesCohort(c.cohort, cohort)) return true;
    if (cohort.window && !c.cohort && inWindow(c.enrollmentDate, cohort.window)) return true;
    return false;
  });
  const deduped = dedupeByEmail(rows, (r) => norm(r.email));

  const groups = new Map<string, { count: number; cash: number }>();
  for (const r of deduped) {
    const key = subOfferOf(r.cohort) || `${cohort.label} (standard)`;
    const g = groups.get(key) ?? { count: 0, cash: 0 };
    g.count += 1;
    g.cash += r.cashCollected ?? 0;
    groups.set(key, g);
  }

  return Array.from(groups.entries())
    .map(([key, v]) => ({ key, value: v.count, cashCollected: v.cash }))
    .sort((a, b) => b.value - a.value);
}
