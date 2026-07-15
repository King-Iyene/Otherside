import type { TabKey } from "@/lib/tabs";

/**
 * Role-relevant views over the single data layer (mirrors the Notion Testimonial
 * Tracker: one dataset, many per-team views — "too much info is no info"). Each
 * team logs in with its own password (see ROLE_ACCESS env) and sees only its tabs.
 */
export type Role = "ops" | "closer" | "content" | "leadership" | "transformation";

export interface RoleDef {
  key: Role;
  label: string;
  /** One line describing what this team focuses on. */
  blurb: string;
  /** Tabs this team sees, in order. */
  tabs: TabKey[];
}

// Keep tab keys in sync with lib/tabs.ts.
const FULL: TabKey[] = [
  "overview",
  "insights",
  "cash",
  "adjustments",
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
    key: "ops",
    label: "Ops Team",
    blurb: "Runs operations & finance — everything across the business.",
    tabs: FULL,
  },
  {
    key: "leadership",
    label: "Leadership",
    blurb: "The high-level picture: revenue, performance and adoption.",
    tabs: ["overview", "insights", "cash", "adjustments", "sales", "challenge", "reconciliation", "guide"],
  },
  {
    key: "closer",
    label: "Closer",
    blurb: "Your funnel and close rate. (Commissions unlock with sign-in later.)",
    tabs: ["overview", "sales", "appointments", "guide"],
  },
  {
    key: "content",
    label: "Content Team",
    blurb: "Marketing & content: challenge adoption, applications, appointments.",
    tabs: ["overview", "challenge", "applications", "appointments", "guide"],
  },
  {
    key: "transformation",
    label: "Transformation Team",
    blurb: "Delivery & client journey: appointments, applications, challenge.",
    tabs: ["overview", "appointments", "applications", "challenge", "guide"],
  },
];

// When no gate is configured the app is open — default to the broadest team.
export const DEFAULT_ROLE: Role = "ops";

export function roleDef(role: Role): RoleDef {
  return ROLES.find((r) => r.key === role) ?? ROLES[0];
}

/** Tabs visible for a role, filtered to keys that actually exist. */
export function tabsForRole(role: Role, allKeys: readonly TabKey[]): TabKey[] {
  const def = roleDef(role);
  return def.tabs.filter((t) => allKeys.includes(t));
}
