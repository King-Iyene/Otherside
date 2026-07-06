import { describe, expect, it } from "vitest";
import {
  classifyCohort,
  subOfferOf,
  cashRowHealthChecks,
  appointmentRowHealthChecks,
  flagDuplicateCashEmails,
  reconcileCrossSourceCohortFlags,
} from "../lib/dataHealth";
import type { CashRow, ChallengeRow } from "../lib/types";

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
    // "penetrat" prefix earns a "Penetrate" suggestion via the fuzzy pass
    if (r3.status === "inconsistent") expect(r3.suggestion).toBe("Penetrate");
  });

  it("accepts compound cohort tags as belonging to the launch they name", () => {
    // Compound values like "Erupt 2 > Retreat" or "Erupt 3 > Bonus" are real
    // sub-offers tied to a standard launch, not typos — recognize the launch
    // instead of flagging the whole value as broken. Mistagging (right
    // keyword, wrong launch) is caught separately by cohort_window_mismatch,
    // which compares the resolved launch against the row's own enrollment
    // date (Javid's case: tagged Erupt 3, was really enrolled in Erupt 2).
    const r1 = classifyCohort("Erupt 3 > Reborn Aug 2026");
    expect(r1.status).toBe("canonical");
    if (r1.status === "canonical") expect(r1.name).toBe("Erupt 3");
    const r2 = classifyCohort("Penetrate > Reborn Aug 2025");
    expect(r2.status).toBe("canonical");
    if (r2.status === "canonical") expect(r2.name).toBe("Penetrate");
  });

  it("suggests the right cohort when Erupt N appears with a co-occurring year", () => {
    // The digit next to "erupt" is authoritative — not the digit inside a year.
    // "Erupt 3 aug 2026" is Erupt 3, not Erupt 2 (which would be picked if we
    // greedily matched the "2" in "2026").
    const r = classifyCohort("erupt_3_something_2026");
    if (r.status === "inconsistent") {
      expect(r.suggestion).toBe("Erupt 3");
    }
  });
});

describe("subOfferOf", () => {
  it("extracts the sub-offer label after a '>' delimiter", () => {
    expect(subOfferOf("Erupt 2 > Retreat")).toBe("Retreat");
    expect(subOfferOf("Erupt 2 > Reborn Core/Scholarship")).toBe("Reborn Core/Scholarship");
    expect(subOfferOf("Erupt 3 > Bonus")).toBe("Bonus");
  });

  it("returns null for a plain standard launch name", () => {
    expect(subOfferOf("Erupt 2")).toBeNull();
    expect(subOfferOf("Penetrate")).toBeNull();
    expect(subOfferOf("Reborn Aug 2026")).toBeNull();
  });

  it("returns null when there's no recognizable launch at all", () => {
    expect(subOfferOf("Erupt_1")).toBeNull();
    expect(subOfferOf(null)).toBeNull();
  });
});

describe("cashRowHealthChecks", () => {
  const base = {
    cohort: "Erupt 1",
    enrManager: "Oliver",
    name: "Jane Buyer",
    email: "jane@example.com",
    revenue: 8000,
    cashCollected: 4000,
    balance: 4000,
    nextPaymentDate: "2026-01-15",
  };

  it("clean row has no flags", () => {
    expect(cashRowHealthChecks(base)).toEqual([]);
  });

  it("flags a cohort-tagged row with no name and no email as an empty stub", () => {
    const flags = cashRowHealthChecks({ ...base, name: "", email: null });
    expect(flags.some((f) => f.kind === "empty_enrollment_row")).toBe(true);
  });

  it("does NOT flag empty stub when there IS a name but no email", () => {
    const flags = cashRowHealthChecks({ ...base, name: "Jane Buyer", email: null });
    expect(flags.some((f) => f.kind === "empty_enrollment_row")).toBe(false);
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

  it("flags cohort tag ≠ enrollment window (Javid case)", () => {
    // Tagged Erupt 3, enrolled 2026-03-15 which is inside Erupt 2's window
    const flags = cashRowHealthChecks({
      ...base,
      cohort: "Erupt 3",
      enrollmentDate: "2026-03-15",
    });
    expect(flags.some((f) => f.kind === "cohort_window_mismatch")).toBe(true);
  });

  it("does NOT flag window mismatch when tag and date agree", () => {
    // Tagged Erupt 2, enrolled 2026-03-15 (Erupt 2 window Feb–May 2026)
    const flags = cashRowHealthChecks({
      ...base,
      cohort: "Erupt 2",
      enrollmentDate: "2026-03-15",
    });
    expect(flags.some((f) => f.kind === "cohort_window_mismatch")).toBe(false);
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

describe("reconcileCrossSourceCohortFlags", () => {
  it("drops inconsistent_cohort when the Challenge Sheet agrees with Notion's text", () => {
    const cash = [makeCashRow("solo@example.com")];
    cash[0].health = [{ field: "Cohort", kind: "inconsistent_cohort", raw: "Penetrate > Reborn Aug 2025" }];
    const challenge: ChallengeRow[] = [
      { id: "row-0", isTest: false, health: [], Email: "solo@example.com", Product: "Penetrate > Reborn Aug 2025" },
    ];
    reconcileCrossSourceCohortFlags(cash, challenge);
    expect(cash[0].health.some((f) => f.kind === "inconsistent_cohort")).toBe(false);
  });

  it("keeps inconsistent_cohort when the Challenge Sheet disagrees", () => {
    const cash = [makeCashRow("solo@example.com")];
    cash[0].health = [{ field: "Cohort", kind: "inconsistent_cohort", raw: "Penetrate > Reborn Aug 2025" }];
    const challenge: ChallengeRow[] = [
      { id: "row-0", isTest: false, health: [], Email: "solo@example.com", Product: "Erupt 1" },
    ];
    reconcileCrossSourceCohortFlags(cash, challenge);
    expect(cash[0].health.some((f) => f.kind === "inconsistent_cohort")).toBe(true);
  });

  it("keeps inconsistent_cohort when there is no matching Challenge Sheet row", () => {
    const cash = [makeCashRow("nomatch@example.com")];
    cash[0].health = [{ field: "Cohort", kind: "inconsistent_cohort", raw: "Penetrate > Reborn Aug 2025" }];
    const challenge: ChallengeRow[] = [
      { id: "row-0", isTest: false, health: [], Email: "someone-else@example.com", Product: "Penetrate" },
    ];
    reconcileCrossSourceCohortFlags(cash, challenge);
    expect(cash[0].health.some((f) => f.kind === "inconsistent_cohort")).toBe(true);
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
