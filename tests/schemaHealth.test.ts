import { describe, it, expect } from "vitest";
import { detectColumnHealth } from "../lib/schemaHealth";
import type { DashboardPayload } from "../lib/types";

function payload(cashRows: any[]): DashboardPayload {
  const empty = { error: null, fetchedAt: 0 };
  return {
    cash: { rows: cashRows, ...empty },
    appointments: { rows: [], ...empty },
    applications: { rows: [], ...empty },
    salesActivity: { rows: [], ...empty },
    challenge: { rows: [], columns: [], ...empty },
    generatedAt: 0,
  } as unknown as DashboardPayload;
}

const cashRow = (over: Partial<any> = {}) => ({
  id: Math.random().toString(),
  isTest: false,
  health: [],
  name: "A",
  email: "a@x.com",
  product: null,
  cohort: null,
  enrollmentDate: "2026-01-01",
  createdDate: null,
  revenue: 1000,
  cashCollected: 1000,
  balance: 0,
  couponCode: null,
  paymentMethod: null,
  nextPaymentDate: null,
  enrManager: null,
  note: null,
  ...over,
});

describe("detectColumnHealth", () => {
  it("flags a column that is empty on every row", () => {
    const rows = [cashRow(), cashRow(), cashRow()].map((r) => ({ ...r, enrollmentDate: null }));
    const warnings = detectColumnHealth(payload(rows));
    expect(warnings.some((w) => w.column === "Payment Date")).toBe(true);
  });

  it("does NOT flag when at least one row has the value", () => {
    const rows = [cashRow({ enrollmentDate: null }), cashRow({ enrollmentDate: null }), cashRow({ enrollmentDate: "2026-02-02" })];
    const warnings = detectColumnHealth(payload(rows));
    expect(warnings.some((w) => w.column === "Payment Date")).toBe(false);
  });

  it("does NOT flag an all-zero money column (0 is real, not missing)", () => {
    const rows = [cashRow({ cashCollected: 0 }), cashRow({ cashCollected: 0 }), cashRow({ cashCollected: 0 })];
    const warnings = detectColumnHealth(payload(rows));
    expect(warnings.some((w) => w.column === "Cash Collected")).toBe(false);
  });

  it("does NOT flag below the minimum row threshold", () => {
    const rows = [cashRow({ enrollmentDate: null }), cashRow({ enrollmentDate: null })];
    const warnings = detectColumnHealth(payload(rows));
    expect(warnings.length).toBe(0);
  });
});
