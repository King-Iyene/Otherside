/**
 * Direct links to the underlying database / sheet for each data source, so a
 * Data Health flag or Payment Anomaly can send the user straight to the place
 * they need to fix.
 */
const strip = (id: string) => id.replace(/-/g, "");

export const CHALLENGE_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1mJ3DLye8otnjs2CbUganWGNQbciBssZFHEFusoGQFpc/edit#gid=1216509445";
export const REBORN_CASH_URL = `https://www.notion.so/${strip("367c2386-6468-80af-bbe1-d5f6d2510876")}`;
export const APPOINTMENTS_URL = `https://www.notion.so/${strip("368c2386-6468-803e-8fac-fe68a4ed8a6a")}`;
export const APPLICATIONS_URL = `https://www.notion.so/${strip("33ec2386-6468-8004-b411-d9243b1f17e5")}`;
export const SALES_URL = `https://www.notion.so/${strip("25ac2fe5-3b3e-450b-bf9f-4a485cf6a410")}`;

/** Map a human source label (e.g. "Notion · Reborn Cash Tracker") to its URL. */
export function urlForSource(source: string): string | null {
  const s = source.toLowerCase();
  if (s.includes("reborn cash")) return REBORN_CASH_URL;
  if (s.includes("appointment")) return APPOINTMENTS_URL;
  if (s.includes("application")) return APPLICATIONS_URL;
  if (s.includes("sales activity")) return SALES_URL;
  if (s.includes("challenge") || s.includes("google sheet")) return CHALLENGE_SHEET_URL;
  return null;
}
