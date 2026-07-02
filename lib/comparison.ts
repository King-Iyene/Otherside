export interface PreviousRange {
  from: Date;
  to: Date;
}

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
