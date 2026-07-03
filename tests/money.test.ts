import { describe, expect, it } from "vitest";
import { parseMoney, formatMoney, formatPercent } from "../lib/money";

describe("parseMoney", () => {
  it("accepts plain numbers", () => {
    expect(parseMoney(1500)).toBe(1500);
    expect(parseMoney(0)).toBe(0);
    expect(parseMoney(1234.5)).toBe(1234.5);
  });

  it("strips currency symbols and separators", () => {
    expect(parseMoney("$1,500")).toBe(1500);
    expect(parseMoney(" $1,234.56 ")).toBe(1234.56);
    expect(parseMoney("€ 1000")).toBe(1000);
  });

  it("rejects garbage as null (never returns 0)", () => {
    expect(parseMoney("TBD")).toBeNull();
    expect(parseMoney("paid in full")).toBeNull();
    expect(parseMoney("5k")).toBeNull();
    expect(parseMoney("")).toBeNull();
    expect(parseMoney(null)).toBeNull();
    expect(parseMoney(undefined)).toBeNull();
    expect(parseMoney(NaN)).toBeNull();
  });

  it("handles negative numbers", () => {
    expect(parseMoney("-500")).toBe(-500);
    expect(parseMoney("-$500")).toBe(-500);
  });
});

describe("formatMoney", () => {
  it("formats as USD with no decimals", () => {
    expect(formatMoney(1500)).toBe("$1,500");
    expect(formatMoney(0)).toBe("$0");
  });
  it("returns em-dash for null", () => {
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney(undefined)).toBe("—");
  });
});

describe("formatPercent", () => {
  it("shows one decimal", () => {
    expect(formatPercent(0.091)).toBe("9.1%");
    expect(formatPercent(1)).toBe("100.0%");
  });
  it("returns em-dash for null/infinity", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(Infinity)).toBe("—");
  });
});
