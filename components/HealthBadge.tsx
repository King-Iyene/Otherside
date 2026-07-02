export function InvalidBadge({ raw }: { raw?: string }) {
  return <span className="badge red">INVALID{raw ? `: ${raw}` : ""}</span>;
}

export function MissingBadge() {
  return <span className="badge muted">MISSING</span>;
}
