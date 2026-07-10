import type { TabKey } from "@/lib/tabs";

/**
 * Role-relevant "lens" over the single data layer (mirrors the Notion Testimonial
 * Tracker: one dataset, many per-role views). This is PRESENTATION ONLY — it curates
 * which existing tabs a role sees so each person gets their slice ("too much info is
 * no info"). It is NOT access control; real per-user auth + the gated commissions
 * view come in a later phase. No sensitive (commission) data is exposed here.
 */
export type Role = "oliver" | "ops" | "va" | "closer" | "em" | "setter";

export interface RoleDef {
  key: Role;
  label: string;
  /** One line describing what this role focuses on. */
  blurb: string;
  /** Tabs this role sees, in order. `oliver` = everything. */
  tabs: TabKey[];
}

// Keep tab keys in sync with components/Tabs.tsx TAB_KEYS.
const FULL: TabKey[] = [
  "overview",
  "insights",
  "cash",
  "payments",
  "appointments",
  "applications",
  "sales",
  "challenge",
  "reconciliation",
  "guide",
];

export const ROLES: RoleDef[] = [
  {
    key: "oliver",
    label: "Oliver — Full",
    blurb: "Everything across marketing, sales, delivery and finance.",
    tabs: FULL,
  },
  {
    key: "ops",
    label: "Ops",
    blurb: "Operating: payment plans due, deposits, reconciliation, data health.",
    tabs: ["overview", "cash", "payments", "appointments", "reconciliation", "guide"],
  },
  {
    key: "va",
    label: "VA",
    blurb: "Challenge adoption, appointments and applications support.",
    tabs: ["overview", "appointments", "applications", "challenge", "guide"],
  },
  {
    key: "closer",
    label: "Closer",
    blurb: "Your funnel and close rate. (Commissions unlock with sign-in later.)",
    tabs: ["overview", "sales", "appointments", "guide"],
  },
  {
    key: "em",
    label: "EM (Adeyemi)",
    blurb: "Enrollment pipeline: applications → appointments → enrollments.",
    tabs: ["overview", "cash", "applications", "appointments", "sales", "guide"],
  },
  {
    key: "setter",
    label: "Setter",
    blurb: "Setting activity: booked calls and show rate on your sets.",
    tabs: ["overview", "appointments", "sales", "guide"],
  },
];

export const DEFAULT_ROLE: Role = "oliver";

export function roleDef(role: Role): RoleDef {
  return ROLES.find((r) => r.key === role) ?? ROLES[0];
}

/** Tabs visible for a role, filtered to keys that actually exist. */
export function tabsForRole(role: Role, allKeys: readonly TabKey[]): TabKey[] {
  const def = roleDef(role);
  return def.tabs.filter((t) => allKeys.includes(t));
}
