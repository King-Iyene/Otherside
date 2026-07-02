// Client-safe helpers: formatting, date ranges, time bucketing.

export function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function fmtMoneyExact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

export function fmtInt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US");
}

export function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

// ---------- Date range presets ----------
export type RangePreset = "all" | "7d" | "30d" | "90d" | "mtd" | "ytd" | "custom";

export const RANGE_OPTIONS: { key: RangePreset; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "mtd", label: "This month" },
  { key: "ytd", label: "This year" },
  { key: "custom", label: "Custom" },
];

export function rangeBounds(preset: RangePreset, customFrom?: string, customTo?: string): [number, number] {
  const now = new Date();
  const end = now.getTime() + 366 * 24 * 3600 * 1000; // include future-dated rows by default
  switch (preset) {
    case "all": return [-Infinity, Infinity];
    case "7d": return [now.getTime() - 7 * 864e5, end];
    case "30d": return [now.getTime() - 30 * 864e5, end];
    case "90d": return [now.getTime() - 90 * 864e5, end];
    case "mtd": return [new Date(now.getFullYear(), now.getMonth(), 1).getTime(), end];
    case "ytd": return [new Date(now.getFullYear(), 0, 1).getTime(), end];
    case "custom": {
      const from = customFrom ? new Date(customFrom + "T00:00:00").getTime() : -Infinity;
      const to = customTo ? new Date(customTo + "T23:59:59").getTime() : Infinity;
      return [from, to];
    }
  }
}

export function inRange(iso: string | null, bounds: [number, number]): boolean {
  if (bounds[0] === -Infinity && bounds[1] === Infinity) return true;
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return false;
  return t >= bounds[0] && t <= bounds[1];
}

// ---------- Time bucketing for charts ----------
export type Granularity = "day" | "week" | "month";

export function bucketKey(iso: string, g: Granularity): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  if (g === "day") return d.toISOString().slice(0, 10);
  if (g === "month") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  // week: Monday of the ISO week
  const day = (d.getDay() + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - day);
  return monday.toISOString().slice(0, 10);
}

export function bucketLabel(key: string, g: Granularity): string {
  if (g === "month") {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }
  const d = new Date(key + "T00:00:00");
  if (isNaN(d.getTime())) return key;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Sum values into sorted time buckets. Rows without a valid date are skipped
 *  (they are flagged separately in Data Health, never hidden silently). */
export function timeSeries<T>(
  rows: T[], getDate: (r: T) => string | null, g: Granularity,
  metrics: { key: string; get: (r: T) => number }[],
): Record<string, any>[] {
  const map = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const iso = getDate(r);
    if (!iso) continue;
    const k = bucketKey(iso, g);
    if (!k) continue;
    if (!map.has(k)) map.set(k, {});
    const bucket = map.get(k)!;
    for (const m of metrics) bucket[m.key] = (bucket[m.key] ?? 0) + m.get(r);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, vals]) => ({ bucket: k, label: bucketLabel(k, g), ...vals }));
}

export function groupSum<T>(
  rows: T[], getKey: (r: T) => string, getVal: (r: T) => number,
): { name: string; value: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = getKey(r) || "(blank)";
    map.set(k, (map.get(k) ?? 0) + getVal(r));
  }
  return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

export function uniqueValues<T>(rows: T[], get: (r: T) => string): string[] {
  const set = new Set<string>();
  for (const r of rows) { const v = get(r); if (v) set.add(v); }
  return [...set].sort();
}
