import { describe, expect, it } from "vitest";
import {
  detectAmountColumn,
  detectDateColumn,
  detectChallengeColumns,
  parseAmount,
  looksLikeDate,
} from "../lib/challengeColumns";

describe("parseAmount", () => {
  it("parses currency-formatted strings", () => {
    expect(parseAmount("$1,299.00")).toBe(1299);
    expect(parseAmount("₦5000")).toBe(5000);
    expect(parseAmount("1200")).toBe(1200);
    expect(parseAmount(1500)).toBe(1500);
  });
  it("returns null for non-money", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("n/a")).toBeNull();
    expect(parseAmount(null)).toBeNull();
  });
});

describe("looksLikeDate", () => {
  it("accepts real dates, rejects bare numbers", () => {
    expect(looksLikeDate("2026-03-14")).toBe(true);
    expect(looksLikeDate("3/14/2026")).toBe(true);
    expect(looksLikeDate("March 14, 2026")).toBe(true);
    expect(looksLikeDate("1299")).toBe(false);
    expect(looksLikeDate("$1,200")).toBe(false);
  });
});

describe("detectAmountColumn — finds money even when the header isn't 'amount'", () => {
  it("picks a money column named 'Total Paid'", () => {
    const cols = ["Email", "Name", "Total Paid", "UTM Medium"];
    const rows = [
      { Email: "a@x.com", Name: "A", "Total Paid": "$1,200", "UTM Medium": "fb" },
      { Email: "b@x.com", Name: "B", "Total Paid": "$0", "UTM Medium": "ig" },
      { Email: "c@x.com", Name: "C", "Total Paid": "$997", "UTM Medium": "yt" },
      { Email: "d@x.com", Name: "D", "Total Paid": "$1,200", "UTM Medium": "fb" },
    ];
    expect(detectAmountColumn(cols, rows)).toBe("Total Paid");
  });

  it("does NOT pick a phone-number column over a real money column", () => {
    const cols = ["Phone", "Order Value"];
    const rows = [
      { Phone: "08012345678", "Order Value": "$5,000" },
      { Phone: "08087654321", "Order Value": "$2,500" },
      { Phone: "08011112222", "Order Value": "$5,000" },
    ];
    expect(detectAmountColumn(cols, rows)).toBe("Order Value");
  });
});

describe("detectDateColumn", () => {
  it("picks a date column named 'Sale Date'", () => {
    const cols = ["Sale Date", "Amount"];
    const rows = [
      { "Sale Date": "2026-02-01", Amount: "$1200" },
      { "Sale Date": "2026-02-03", Amount: "$0" },
      { "Sale Date": "2026-02-10", Amount: "$997" },
    ];
    expect(detectDateColumn(cols, rows)).toBe("Sale Date");
  });
});

describe("detectChallengeColumns — end to end on a messy sheet", () => {
  it("resolves every role from realistic headers", () => {
    const cols = ["Email Address", "First Name", "Sale Date", "Total Paid", "Coupon Code", "Challenge", "utm_medium"];
    const rows = [
      {
        "Email Address": "a@x.com",
        "First Name": "A",
        "Sale Date": "2026-02-01",
        "Total Paid": "$1,200",
        "Coupon Code": "SAVE50",
        Challenge: "Erupt 2",
        utm_medium: "facebook",
      },
      {
        "Email Address": "b@x.com",
        "First Name": "B",
        "Sale Date": "2026-02-02",
        "Total Paid": "$0",
        "Coupon Code": "",
        Challenge: "Erupt 2",
        utm_medium: "youtube",
      },
      {
        "Email Address": "c@x.com",
        "First Name": "C",
        "Sale Date": "2026-02-05",
        "Total Paid": "$997",
        "Coupon Code": "FREE",
        Challenge: "Erupt 2",
        utm_medium: "ig",
      },
    ];
    const d = detectChallengeColumns(cols, rows);
    expect(d.amount).toBe("Total Paid");
    expect(d.date).toBe("Sale Date");
    expect(d.email).toBe("Email Address");
    expect(d.coupon).toBe("Coupon Code");
    expect(d.challenge).toBe("Challenge");
    expect(d.utm).toBe("utm_medium");
  });
});
