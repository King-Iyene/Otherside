import type { CashRow, ChallengeRow } from "./types";

function normalizeEmail(email: string | null | undefined): string {
  return (email || "").trim().toLowerCase();
}

function emailFromChallenge(row: ChallengeRow): string {
  for (const key of Object.keys(row)) {
    if (key.toLowerCase().includes("email")) {
      const v = row[key];
      if (typeof v === "string") return normalizeEmail(v);
    }
  }
  return "";
}

export interface ChallengeToRebornAnalysis {
  challengeEmails: number;
  challengeUniqueEmails: number;
  challengeBoughtReborn: number;
  conversionRate: number | null;
  matches: { email: string; challengeProduct: string | null; rebornProduct: string | null; rebornCashCollected: number | null }[];
}

/**
 * How many people who registered for a Challenge went on to buy Reborn?
 * Joins Challenge Sheet + Reborn Cash Tracker by normalized email.
 */
export function analyzeChallengeToReborn(challengeRows: ChallengeRow[], cashRows: CashRow[]): ChallengeToRebornAnalysis {
  const challengeEmails = new Map<string, ChallengeRow>();
  for (const r of challengeRows) {
    if (r.isTest) continue;
    const email = emailFromChallenge(r);
    if (!email) continue;
    if (!challengeEmails.has(email)) challengeEmails.set(email, r);
  }

  const cashByEmail = new Map<string, CashRow>();
  for (const r of cashRows) {
    if (r.isTest) continue;
    const email = normalizeEmail(r.email);
    if (!email) continue;
    if (!cashByEmail.has(email)) cashByEmail.set(email, r);
  }

  const matches: ChallengeToRebornAnalysis["matches"] = [];
  for (const [email, cRow] of challengeEmails) {
    const rebornRow = cashByEmail.get(email);
    if (rebornRow) {
      // Find product column in challenge row
      let challengeProduct: string | null = null;
      for (const key of Object.keys(cRow)) {
        if (key.toLowerCase() === "product") {
          const v = cRow[key];
          if (typeof v === "string") challengeProduct = v;
          break;
        }
      }
      matches.push({
        email,
        challengeProduct,
        rebornProduct: rebornRow.product,
        rebornCashCollected: rebornRow.cashCollected,
      });
    }
  }

  const totalChallenge = challengeEmails.size;
  const bought = matches.length;
  return {
    challengeEmails: challengeRows.length,
    challengeUniqueEmails: totalChallenge,
    challengeBoughtReborn: bought,
    conversionRate: totalChallenge > 0 ? bought / totalChallenge : null,
    matches: matches.sort((a, b) => (b.rebornCashCollected ?? 0) - (a.rebornCashCollected ?? 0)),
  };
}
