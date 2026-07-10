/** Canonical tab keys, in a plain (non-JSX) module so lib + tests can import them
 *  without pulling in the React component. `components/Tabs.tsx` re-exports these. */
export const TAB_KEYS = [
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
] as const;

export type TabKey = (typeof TAB_KEYS)[number];
