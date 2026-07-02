import type { SalesActivityRow } from "./types";
import type { Benchmarks, ScorecardWeights } from "./benchmarks";
import { parseDateOnly } from "./dates";

export interface CloserTotals {
  newCalls: number;
  cancelledCalls: number;
  rescheduled: number;
  noShow: number;
  showed: number;
  offersMade: number;
  salesMade: number;
  paidInFull: number;
  paymentPlans: number;
  followUpCalls: number;
  followUpScheduled: number;
  cashOnCall: number;
  salesRevenue: number;
  entryCount: number;
}

export interface CloserRates {
  showPct: number | null;
  offerPct: number | null;
  closePctShows: number | null;
  closePctOffers: number | null;
  avgDealSize: number | null;
}

export interface CoachingFlag {
  severity: "positive" | "warning" | "critical";
  category: "attainment" | "activity" | "conversion" | "engagement";
  headline: string;
  detail: string;
}

export interface CloserScorecard {
  closer: string;
  totals: CloserTotals;
  rates: CloserRates;
  compositeScore: number;
  rank: number | null;
  teamSize: number;
  vsTeam: {
    cashOnCall: number;
    salesMade: number;
    closeRateShows: number | null;
    showRate: number | null;
    offerRate: number | null;
    newCalls: number;
  };
  vsBenchmark: {
    showRate: number | null;
    offerRate: number | null;
    closeRateShows: number | null;
    closeRateOffers: number | null;
    avgDealSize: number | null;
  };
  weekOverWeek: {
    cashOnCall: number | null;
    showRate: number | null;
    closeRateShows: number | null;
  };
  flags: CoachingFlag[];
  daysSinceLastActivity: number | null;
}

export function emptyTotals(): CloserTotals {
  return {
    newCalls: 0,
    cancelledCalls: 0,
    rescheduled: 0,
    noShow: 0,
    showed: 0,
    offersMade: 0,
    salesMade: 0,
    paidInFull: 0,
    paymentPlans: 0,
    followUpCalls: 0,
    followUpScheduled: 0,
    cashOnCall: 0,
    salesRevenue: 0,
    entryCount: 0,
  };
}

export function totalsOf(rows: SalesActivityRow[]): CloserTotals {
  const t = emptyTotals();
  for (const r of rows) {
    t.newCalls += r.newCalls ?? 0;
    t.cancelledCalls += r.cancelledCalls ?? 0;
    t.rescheduled += r.rescheduled ?? 0;
    t.noShow += r.noShow ?? 0;
    t.showed += r.showed ?? 0;
    t.offersMade += r.offersMade ?? 0;
    t.salesMade += r.salesMade ?? 0;
    t.paidInFull += r.paidInFull ?? 0;
    t.paymentPlans += r.paymentPlans ?? 0;
    t.followUpCalls += r.followUpCalls ?? 0;
    t.followUpScheduled += r.followUpScheduled ?? 0;
    t.cashOnCall += r.cashCollectedOnCall ?? 0;
    t.salesRevenue += r.salesRevenue ?? 0;
    t.entryCount += 1;
  }
  return t;
}

export function ratesOf(t: CloserTotals): CloserRates {
  const div = (a: number, b: number) => (b > 0 ? a / b : null);
  return {
    showPct: div(t.showed, t.newCalls),
    offerPct: div(t.offersMade, t.showed),
    closePctShows: div(t.salesMade, t.showed),
    closePctOffers: div(t.salesMade, t.offersMade),
    avgDealSize: t.salesMade > 0 ? t.salesRevenue / t.salesMade : null,
  };
}

/**
 * "% of benchmark hit" — capped at 150 to prevent one runaway stat from
 * dominating the composite score. Returns 0 when we can't measure the rate
 * yet (e.g. 0 calls in the period).
 */
function pctOfBench(actual: number | null, target: number): number {
  if (actual === null || target <= 0) return 0;
  return Math.min(150, (actual / target) * 100);
}

