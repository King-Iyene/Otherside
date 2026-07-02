export interface PreviousRange {
  from: Date;
  to: Date;
}

export type CompareMode = "prev" | "yoy";

/** Equivalent immediately-preceding period of the same length as [from, to]. Null if unbounded ("all"). */
export function previousPeriod(from: Date | null, to: Date | null): PreviousRange | null {
  if (!from || !to) return null;
  const lengthMs = to.getTime() - from.getTime();
  if (lengthMs <= 0) return null;
  return {
    from: new Date(from.getTime() - lengthMs - 1),
    to: new Date(from.getTime() - 1),
  };
}

/** Same date range shifted back exactly 1 year — for year-over-year comparisons. */
export function yearAgoPeriod(from: Date | null, to: Date | null): PreviousRange | null {
  if (!from || !to) return null;
  const shift = (d: Date) => {
    const n = new Date(d);
    n.setUTCFullYear(n.getUTCFullYear() - 1);
    return n;
  };
  return { from: shift(from), to: shift(to) };
}

export function comparisonRange(mode: CompareMode, from: Date | null, to: Date | null): PreviousRange | null {
  return mode === "yoy" ? yearAgoPeriod(from, to) : previousPeriod(from, to);
}

export function comparisonLabel(mode: CompareMode): string {
  return mode === "yoy" ? "vs year ago" : "vs prev";
}

export interface Delta {
  pct: number | null;
  current: number;
  previous: number;
}

export function computeDelta(current: number, previous: number): Delta {
  if (previous === 0) {
    return { pct: current === 0 ? 0 : null, current, previous };
  }
  return { pct: (current - previous) / Math.abs(previous), current, previous };
}
