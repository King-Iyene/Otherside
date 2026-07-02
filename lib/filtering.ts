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
