/**
 * Column-role detection for the Challenge Google Sheet.
 *
 * The sheet's headers vary between accounts ("Amount", "Total Paid", "Charged",
 * "Order Value", "Sale Date", "Created", …), so matching on header text alone is
 * brittle — that's what left the Challenge tab showing $0 revenue when the money
 * column wasn't literally called "amount". These detectors combine a header hint
 * with a look at the actual VALUES in each column, so the money column is found
 * because it holds money and the date column because it holds dates.
 */

export type Row = Record<string, any>;

const str = (v: any): string => (v === null || v === undefined ? "" : String(v).trim());

/** Parse a money-ish value ("$1,299.00", "₦5000", "1200") → number, or null. */
export function parseAmount(v: any): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = str(v);
  if (!s) return null;
  const cleaned = s.replace(/[$€£₦,\s]/g, "");
  if (cleaned === "" || !/\d/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Does a value look like a real date (has separators + parses), not just a number? */
export function looksLikeDate(v: any): boolean {
  const s = str(v);
  if (!s) return false;
  if (/^\d+(\.\d+)?$/.test(s.replace(/[$,]/g, ""))) return false; // pure number / money, not a date
  if (!/[-/.]|\b\d{1,2}\s\w+\s\d{2,4}\b|\w{3,}\s+\d{1,2}/.test(s) && !/\d{4}/.test(s)) return false;
  const t = Date.parse(s);
  return !Number.isNaN(t);
}

function pickHeader(columns: string[], patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const hit = columns.find((c) => p.test(c));
    if (hit) return hit;
  }
  return null;
}

const NEVER_MONEY = /email|phone|mobile|zip|postal|\bid\b|utm|name|address|url|link|date|time|coupon|promo|product|challa?nge|status|note|country|state|city/i;
const MONEY_HINT = /amount|revenue|cash|price|paid|total|charge|order|value|ticket|collected|sales|sum|gross|net|deposit|invoice/i;
const COUNTish = /count|qty|quantity|\bnumber\b|#|\bage\b|\byear\b|rank|position|index/i;

/** Best money column by content + header hint. */
export function detectAmountColumn(columns: string[], rows: Row[]): string | null {
  let best: string | null = null;
  let bestScore = -Infinity;
  const floor = Math.max(3, Math.floor(rows.length * 0.1));
  for (const c of columns) {
    if (NEVER_MONEY.test(c)) continue;
    const vals = rows.map((r) => r[c]).filter((v) => str(v) !== "");
    if (vals.length < floor) continue;
    const numFrac = vals.filter((v) => parseAmount(v) !== null).length / vals.length;
    if (numFrac < 0.6) continue;
    let score = numFrac;
    if (MONEY_HINT.test(c)) score += 2;
    const moneyish = vals.filter((v) => /[$€£₦]|\d\.\d{2}\b/.test(str(v))).length / vals.length;
    score += moneyish;
    if (COUNTish.test(c)) score -= 3;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/** Best date column by content + header hint. */
export function detectDateColumn(columns: string[], rows: Row[]): string | null {
  let best: string | null = null;
  let bestScore = -Infinity;
  for (const c of columns) {
    const vals = rows.map((r) => r[c]).filter((v) => str(v) !== "");
    if (!vals.length) continue;
    const dateFrac = vals.filter((v) => looksLikeDate(v)).length / vals.length;
    if (dateFrac < 0.6) continue;
    let score = dateFrac;
    if (/date|created|timestamp|enrolled|signup|sign.?up|registered|purchase|order/i.test(c)) score += 2;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

export interface ChallengeColumns {
  amount: string | null;
  date: string | null;
  product: string | null;
  coupon: string | null;
  challenge: string | null;
  utm: string | null;
  email: string | null;
}

/** Resolve every semantic column role for the Challenge sheet. */
export function detectChallengeColumns(columns: string[], rows: Row[]): ChallengeColumns {
  return {
    amount: detectAmountColumn(columns, rows),
    date: detectDateColumn(columns, rows),
    product: pickHeader(columns, [/^product$/i, /product/i, /offer/i, /package/i, /plan/i]),
    coupon: pickHeader(columns, [/^coupon$/i, /coupon/i, /promo/i, /discount/i, /code/i]),
    challenge: pickHeader(columns, [/^chall[ae]nge$/i, /chall[ae]nge/i, /cohort/i, /campaign/i]),
    utm: pickHeader(columns, [/utm.*medium/i, /utm.*source/i, /^utm$/i, /medium/i, /source/i, /channel/i]),
    email: pickHeader(columns, [/email/i]),
  };
}
