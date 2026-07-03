import type { ApplicationRow, AppointmentRow, CashRow, ChallengeRow } from "./types";

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
const SHOWED_STATUSES = new Set(["Showed", "Client Won", "Finisher"]);

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

export const COHORTS: CohortDef[] = [
  {
    id: "penetrate",
    label: "Penetrate",
    emoji: "🎯",
    color: "#61aaf2",
    patterns: [/penetrate/i],
    // Penetrate is an evergreen offer, no fixed window
  },
  {
    id: "erupt1",
    label: "Erupt 1",
    emoji: "🔥",
    color: "#f28b61",
    patterns: [/erupt\s*1/i, /reborn\s*dec\s*2025/i, /dec\s*2025/i],
    window: { start: "2025-10-01", end: "2026-01-31" },
  },
  {
    id: "erupt2",
    label: "Erupt 2",
    emoji: "🔥",
    color: "#a48bf2",
    patterns: [/erupt\s*2/i, /reborn\s*apr\s*2026/i, /apr\s*2026/i],
    window: { start: "2026-02-01", end: "2026-05-31" },
  },
  {
    id: "erupt3",
    label: "Erupt 3",
    emoji: "🔥",
    color: "#f2b63c",
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

  // Stage 1: Registered — challenge sheet rows tagged with this cohort's Product
  const registered = chal.filter((r) => matchesCohort(challengeProductOf(r), cohort));
  const registeredDedup = dedupeByEmail(registered, challengeEmailOf);
  const registeredEmails = emailSetOf(registeredDedup, challengeEmailOf);
  const challengeRevenue = registered.reduce((s, r) => s + challengeAmountOf(r), 0);

  // Stage 2: Applied — application whose email matches a registered lead
  const applied = apps.filter((a) => {
    const e = norm(a.email);
    return e && registeredEmails.has(e);
  });
  const appliedDedup = dedupeByEmail(applied, (r) => norm(r.email));
  const appliedEmails = emailSetOf(appliedDedup, (r) => norm(r.email));

  // Stage 3: Booked Call — appointments tagged with this cohort OR email matches applied
  // OR appointment falls inside the cohort's launch window (catches untagged bookings)
  const bookedByCohort = appts.filter((a) => matchesCohort(a.cohort, cohort));
  const bookedByEmail = appts.filter((a) => {
    const e = norm(a.email);
    return e && (registeredEmails.has(e) || appliedEmails.has(e));
  });
  const bookedByWindow = cohort.window
    ? appts.filter((a) => !a.cohort && inWindow(a.appointmentTime, cohort.window))
    : [];
  const bookedAll = Array.from(new Set([...bookedByCohort, ...bookedByEmail, ...bookedByWindow]));
  const bookedDedup = dedupeByEmail(bookedAll, (r) => norm(r.email));

  // Stage 4: Showed — subset of booked with a "showed" status
  const showed = bookedAll.filter((a) => a.status && SHOWED_STATUSES.has(a.status));
  const showedDedup = dedupeByEmail(showed, (r) => norm(r.email));

  // Stage 5: Enrolled — cash rows tagged with this cohort OR enrolled during the window
  const enrolledByCohort = cash.filter((c) => matchesCohort(c.cohort, cohort));
  const enrolledByWindow = cohort.window
    ? cash.filter((c) => !c.cohort && inWindow(c.enrollmentDate, cohort.window))
    : [];
  const enrolled = Array.from(new Set([...enrolledByCohort, ...enrolledByWindow]));
  const enrolledDedup = dedupeByEmail(enrolled, (r) => norm(r.email));

  // Stage 6: Cash Collected — dollar sum on enrolled
  const totalCash = enrolled.reduce((s, r) => s + (r.cashCollected ?? 0), 0);

  const stages: FunnelStage[] = [
    {
      key: "registered",
      label: "Challenge Registered",
      emoji: "🎟️",
      count: registeredDedup.length,
      rows: registeredDedup,
      source: "challenge",
      dollarAmount: challengeRevenue,
      howCalculated: `Unique people in the Challenge sheet whose Product/Challange field matches "${cohort.label}". Duplicates by email are counted once.`,
    },
    {
      key: "applied",
      label: "Applied",
      emoji: "🧲",
      count: appliedDedup.length,
      rows: appliedDedup,
      source: "applications",
      howCalculated: `Unique applications whose email also appears in the Registered list. This tells you how many challenge sign-ups actually filled out the application.`,
    },
    {
      key: "booked",
      label: "Booked Call",
      emoji: "📞",
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
      emoji: "✅",
      count: showedDedup.length,
      rows: showedDedup,
      source: "appointments",
      howCalculated: `Booked calls whose status is "Showed", "Client Won", or "Finisher". Deduped by email.`,
    },
    {
      key: "enrolled",
      label: "Enrolled",
      emoji: "🏆",
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
