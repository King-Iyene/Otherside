export type RangePreset = "all" | "7d" | "30d" | "90d" | "mtd" | "ytd" | "custom";
export type BucketGrain = "day" | "week" | "month";

const DAY_MS = 24 * 60 * 60 * 1000;

export function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseDateOnly(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** Monday of the ISO week containing the given date, as YYYY-MM-DD (UTC). */
export function isoWeekMonday(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return toDateOnly(d);
}

export function bucketKey(date: Date, grain: BucketGrain): string {
  if (grain === "day") return toDateOnly(date);
  if (grain === "week") return isoWeekMonday(date);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function resolveRange(
  preset: RangePreset,
  customFrom?: string | null,
  customTo?: string | null
): { from: Date | null; to: Date | null } {
  const now = new Date();
  const todayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

  switch (preset) {
    case "all":
      return { from: null, to: null };
    case "7d":
      return { from: new Date(todayEnd.getTime() - 7 * DAY_MS), to: todayEnd };
    case "30d":
      return { from: new Date(todayEnd.getTime() - 30 * DAY_MS), to: todayEnd };
    case "90d":
      return { from: new Date(todayEnd.getTime() - 90 * DAY_MS), to: todayEnd };
    case "mtd":
      return { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), to: todayEnd };
    case "ytd":
      return { from: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)), to: todayEnd };
    case "custom": {
      const from = customFrom ? parseDateOnly(customFrom) : null;
      const to = customTo ? parseDateOnly(customTo) : null;
      return { from, to };
    }
    default:
      return { from: null, to: null };
  }
}

export function inRange(dateStr: string | null, from: Date | null, to: Date | null): boolean {
  if (!from && !to) return true;
  if (!dateStr) return false;
  const d = parseDateOnly(dateStr);
  if (!d) return false;
  if (from && d.getTime() < from.getTime()) return false;
  if (to && d.getTime() > to.getTime()) return false;
  return true;
}
