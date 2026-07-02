/**
 * Parses a money-ish value into a number, or null when it cannot be cleanly parsed.
 * Never returns 0 for garbage input like "Merged" or "$5k" — those are NULL, not zero.
 */
export function parseMoney(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (trimmed === "") return null;

  const stripped = trimmed.replace(/[$€£₦,]/g, "").replace(/\s+/g, "");
  if (stripped === "") return null;

  // Reject anything with leftover letters/symbols (e.g. "5k", "Merged", "TBD").
  if (!/^-?\d+(\.\d+)?$/.test(stripped)) return null;

  const num = Number(stripped);
  return Number.isFinite(num) ? num : null;
}

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("en-US");
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}
