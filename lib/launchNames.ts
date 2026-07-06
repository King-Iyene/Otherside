/**
 * Launch-name recognition — the SINGLE source of truth for what text counts as
 * a launch (a "cohort"). Used by dataHealth.ts (row-level validation) and
 * cohortFunnel.ts (attribution + comparison + sub-offer breakdown) so the two
 * never disagree.
 *
 * Nothing here is hardwired to "Erupt". Launches are pure config: a list of
 * numbered SERIES (Erupt, Advance, Strong, …) plus one-off STANDALONE_LAUNCHES.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  HOW TO ADD / CHANGE A LAUNCH  (read before touching the code)
 * ═══════════════════════════════════════════════════════════════════════════
 *  A) A new number in an existing series — "Erupt 5", "Strong 7", …:
 *        DO NOTHING. Any "<series> <number>" is recognized automatically and
 *        appears in the funnels, the Side-by-Side comparison, and Data Health
 *        the moment a record is tagged with it. No code change, no deploy.
 *        (Optionally add a window/color under that series' `numbers` for a
 *        nicer chart — never required.)
 *
 *  B) A brand-new SERIES with its own numbering — you start "Advance 1",
 *     "Strong 1", etc.:
 *        Add ONE line to SERIES below: `{ name: "Advance" }`. That's it — every
 *        "Advance <n>" is now recognized everywhere. Add `numbers` only if you
 *        want per-launch windows/colors.
 *
 *  C) A one-off launch that ISN'T numbered — a standalone brand like
 *     "Penetrate", "VIP Day":
 *        Add ONE entry to STANDALONE_LAUNCHES — the `label` plus the `keywords`
 *        that appear in the Cohort (Notion) or Product (Sheet) field.
 *
 *  D) Renaming a series later (Erupt → "Blaze"):
 *        Change that series' `name`. If old records still say "Erupt", add it
 *        to that series' `legacyNames` so history keeps resolving.
 *
 *  Matching is CONTAINS, not exact-equals. Compound values like "Erupt 2 >
 *  Retreat" resolve to their launch (Erupt 2); the trailing part is a sub-offer.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface LaunchDef {
  /** Canonical display name, e.g. "Penetrate", "Erupt 2". */
  label: string;
  /** Extra text (besides the label itself) that identifies this launch. */
  keywords: string[];
  /** Launch date window — fallback attribution for untagged records. Optional. */
  window?: { start: string; end: string };
  /** Chart color. Optional — auto-detected launches cycle through spare slots. */
  color?: string;
}

interface SeriesNumberMeta {
  window?: { start: string; end: string };
  color?: string;
  /** Legacy / alternate strings that also mean this number (e.g. a month code). */
  aliases?: string[];
}

export interface LaunchSeries {
  /** Current series name, e.g. "Erupt", "Advance", "Strong". */
  name: string;
  /** Former names still present in old data, so history keeps resolving. */
  legacyNames?: string[];
  /** Default color for this series' numbers when a number has no color set. */
  color?: string;
  /** Per-number metadata for numbers that already launched. New numbers work
   *  without an entry here. */
  numbers?: Record<number, SeriesNumberMeta>;
}

/**
 * The numbered launch series. Multiple can run at once. Add a line to start a
 * new series; add a `numbers` entry only to style/window a specific launch.
 */
export const SERIES: LaunchSeries[] = [
  {
    name: "Erupt",
    numbers: {
      1: { window: { start: "2025-10-01", end: "2026-01-31" }, color: "var(--cat-2)", aliases: ["reborn dec 2025", "dec 2025"] },
      2: { window: { start: "2026-02-01", end: "2026-05-31" }, color: "var(--cat-3)", aliases: ["reborn apr 2026", "apr 2026"] },
      3: { window: { start: "2026-06-01", end: "2026-09-30" }, color: "var(--cat-5)", aliases: ["reborn aug 2026", "aug 2026"] },
    },
  },
  // Example future series — uncomment / add as you launch them:
  // { name: "Advance" },
  // { name: "Strong" },
];

/** One-off launches that are NOT part of any numbered series. */
export const STANDALONE_LAUNCHES: LaunchDef[] = [
  { label: "Penetrate", keywords: ["penetrate"], color: "var(--cat-1)" },
];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** All names a series can be written as (current + legacy). */
function namesOf(s: LaunchSeries): string[] {
  return [s.name, ...(s.legacyNames ?? [])].filter(Boolean);
}

