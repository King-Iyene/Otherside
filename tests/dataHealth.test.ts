import { describe, expect, it } from "vitest";
import {
  classifyCohort,
  cashRowHealthChecks,
  appointmentRowHealthChecks,
  flagDuplicateCashEmails,
} from "../lib/dataHealth";
import type { CashRow } from "../lib/types";

describe("classifyCohort", () => {
  it("accepts canonical names", () => {
    expect(classifyCohort("Erupt 1").status).toBe("canonical");
    expect(classifyCohort("Penetrate").status).toBe("canonical");
    expect(classifyCohort("Reborn Dec 2025").status).toBe("canonical");
  });

  it("flags empty as empty", () => {
    expect(classifyCohort("").status).toBe("empty");
    expect(classifyCohort(null).status).toBe("empty");
    expect(classifyCohort("   ").status).toBe("empty");
  });

  it("suggests fixes for near-misses", () => {
    const r1 = classifyCohort("Erupt_1");
    expect(r1.status).toBe("inconsistent");
    if (r1.status === "inconsistent") expect(r1.suggestion).toBe("Erupt 1");

    const r2 = classifyCohort("ERUPT 2");
    expect(r2.status).toBe("canonical");

    const r3 = classifyCohort("penetrating");
    expect(r3.status).toBe("inconsistent");
  });
});

describe("cashRowHealthChecks", () => {
  const base = {
    cohort: "Erupt 1",
    enrManager: "Oliver",
    revenue: 8000,
    cashCollected: 4000,
    balance: 4000,
    nextPaymentDate: "2026-01-15",
  };

  it("clean row has no flags", () => {
    expect(cashRowHealthChecks(base)).toEqual([]);
  });

  it("catches cash > revenue as impossible", () => {
    const flags = cashRowHealthChecks({ ...base, cashCollected: 10000, revenue: 8000 });
    expect(flags.some((f) => f.kind === "cash_gt_revenue")).toBe(true);
  });

  it("flags outstanding balance with no next payment", () => {
    const flags = cashRowHealthChecks({ ...base, nextPaymentDate: null });
    expect(flags.some((f) => f.kind === "outstanding_no_next_payment")).toBe(true);
  });

  it("does NOT flag zero revenue when no cash was collected", () => {
    const flags = cashRowHealthChecks({ ...base, revenue: null, cashCollected: null, balance: null });
    expect(flags.some((f) => f.kind === "zero_revenue_enrollment")).toBe(false);
  });

  it("flags zero revenue when cash was actually collected", () => {
    const flags = cashRowHealthChecks({ ...base, revenue: null, cashCollected: 500, balance: null, nextPaymentDate: null });
    expect(flags.some((f) => f.kind === "zero_revenue_enrollment")).toBe(true);
  });

  it("catches inconsistent cohort name", () => {
    const flags = cashRowHealthChecks({ ...base, cohort: "Erupt_1" });
    expect(flags.some((f) => f.kind === "inconsistent_cohort")).toBe(true);
  });

  it("catches missing closer", () => {
    const flags = cashRowHealthChecks({ ...base, enrManager: null });
    expect(flags.some((f) => f.kind === "missing_closer")).toBe(true);
  });
});

describe("appointmentRowHealthChecks", () => {
  it("flags call whose time has passed with blank status", () => {
    const flags = appointmentRowHealthChecks({
      cohort: "Erupt 1",
      enrManager: "Oliver",
      status: null,
      appointmentTime: "2020-01-01T10:00:00Z", // way in the past
    });
    expect(flags.some((f) => f.kind === "showed_no_status")).toBe(true);
  });

  it("does not flag future calls with blank status", () => {
    const flags = appointmentRowHealthChecks({
      cohort: "Erupt 1",
      enrManager: "Oliver",
      status: null,
      appointmentTime: "2099-01-01T10:00:00Z",
    });
    expect(flags.some((f) => f.kind === "showed_no_status")).toBe(false);
  });
});

describe("flagDuplicateCashEmails", () => {
  it("flags emails that appear on multiple Cash rows", () => {
    const rows = [
      makeCashRow("kelly@example.com"),
      makeCashRow("kelly@example.com"),
      makeCashRow("solo@example.com"),
    ];
    flagDuplicateCashEmails(rows);
    expect(rows[0].health.some((f) => f.kind === "duplicate_email_in_cash")).toBe(true);
    expect(rows[1].health.some((f) => f.kind === "duplicate_email_in_cash")).toBe(true);
    expect(rows[2].health.some((f) => f.kind === "duplicate_email_in_cash")).toBe(false);
  });

  it("is case-insensitive on email", () => {
    const rows = [
      makeCashRow("Foo@Example.com"),
      makeCashRow("foo@example.com"),
    ];
    flagDuplicateCashEmails(rows);
    expect(rows[0].health.some((f) => f.kind === "duplicate_email_in_cash")).toBe(true);
    expect(rows[1].health.some((f) => f.kind === "duplicate_email_in_cash")).toBe(true);
  });

  it("does not flag when email is blank", () => {
    const rows = [makeCashRow(null), makeCashRow(null)];
    flagDuplicateCashEmails(rows);
    expect(rows[0].health.some((f) => f.kind === "duplicate_email_in_cash")).toBe(false);
  });
});

function makeCashRow(email: string | null): CashRow {
  return {
    id: Math.random().toString(),
    isTest: false,
    health: [],
    name: "Test",
    email,
    product: null,
    cohort: null,
    enrollmentDate: null,
    revenue: null,
    cashCollected: null,
    balance: null,
    couponCode: null,
    paymentMethod: null,
    nextPaymentDate: null,
    enrManager: null,
    note: null,
  };
}
