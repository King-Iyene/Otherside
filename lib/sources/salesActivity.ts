import { queryDatabase, getTitle, getSelect, getDate, getPerson, getPlainNumber, getMoney } from "../notion";
import type { HealthFlag, SalesActivityRow, SourceResult } from "../types";

const DATABASE_ID = "25ac2fe5-3b3e-450b-bf9f-4a485cf6a410";

export async function fetchSalesActivity(token: string): Promise<SourceResult<SalesActivityRow>> {
  const pages = await queryDatabase(DATABASE_ID, token);

  const rows: SalesActivityRow[] = pages.map((page) => {
    const props = page.properties;
    const health: HealthFlag[] = [];

    const entry = getTitle(props, "Entry");
    const date = getDate(props, "Date");
    const cashCollectedOnCall = getMoney(props, "Cash Collected on Call");
    const salesRevenue = getMoney(props, "Sales in Revenue");

    if (!date) health.push({ field: "Date", kind: "missing_date", raw: "" });
    if (cashCollectedOnCall.raw && cashCollectedOnCall.value === null) {
      health.push({ field: "Cash Collected on Call", kind: "unparseable_money", raw: cashCollectedOnCall.raw });
    }
    if (salesRevenue.raw && salesRevenue.value === null) {
      health.push({ field: "Sales in Revenue", kind: "unparseable_money", raw: salesRevenue.raw });
    }

    return {
      id: page.id,
      url: page.url,
      isTest: false,
      health,
      entry,
      date,
      enrManager: getPerson(props, "Enr Manager"),
      launch: getSelect(props, "Launch"),
      newCalls: getPlainNumber(props, "New Calls in Calendar"),
      cancelledCalls: getPlainNumber(props, "Cancelled Calls"),
      rescheduled: getPlainNumber(props, "Rescheduled"),
      noShow: getPlainNumber(props, "No Show"),
      showed: getPlainNumber(props, "Showed to Call"),
      offersMade: getPlainNumber(props, "Offers Made"),
      salesMade: getPlainNumber(props, "Sales Made"),
      paidInFull: getPlainNumber(props, "Paid in Full Sold"),
      paymentPlans: getPlainNumber(props, "Payment Plans Sold"),
      followUpCalls: getPlainNumber(props, "Follow Up Calls"),
      followUpScheduled: getPlainNumber(props, "Follow Up Call Scheduled"),
      cashCollectedOnCall: cashCollectedOnCall.value,
      salesRevenue: salesRevenue.value,
    };
  });

  return { rows, error: null, fetchedAt: Date.now() };
}

export interface DerivedRates {
  showPct: number | null;
  offerPct: number | null;
  closePctShows: number | null;
  closePctOffers: number | null;
}

export function computeRates(totals: {
  newCalls: number;
  showed: number;
  offersMade: number;
  salesMade: number;
}): DerivedRates {
  const div = (a: number, b: number) => (b > 0 ? a / b : null);
  return {
    showPct: div(totals.showed, totals.newCalls),
    offerPct: div(totals.offersMade, totals.showed),
    closePctShows: div(totals.salesMade, totals.showed),
    closePctOffers: div(totals.salesMade, totals.offersMade),
  };
}
