import { queryDatabase, getTitle, getEmail, getRichText, getSelect, getDate, getMoney } from "../notion";
import { isTestRecord } from "../testFlag";
import { cashRowHealthChecks } from "../dataHealth";
import type { CashRow, HealthFlag, SourceResult } from "../types";

const DATABASE_ID = "367c2386-6468-80af-bbe1-d5f6d2510876";

export async function fetchCashTracker(token: string): Promise<SourceResult<CashRow>> {
  const pages = await queryDatabase(DATABASE_ID, token);

  const rows: CashRow[] = pages.map((page) => {
    const props = page.properties;
    const health: HealthFlag[] = [];

    const name = getTitle(props, "Name");
    const email = getEmail(props, "Email");
    // The Reborn Cash Tracker has no "Enrollment Date" column — the transaction
    // date lives in "Payment Date". This is what every time-series chart and
    // date filter keys on, so read the real column (falling back to created time
    // downstream via `createdDate`).
    const enrollmentDate = getDate(props, "Payment Date");
    const revenue = getMoney(props, "Revenue");
    const cashCollected = getMoney(props, "Cash Collected");
    const balance = getMoney(props, "Balance");

    if (!enrollmentDate) health.push({ field: "Payment Date", kind: "missing_date", raw: "" });
    if (revenue.raw && revenue.value === null) {
      health.push({ field: "Revenue", kind: "unparseable_money", raw: revenue.raw });
    }
    if (cashCollected.raw && cashCollected.value === null) {
      health.push({ field: "Cash Collected", kind: "unparseable_money", raw: cashCollected.raw });
    }
    if (balance.raw && balance.value === null) {
      health.push({ field: "Balance", kind: "unparseable_money", raw: balance.raw });
    }

    const cohort = getSelect(props, "Cohort");
    const enrManager = getRichText(props, "Enr Manager ");
    const nextPaymentDate = getDate(props, "Date of Next Payment");

    const transactionType = (getSelect(props, "Transaction Type") as CashRow["transactionType"]) ?? null;

    // Extended per-row checks (cohort/closer/zero-revenue/cash>revenue/outstanding-no-date)
    health.push(
      ...cashRowHealthChecks({
        cohort,
        enrManager,
        revenue: revenue.value,
        cashCollected: cashCollected.value,
        balance: balance.value,
        nextPaymentDate,
        enrollmentDate,
        name,
        email,
        transactionType,
      })
    );

    return {
      id: page.id,
      url: page.url,
      isTest: isTestRecord(name, email),
      health,
      name,
      email,
      product: getRichText(props, "Product"),
      cohort,
      enrollmentDate,
      createdDate: (page as any).created_time ?? null,
      revenue: revenue.value,
      cashCollected: cashCollected.value,
      balance: balance.value,
      couponCode: getRichText(props, "Coupon Code"),
      paymentMethod: getRichText(props, "Payment Method"),
      paymentPlan: getRichText(props, "Payment Plan"),
      transactionType,
      nextPaymentDate,
      enrManager,
      note: getRichText(props, "Note"),
    };
  });

  return { rows, error: null, fetchedAt: Date.now() };
}
