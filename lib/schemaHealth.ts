/**
 * Schema / column health — a safety net for the class of bug where a Notion (or
 * Google Sheet) column gets renamed or removed. When that happens the source
 * adapter reads a column name that no longer exists and silently gets `null`
 * for EVERY row, so the metric quietly reads $0 or blank instead of erroring.
 *
 * This scans each source's parsed rows and flags any critical column that is
 * empty across every single row — a strong signal the mapping is broken rather
 * than the data genuinely being absent. (A column that is legitimately all-zero
 * is NOT flagged: money parses to 0, not null, when the column exists.)
 */
import type {
  DashboardPayload,
  CashRow,
  AppointmentRow,
  ApplicationRow,
  SalesActivityRow,
} from "./types";

export interface ColumnWarning {
  /** Human source label (matches the Data Health source labels + urlForSource). */
  source: string;
  /** The column the dashboard expected to read. */
  column: string;
  /** How many rows were checked. */
  rowCount: number;
  detail: string;
}

/** Empty = null/undefined, or empty/whitespace string. A numeric 0 is NOT empty. */
function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

/** Only flag when there are enough rows that "every one is empty" is meaningful. */
const MIN_ROWS = 3;

function check<T>(
  source: string,
  rows: T[],
  columns: { column: string; get: (r: T) => unknown }[]
): ColumnWarning[] {
  const out: ColumnWarning[] = [];
  if (rows.length < MIN_ROWS) return out;
  for (const { column, get } of columns) {
    if (rows.every((r) => isEmpty(get(r)))) {
      out.push({
        source,
        column,
        rowCount: rows.length,
        detail: `Every one of the ${rows.length} rows in ${source} has an empty "${column}". This usually means the column was renamed or removed at the source, so the dashboard is reading a name that no longer exists — the metric will read $0 or blank. Open ${source} and confirm the "${column}" column still exists with that exact name.`,
      });
    }
  }
  return out;
}

export function detectColumnHealth(data: DashboardPayload): ColumnWarning[] {
  const warnings: ColumnWarning[] = [];

  warnings.push(
    ...check<CashRow>("Notion · Reborn Cash Tracker", data.cash.rows, [
      { column: "Payment Date", get: (r) => r.enrollmentDate },
      { column: "Cash Collected", get: (r) => r.cashCollected },
      { column: "Revenue", get: (r) => r.revenue },
    ])
  );

  warnings.push(
    ...check<AppointmentRow>("Notion · Appointments Tracker", data.appointments.rows, [
      { column: "Appointment Time", get: (r) => r.appointmentTime },
      { column: "Appointment Status", get: (r) => r.status },
    ])
  );

  warnings.push(
    ...check<ApplicationRow>("Notion · REBORN Application Tracker", data.applications.rows, [
      { column: "Date Created", get: (r) => r.dateCreated },
      { column: "Application Status", get: (r) => r.applicationStatus },
    ])
  );

  warnings.push(
    ...check<SalesActivityRow>("Notion · Sales Activity Tracker", data.salesActivity.rows, [
      { column: "Date", get: (r) => r.date },
      { column: "Cash Collected on Call", get: (r) => r.cashCollectedOnCall },
      { column: "Sales in Revenue", get: (r) => r.salesRevenue },
    ])
  );

  return warnings;
}