/**
 * Composite score 0-100+. 100 means "hit every benchmark at 100%".
 * Weights are configurable; sum is renormalized in getScorecardWeights().
 */
export function compositeScoreOf(
  totals: CloserTotals,
  rates: CloserRates,
  bench: Benchmarks,
  weights: ScorecardWeights,
  daysInPeriod: number
): number {
  const dailyCalls = daysInPeriod > 0 ? totals.newCalls / daysInPeriod : 0;
  const weeklyCash = daysInPeriod > 0 ? (totals.cashOnCall / daysInPeriod) * 7 : 0;

  const parts: [number, number][] = [
    [pctOfBench(weeklyCash, bench.weeklyCashOnCall), weights.cashOnCall],
    // Sales made: use "cash on call per sale" proxied by comparing salesRevenue against benchmark deal size
    [pctOfBench(totals.salesRevenue, bench.avgDealSize * (daysInPeriod / 7) * 5), weights.salesMade],
    [pctOfBench(rates.closePctShows, bench.closePctShows), weights.closeRateShows],
    [pctOfBench(rates.showPct, bench.showPct), weights.showRate],
    [pctOfBench(rates.offerPct, bench.offerPct), weights.offerRate],
    [pctOfBench(dailyCalls, bench.dailyCalls), weights.activity],
  ];

  const score = parts.reduce((sum, [value, weight]) => sum + value * weight, 0);
  return Math.round(score);
}

/** % delta of x vs baseline. Null when baseline is 0/null (can't compute). */
export function delta(current: number | null, baseline: number | null): number | null {
  if (current === null || baseline === null || baseline === 0) return null;
  return (current - baseline) / Math.abs(baseline);
}