/** If a label is a series number ("Advance 2"), return its series + number. */
export function resolveSeriesNumber(label: string): { series: LaunchSeries; num: number } | null {
  for (const s of SERIES) {
    for (const name of namesOf(s)) {
      const m = label.match(new RegExp(`^${escapeRe(name)}\\s*(\\d+)$`, "i"));
      if (m) return { series: s, num: Number(m[1]) };
    }
  }
  return null;
}

/**
 * Resolve a raw Cohort/Product value to its canonical launch name, or null.
 *
 * Order: (1) an explicit "<series> <n>" for ANY configured series wins — the
 * zero-config path that makes new numbers Just Work; (2) a configured series
 * alias (month/year code); (3) a standalone launch label/keyword.
 */
export function extractLaunch(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v);

  for (const series of SERIES) {
    for (const name of namesOf(series)) {
      const m = s.match(new RegExp(`${escapeRe(name)}\\s*(\\d+)`, "i"));
      if (m) return `${series.name} ${m[1]}`;
    }
  }
  for (const series of SERIES) {
    for (const [num, meta] of Object.entries(series.numbers ?? {})) {
      for (const a of meta.aliases ?? []) {
        if (new RegExp(escapeRe(a), "i").test(s)) return `${series.name} ${num}`;
      }
    }
  }
  for (const l of STANDALONE_LAUNCHES) {
    if (new RegExp(`\\b${escapeRe(l.label)}\\b`, "i").test(s)) return l.label;
    for (const kw of l.keywords) if (new RegExp(escapeRe(kw), "i").test(s)) return l.label;
  }
  return null;
}

/** The regex(es) that identify a launch in a raw field value. Config-driven —
 *  no series name is special. */
export function patternsForLaunch(label: string): RegExp[] {
  const r = resolveSeriesNumber(label);
  if (r) {
    const pats = namesOf(r.series).map((name) => new RegExp(`${escapeRe(name)}\\s*${r.num}(?!\\d)`, "i"));
    for (const a of r.series.numbers?.[r.num]?.aliases ?? []) pats.push(new RegExp(escapeRe(a), "i"));
    return pats;
  }
  const standalone = STANDALONE_LAUNCHES.find((l) => l.label === label);
  const pats = [new RegExp(escapeRe(label), "i")];
  for (const kw of standalone?.keywords ?? []) pats.push(new RegExp(escapeRe(kw), "i"));
  return pats;
}

/** A preferred color for a launch label if the config specifies one. */
export function colorForLaunch(label: string): string | undefined {
  const r = resolveSeriesNumber(label);
  if (r) return r.series.numbers?.[r.num]?.color || r.series.color;
  return STANDALONE_LAUNCHES.find((l) => l.label === label)?.color;
}

/** The curated launches, in display order: standalones first, then each
 *  series' configured numbers ascending. cohortFunnel augments this with any
 *  extra launches found in the data. */
export function configuredLaunches(): LaunchDef[] {
  const series: LaunchDef[] = [];
  for (const s of SERIES) {
    const nums = Object.keys(s.numbers ?? {})
      .map(Number)
      .sort((a, b) => a - b);
    for (const num of nums) {
      const meta = s.numbers![num];
      series.push({
        label: `${s.name} ${num}`,
        keywords: meta.aliases ?? [],
        window: meta.window,
        color: meta.color || s.color,
      });
    }
  }
  return [...STANDALONE_LAUNCHES, ...series];
}

/** The sub-offer label within a launch — whatever comes after the launch
 *  marker in a compound Cohort/Product value, e.g. "Erupt 2 > Retreat" → "Retreat".
 *  Returns null when the value IS the standard launch name with nothing else
 *  tacked on (e.g. plain "Erupt 2" or "Reborn Apr 2026"). */
export function subOfferOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = String(value).trim();
  const launch = extractLaunch(v);
  if (!launch) return null;
  const parts = v.split(">").map((s) => s.trim()).filter(Boolean);
  if (parts.length > 1) return parts.slice(1).join(" > ");
  // No ">" delimiter — strip the launch marker and keep any trailing text.
  let stripped = v;
  for (const re of patternsForLaunch(launch)) stripped = stripped.replace(re, "");
  stripped = stripped.trim();
  return stripped.length > 0 ? stripped : null;
}
