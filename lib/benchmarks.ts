/**
 * Industry-standard high-ticket coaching / consulting sales benchmarks.
 *
 * These are the "what good looks like" targets used everywhere in the dashboard:
 *  - Coaching flag detection compares closer stats vs. these targets
 *  - Per-closer scorecard composite score is derived from % of benchmark hit
 *  - Cards show colored pips (green/yellow/red) based on distance from these
 *
 * All values are overridable at runtime via env vars (server-side) so you
 * can tune them without a code change. Defaults are calibrated for
 * high-ticket coaching sales specifically, not SaaS/enterprise.
 *
 * Env var overrides (all numeric, 0-1 for rates, ints for counts):
 *   BENCHMARK_SHOW_PCT              default 0.60
 *   BENCHMARK_OFFER_PCT             default 0.70
 *   BENCHMARK_CLOSE_PCT_SHOWS       default 0.20
 *   BENCHMARK_CLOSE_PCT_OFFERS      default 0.28
 *   BENCHMARK_DAILY_CALLS           default 8
 *   BENCHMARK_WEEKLY_CASH_ON_CALL   default 15000
 *   BENCHMARK_AVG_DEAL_SIZE         default 3000
 *
 * Composite-score weights (must sum to 1.0):
 *   WEIGHT_CASH_ON_CALL             default 0.25
 *   WEIGHT_SALES_MADE               default 0.20
 *   WEIGHT_CLOSE_RATE_SHOWS         default 0.20
 *   WEIGHT_SHOW_RATE                default 0.15
 *   WEIGHT_OFFER_RATE               default 0.10
 *   WEIGHT_ACTIVITY                 default 0.10
 */

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export interface Benchmarks {
  showPct: number;
  offerPct: number;
  closePctShows: number;
  closePctOffers: number;
  dailyCalls: number;
  weeklyCashOnCall: number;
  avgDealSize: number;
  /** Business-level pacing targets (Overview tab). */
  monthlyCashCollected: number;
  monthlyRevenueBooked: number;
  monthlyEnrollments: number;
}

export interface ScorecardWeights {
  cashOnCall: number;
  salesMade: number;
  closeRateShows: number;
  showRate: number;
  offerRate: number;
  activity: number;
}

export function getBenchmarks(): Benchmarks {
  return {
    showPct: num("BENCHMARK_SHOW_PCT", 0.6),
    offerPct: num("BENCHMARK_OFFER_PCT", 0.7),
    closePctShows: num("BENCHMARK_CLOSE_PCT_SHOWS", 0.2),
    closePctOffers: num("BENCHMARK_CLOSE_PCT_OFFERS", 0.28),
    dailyCalls: num("BENCHMARK_DAILY_CALLS", 8),
    weeklyCashOnCall: num("BENCHMARK_WEEKLY_CASH_ON_CALL", 15000),
    avgDealSize: num("BENCHMARK_AVG_DEAL_SIZE", 3000),
    monthlyCashCollected: num("TARGET_MONTHLY_CASH", 150000),
    monthlyRevenueBooked: num("TARGET_MONTHLY_REVENUE", 200000),
    monthlyEnrollments: num("TARGET_MONTHLY_ENROLLMENTS", 40),
  };
}

export function getScorecardWeights(): ScorecardWeights {
  const w = {
    cashOnCall: num("WEIGHT_CASH_ON_CALL", 0.25),
    salesMade: num("WEIGHT_SALES_MADE", 0.2),
    closeRateShows: num("WEIGHT_CLOSE_RATE_SHOWS", 0.2),
    showRate: num("WEIGHT_SHOW_RATE", 0.15),
    offerRate: num("WEIGHT_OFFER_RATE", 0.1),
    activity: num("WEIGHT_ACTIVITY", 0.1),
  };
  const total = Object.values(w).reduce((s, v) => s + v, 0);
  if (Math.abs(total - 1) < 0.001) return w;
  // Renormalize if the user set weights that don't sum to 1 — keeps composite score
  // interpretable as "0-100 % of ideal" rather than an arbitrary number.
  const factor = total > 0 ? 1 / total : 1;
  return {
    cashOnCall: w.cashOnCall * factor,
    salesMade: w.salesMade * factor,
    closeRateShows: w.closeRateShows * factor,
    showRate: w.showRate * factor,
    offerRate: w.offerRate * factor,
    activity: w.activity * factor,
  };
}
