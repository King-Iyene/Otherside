export function uniqueSorted(values: (string | null | undefined)[]): string[] {
  const set = new Set<string>();
  for (const v of values) {
    if (v) set.add(v);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function matchesSearch(haystacks: (string | null | undefined)[], query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return haystacks.some((h) => (h || "").toLowerCase().includes(q));
}

export function sum(values: (number | null | undefined)[]): number {
  return values.reduce<number>((acc, v) => acc + (v ?? 0), 0);
}

/** Multi-select match: empty selection = match all; otherwise value must be one
 *  of the selected. Null/blank values only match when nothing is selected. */
export function selected(sel: string[], value: string | null | undefined): boolean {
  if (!sel || sel.length === 0) return true;
  return value != null && sel.includes(value);
}
