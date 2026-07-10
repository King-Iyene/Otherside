import { describe, it, expect } from "vitest";
import { ROLES, roleDef, tabsForRole, DEFAULT_ROLE } from "../lib/roles";
import { TAB_KEYS } from "../lib/tabs";

describe("roles", () => {
  it("every role's tabs are valid tab keys", () => {
    for (const r of ROLES) {
      for (const t of r.tabs) {
        expect(TAB_KEYS).toContain(t);
      }
    }
  });

  it("oliver (default, full) sees every tab", () => {
    expect(DEFAULT_ROLE).toBe("oliver");
    expect(tabsForRole("oliver", TAB_KEYS).sort()).toEqual([...TAB_KEYS].sort());
  });

  it("a narrow role sees a subset and never the whole set", () => {
    const closer = tabsForRole("closer", TAB_KEYS);
    expect(closer).toContain("sales");
    expect(closer).not.toContain("reconciliation");
    expect(closer.length).toBeLessThan(TAB_KEYS.length);
  });

  it("tabsForRole filters out tab keys that don't exist", () => {
    const filtered = tabsForRole("ops", ["overview", "cash"] as any);
    expect(filtered).toEqual(["overview", "cash"]);
  });

  it("roleDef falls back to the first role for an unknown key", () => {
    expect(roleDef("nope" as any)).toBe(ROLES[0]);
  });
});