export function detectCoachingFlags(
  totals: CloserTotals,
  rates: CloserRates,
  bench: Benchmarks,
  teamAvgRates: CloserRates,
  teamAvgCashOnCall: number,
  weekOverWeek: CloserScorecard["weekOverWeek"],
  daysSinceLastActivity: number | null
): CoachingFlag[] {
  const flags: CoachingFlag[] = [];

  // Engagement — no activity in 2+ days
  if (daysSinceLastActivity !== null && daysSinceLastActivity >= 2) {
    flags.push({
      severity: daysSinceLastActivity >= 4 ? "critical" : "warning",
      category: "engagement",
      headline: `No logged activity in ${daysSinceLastActivity} day${daysSinceLastActivity === 1 ? "" : "s"}`,
      detail: "Check that daily inputs are being logged. Recent stats may understate real performance.",
    });
  }

  // Week-over-week drops on key rates
  if (weekOverWeek.showRate !== null && weekOverWeek.showRate <= -0.1) {
    flags.push({
      severity: weekOverWeek.showRate <= -0.2 ? "critical" : "warning",
      category: "conversion",
      headline: `Show rate dropped ${Math.abs(weekOverWeek.showRate * 100).toFixed(1)}pts week-over-week`,
      detail: "Bookings may not be qualified enough, or confirmation cadence has slipped. Check reminder flow.",
    });
  }
  if (weekOverWeek.closeRateShows !== null && weekOverWeek.closeRateShows <= -0.1) {
    flags.push({
      severity: weekOverWeek.closeRateShows <= -0.2 ? "critical" : "warning",
      category: "conversion",
      headline: `Close rate (shows) dropped ${Math.abs(weekOverWeek.closeRateShows * 100).toFixed(1)}pts WoW`,
      detail: "Review recent call recordings — objection handling or offer framing may need coaching.",
    });
  }

  // Below-benchmark rates (only fire when we have enough data — 5+ shows)
  if (totals.showed >= 5 && rates.showPct !== null && rates.showPct < bench.showPct * 0.8) {
    flags.push({
      severity: "warning",
      category: "conversion",
      headline: `Show rate ${(rates.showPct * 100).toFixed(1)}% is >20% below benchmark (${(bench.showPct * 100).toFixed(0)}%)`,
      detail: "Confirmation call/text cadence, deposit collection at booking, or lead source quality are the usual culprits.",
    });
  }
  if (totals.showed >= 5 && rates.offerPct !== null && rates.offerPct < bench.offerPct * 0.8) {
    flags.push({
      severity: "warning",
      category: "conversion",
      headline: `Offer rate ${(rates.offerPct * 100).toFixed(1)}% is well below benchmark (${(bench.offerPct * 100).toFixed(0)}%)`,
      detail: "Closer may be leaving without pitching. Coaching moment on when to transition to the offer.",
    });
  }
  if (totals.offersMade >= 5 && rates.closePctShows !== null && rates.closePctShows < bench.closePctShows * 0.8) {
    flags.push({
      severity: "warning",
      category: "conversion",
      headline: `Close rate ${(rates.closePctShows * 100).toFixed(1)}% is below benchmark (${(bench.closePctShows * 100).toFixed(0)}%)`,
      detail: "Review objection handling and price-drop patterns. Compare to top closer's approach on similar deals.",
    });
  }

  // Team-relative — significantly below team average
  if (
    teamAvgRates.closePctShows !== null &&
    rates.closePctShows !== null &&
    teamAvgRates.closePctShows > 0 &&
    rates.closePctShows < teamAvgRates.closePctShows * 0.8 &&
    totals.showed >= 5
  ) {
    const gap = ((teamAvgRates.closePctShows - rates.closePctShows) * 100).toFixed(1);
    flags.push({
      severity: "warning",
      category: "conversion",
      headline: `Close rate ${gap}pts below team average`,
      detail: "Pair on live calls with top performer to identify the specific step where deals drop off.",
    });
  }

  // Positive flags — beating team by 10%+ on a key metric with real volume
  if (
    teamAvgRates.closePctShows !== null &&
    rates.closePctShows !== null &&
    rates.closePctShows > teamAvgRates.closePctShows * 1.1 &&
    totals.showed >= 5
  ) {
    flags.push({
      severity: "positive",
      category: "conversion",
      headline: `Close rate above team by ${((rates.closePctShows - teamAvgRates.closePctShows) * 100).toFixed(1)}pts`,
      detail: "Share what's working — offer framing, objection handling, or discovery — in next team standup.",
    });
  }
  if (teamAvgCashOnCall > 0 && totals.cashOnCall > teamAvgCashOnCall * 1.2) {
    flags.push({
      severity: "positive",
      category: "attainment",
      headline: `Cash on call ${(((totals.cashOnCall - teamAvgCashOnCall) / teamAvgCashOnCall) * 100).toFixed(0)}% above team average`,
      detail: "Top performer this period. Best practices are coaching content for the team.",
    });
  }

  return flags;
}

/** Number of days from `date` to today (UTC, day-granularity). Null if date is null. */
export function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = parseDateOnly(dateStr);
  if (!d) return null;
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const dUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.floor((todayUtc - dUtc) / (24 * 60 * 60 * 1000));
}

/** Latest activity date across a set of rows. */
export function lastActivityDate(rows: SalesActivityRow[]): string | null {
  let latest: string | null = null;
  for (const r of rows) {
    if (!r.date) continue;
    if (!latest || r.date > latest) latest = r.date;
  }
  return latest;
}

/**
 * Build sparkline series for a numeric metric bucketed by day.
 * Returns [{ date, value }] sorted ascending.
 */
export function dailySeries(rows: SalesActivityRow[], key: keyof SalesActivityRow): { date: string; value: number }[] {
  const buckets = new Map<string, number>();
  for (const r of rows) {
    if (!r.date) continue;
    const val = r[key];
    if (typeof val !== "number") continue;
    buckets.set(r.date, (buckets.get(r.date) ?? 0) + val);
  }
  return Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => ({ date, value }));
}
