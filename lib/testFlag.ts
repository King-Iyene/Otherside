export function isTestRecord(name: string | null | undefined, email: string | null | undefined): boolean {
  const n = (name || "").trim().toLowerCase();
  const e = (email || "").trim().toLowerCase();
  return e === "systems@joinotherside.com" || n.startsWith("king test");
}
