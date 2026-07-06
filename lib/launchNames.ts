/**
 * Shared launch-name recognition — used by both dataHealth.ts (row-level
 * validation) and cohortFunnel.ts (attribution + sub-offer breakdown), so the
 * two never disagree about what text counts as "Erupt 2" etc.
 *
 * Matching is CONTAINS, not exact-equals: a value only needs to contain one
 * of these markers anywhere in the text. Compound values like "Erupt 2 >
 * Retreat" or "Penetrate > Reborn Aug 2025" are legitimate sub-offers tied to
 * a standard launch, not typos — the launch name is what totals roll up to,
 * the remainder (if any) is the sub-offer label.
 */
export const LAUNCH_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "Erupt 1", re: /erupt\s*1(?!\d)|reborn\s*dec\s*2025|dec\s*2025/i },
  { name: "Erupt 2", re: /erupt\s*2(?!\d)|reborn\s*apr\s*2026|apr\s*2026/i },
  { name: "Erupt 3", re: /erupt\s*3(?!\d)|reborn\s*aug\s*2026|aug\s*2026/i },
  { name: "Penetrate", re: /penetrate/i },
];

export function extractLaunch(v: string): string | null {
  for (const p of LAUNCH_PATTERNS) if (p.re.test(v)) return p.name;
  return null;
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
  // No ">" delimiter — check if there's meaningful text beyond the launch
  // marker itself (covers "Erupt 2 Retreat" without a delimiter).
  const pattern = LAUNCH_PATTERNS.find((p) => p.name === launch)!.re;
  const stripped = v.replace(pattern, "").trim();
  return stripped.length > 0 ? stripped : null;
}
