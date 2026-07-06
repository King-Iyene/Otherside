import { describe, expect, it } from "vitest";
import { parsePlanTotal, detectPaymentAnomalies } from "../lib/paymentAnomalies";
import type { CashRow } from "../lib/types";

function row(p: Partial<CashRow>): CashRow {
  return {
    id: Math.random().toString(),
    isTest: false,
    health: [],
    name: "Javid Khan",
    email: "iqbal_16@msn.com",
    product: "Payment Plan - $6,000 today + $3,000 per month for 2 months. Total $12,000",
    cohort: null,
    enrollmentDate: null,
    revenue: null,
    cashCollected: null,
    balance: null,
    couponCode: null,
    paymentMethod: "stripe",
    nextPaymentDate: null,
    enrManager: null,
    note: null,
    ...p,
  };
}

describe("parsePlanTotal", () => {
  it("reads an explicit Total", () => {
    expect(parsePlanTotal("Payment Plan - $6,000 today + $3,000 per month for 2 months. Total $12,000")).toBe(12000);
  });
  it("computes today + monthly*months when no explicit total", () => {
    expect(parsePlanTotal("$6,000 today + $3,000 per month for 2 months")).toBe(12000);
  });
  it("reads a single price", () => {
    expect(parsePlanTotal("Reborn @ $10,000")).toBe(10000);
    expect(parsePlanTotal("REBORN @ $10,000")).toBe(10000);
  });
  it("returns null when there's no money", () => {
    expect(parsePlanTotal("Reborn")).toBeNull();
    expect(parsePlanTotal(null)).toBeNull();
  });
});

describe("detectPaymentAnomalies — the real Javid case", () => {
  const javid = [
    row({ enrollmentDate: "2026-06-27", cohort: "Erupt 3 > Reborn Aug 2026", revenue: 3000, cashCollected: 3000, balance: 0 }),
    row({ enrollmentDate: "2026-06-27", cohort: "Erupt 3 > Reborn Aug 2026", revenue: 3000, cashCollected: 3000, balance: 0 }),
    row({ enrollmentDate: "2026-04-27", cohort: "Erupt 2 > Reborn Apr 2026", revenue: 11500, cashCollected: 11500, balance: 0 }),
  ];

  it("flags plan total mismatch (17,500 recorded vs 12,000 plan)", () => {
    const a = detectPaymentAnomalies(javid, { today: new Date("2026-08-01") });
    expect(a.some((x) => x.kind === "plan_total_mismatch")).toBe(true);
  });

  it("flags cohort split and names the true (first-payment) cohort", () => {
    const a = detectPaymentAnomalies(javid, { today: new Date("2026-08-01") });
    const split = a.find((x) => x.kind === "cohort_split");
    expect(split).toBeTruthy();
    expect(split!.detail).toContain("Erupt 2");
  });

  it("flags the identical duplicate June row", () => {
    const a = detectPaymentAnomalies(javid, { today: new Date("2026-08-01") });
    expect(a.some((x) => x.kind === "duplicate_row")).toBe(true);
  });
});

describe("detectPaymentAnomalies — overdue payment", () => {
  it("flags a next-payment date that has passed while a balance remains", () => {
    const rows = [
      row({
        name: "Late Payer",
        email: "late@x.com",
        enrollmentDate: "2026-04-27",
        cohort: "Erupt 2 > Reborn Apr 2026",
        revenue: 12000,
        cashCollected: 6000,
        balance: 6000,
        nextPaymentDate: "2026-05-27",
        product: "Reborn @ $12,000",
      }),
    ];
    const a = detectPaymentAnomalies(rows, { today: new Date("2026-07-01") });
    expect(a.some((x) => x.kind === "overdue_payment")).toBe(true);
  });

  it("does NOT flag overdue when the balance is already cleared", () => {
    const rows = [
      row({
        name: "Paid Up",
        email: "paid@x.com",
        enrollmentDate: "2026-04-27",
        revenue: 12000,
        cashCollected: 12000,
        balance: 0,
        nextPaymentDate: "2026-05-27",
        product: "Reborn @ $12,000",
      }),
    ];
    const a = detectPaymentAnomalies(rows, { today: new Date("2026-07-01") });
    expect(a.some((x) => x.kind === "overdue_payment")).toBe(false);
  });

  it("a clean single-payment buyer produces no anomalies", () => {
    const rows = [
      row({
        name: "Clean",
        email: "clean@x.com",
        enrollmentDate: "2026-04-27",
        cohort: "Erupt 2 > Reborn Apr 2026",
        revenue: 10000,
        cashCollected: 10000,
        balance: 0,
        product: "Reborn @ $10,000",
      }),
    ];
    expect(detectPaymentAnomalies(rows, { today: new Date("2026-07-01") })).toEqual([]);
  });
});
