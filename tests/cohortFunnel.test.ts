import { describe, expect, it } from "vitest";
import { computeCohortFunnel, computeSubOfferBreakdown, COHORTS, stageToStageRate } from "../lib/cohortFunnel";
import type { ApplicationRow, AppointmentRow, CashRow, ChallengeRow } from "../lib/types";

const erupt1 = COHORTS.find((c) => c.id === "erupt1")!;

describe("computeCohortFunnel", () => {
  it("counts unique leads (deduped by email) at every stage", () => {
    const funnel = computeCohortFunnel(erupt1, {
      applications: [
        app("kelly@x.com"),
        app("kelly@x.com"), // duplicate — should count as 1
        app("aaron@x.com"),
      ],
      cash: [
        cashRow("kelly@x.com", "Erupt 1", 8000, 4000),
        cashRow("kelly@x.com", "Erupt 1", 97, 97), // Kelly's upgrade — still 1 person
      ],
      appointments: [
        appt("kelly@x.com", "Erupt 1", "Showed"),
      ],
      challenge: [
        chal("kelly@x.com", "Erupt 1"),
        chal("kelly@x.com", "Erupt 1"), // dup registration
        chal("aaron@x.com", "Erupt 1"),
      ],
    });

    // 2 unique registered emails
    expect(funnel.stages.find((s) => s.key === "registered")!.count).toBe(2);
    // both applied
    expect(funnel.stages.find((s) => s.key === "applied")!.count).toBe(2);
    // 1 unique enrolled (Kelly's 2 payments dedup to 1 person)
    expect(funnel.stages.find((s) => s.key === "enrolled")!.count).toBe(1);
    // But cash sums BOTH payments
    expect(funnel.totalCash).toBe(4097);
  });

  it("is case-insensitive when matching emails across sources", () => {
    const funnel = computeCohortFunnel(erupt1, {
      applications: [app("Foo@Example.com")],
      cash: [cashRow("foo@example.com", "Erupt 1", 1000, 1000)],
      appointments: [],
      challenge: [chal("FOO@example.com", "Erupt 1")],
    });
    // Applied stage joins by email against Registered
    expect(funnel.stages.find((s) => s.key === "applied")!.count).toBe(1);
    expect(funnel.stages.find((s) => s.key === "enrolled")!.count).toBe(1);
  });

  it("attributes rows to the cohort by launch-window fallback when tag is blank", () => {
    const funnel = computeCohortFunnel(erupt1, {
      applications: [],
      // Cash row has no cohort tag but is inside Erupt 1's window (2025-10-01 → 2026-01-31)
      cash: [
        { ...cashRow("noTag@x.com", null, 5000, 5000), enrollmentDate: "2025-12-15" },
      ],
      appointments: [],
      challenge: [],
    });
    expect(funnel.stages.find((s) => s.key === "enrolled")!.count).toBe(1);
  });

  it("does NOT falsely attribute rows outside the window", () => {
    const funnel = computeCohortFunnel(erupt1, {
      applications: [],
      cash: [{ ...cashRow("far@x.com", null, 5000, 5000), enrollmentDate: "2026-05-01" }], // Erupt 2 territory
      appointments: [],
      challenge: [],
    });
    expect(funnel.stages.find((s) => s.key === "enrolled")!.count).toBe(0);
  });

  it("excludes test rows unless includeTest is true", () => {
    const funnel = computeCohortFunnel(erupt1, {
      applications: [],
      cash: [{ ...cashRow("real@x.com", "Erupt 1", 1000, 1000) }, { ...cashRow("test@x.com", "Erupt 1", 999, 999), isTest: true }],
      appointments: [],
      challenge: [],
    });
    expect(funnel.stages.find((s) => s.key === "enrolled")!.count).toBe(1);

    const inclusive = computeCohortFunnel(erupt1, {
      applications: [],
      cash: [{ ...cashRow("real@x.com", "Erupt 1", 1000, 1000) }, { ...cashRow("test@x.com", "Erupt 1", 999, 999), isTest: true }],
      appointments: [],
      challenge: [],
    }, true);
    expect(inclusive.stages.find((s) => s.key === "enrolled")!.count).toBe(2);
  });
});

describe("computeSubOfferBreakdown", () => {
  it("groups enrolled buyers by their sub-offer, all still under one launch", () => {
    const items = computeSubOfferBreakdown(
      [
        cashRow("a@x.com", "Erupt 2", 8000, 8000),
        cashRow("b@x.com", "Erupt 2 > Retreat", 9000, 9000),
        cashRow("c@x.com", "Erupt 2 > Reborn Core/Scholarship", 500, 500),
        cashRow("d@x.com", "Erupt 2 > Retreat", 9000, 9000),
      ],
      COHORTS.find((c) => c.id === "erupt2")!
    );
    const byKey = new Map(items.map((i) => [i.key, i]));
    expect(byKey.get("Erupt 2 (standard)")?.value).toBe(1);
    expect(byKey.get("Retreat")?.value).toBe(2);
    expect(byKey.get("Retreat")?.cashCollected).toBe(18000);
    expect(byKey.get("Reborn Core/Scholarship")?.value).toBe(1);
  });

  it("returns nothing for a launch with no enrolled buyers", () => {
    const items = computeSubOfferBreakdown([cashRow("a@x.com", "Erupt 1", 8000, 8000)], COHORTS.find((c) => c.id === "erupt2")!);
    expect(items).toEqual([]);
  });
});

describe("stageToStageRate", () => {
  it("returns null when prev is 0", () => {
    expect(stageToStageRate(0, 5)).toBeNull();
  });
  it("computes fraction", () => {
    expect(stageToStageRate(100, 25)).toBe(0.25);
  });
});

// ────────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────────

function app(email: string): ApplicationRow {
  return {
    id: Math.random().toString(),
    isTest: false,
    health: [],
    firstName: "T",
    lastName: null,
    email,
    phone: null,
    applicationStatus: null,
    annualEarnings: null,
    dateCreated: "2025-11-01",
    purchased: false,
  };
}

function cashRow(email: string | null, cohort: string | null, revenue: number, cashCollected: number): CashRow {
  return {
    id: Math.random().toString(),
    isTest: false,
    health: [],
    name: "T",
    email,
    product: null,
    cohort,
    enrollmentDate: "2025-12-01",
    revenue,
    cashCollected,
    balance: null,
    couponCode: null,
    paymentMethod: null,
    nextPaymentDate: null,
    enrManager: "Oliver",
    note: null,
  };
}

function appt(email: string | null, cohort: string | null, status: string | null): AppointmentRow {
  return {
    id: Math.random().toString(),
    isTest: false,
    health: [],
    name: "T",
    email,
    phone: null,
    appointmentTime: "2025-11-15",
    created: null,
    status,
    appointmentType: null,
    cohort,
    calendar: null,
    enrManager: "Oliver",
    ghlAppointmentId: null,
    notes: null,
  };
}

function chal(email: string, product: string): ChallengeRow {
  return {
    id: Math.random().toString(),
    isTest: false,
    health: [],
    Email: email,
    Product: product,
    Name: "T",
  };
}
