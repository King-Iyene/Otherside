import type {
  AppointmentRow,
  ApplicationRow,
  CashRow,
  ChallengeRow,
  SalesActivityRow,
} from "./types";

/**
 * Interactive Insights Query Engine.
 *
 * Every dataset is exposed as a set of filterable dimensions. A "Group" is a
 * dataset + a list of AND'd filter rules. Two groups are compared side-by-side
 * on any metric (count / percent / revenue). Optionally the group can be
 * cross-joined with another dataset by email to answer "of the leads in group X,
 * how many bought Reborn?" style questions.
 */

export type DatasetKey =
  | "applications"
  | "cash"
  | "appointments"
  | "sales"
  | "challenge";

export type FieldType = "select" | "text" | "number" | "date" | "boolean";
export type OpKey = "eq" | "neq" | "in" | "notIn" | "gt" | "gte" | "lt" | "lte" | "contains" | "isEmpty" | "isNotEmpty";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  /** For select fields — computed from data. */
  options?: string[];
  /** Accessor for the value on a row. */
  get: (row: any) => any;
  /** For email-based joins. */
  emailField?: boolean;
}

export interface DatasetDef {
  key: DatasetKey;
  label: string;
  icon: string;
  fields: FieldDef[];
  /** Get email off any row for cross-source joins. */
  getEmail: (row: any) => string;
}

const norm = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim().toLowerCase());
const showedStatuses = new Set(["Showed", "Client Won", "Finisher"]);

// ────────────────────────────────────────────────────────────────
// Dataset definitions — each field is filterable + surfacable
// ────────────────────────────────────────────────────────────────

const APPLICATIONS: DatasetDef = {
  key: "applications",
  label: "Applications",
  icon: "📝",
  getEmail: (r: ApplicationRow) => norm(r.email),
  fields: [
    { key: "annualEarnings", label: "Annual Earnings", type: "select", get: (r: ApplicationRow) => r.annualEarnings },
    { key: "applicationStatus", label: "Application Status", type: "select", get: (r: ApplicationRow) => r.applicationStatus },
    { key: "purchased", label: "Purchased Reborn", type: "boolean", get: (r: ApplicationRow) => r.purchased },
    { key: "dateCreated", label: "Date Created", type: "date", get: (r: ApplicationRow) => r.dateCreated },
    { key: "firstName", label: "First Name", type: "text", get: (r: ApplicationRow) => r.firstName },
    { key: "lastName", label: "Last Name", type: "text", get: (r: ApplicationRow) => r.lastName },
    { key: "email", label: "Email", type: "text", get: (r: ApplicationRow) => r.email, emailField: true },
  ],
};

const CASH: DatasetDef = {
  key: "cash",
  label: "Reborn Cash Tracker",
  icon: "💰",
  getEmail: (r: CashRow) => norm(r.email),
  fields: [
    { key: "product", label: "Product", type: "select", get: (r: CashRow) => r.product },
    { key: "cohort", label: "Cohort", type: "select", get: (r: CashRow) => r.cohort },
    { key: "enrManager", label: "Enr Manager", type: "select", get: (r: CashRow) => r.enrManager },
    { key: "paymentMethod", label: "Payment Method", type: "select", get: (r: CashRow) => r.paymentMethod },
    { key: "couponCode", label: "Coupon Code", type: "text", get: (r: CashRow) => r.couponCode },
    { key: "revenue", label: "Revenue", type: "number", get: (r: CashRow) => r.revenue },
    { key: "cashCollected", label: "Cash Collected", type: "number", get: (r: CashRow) => r.cashCollected },
    { key: "balance", label: "Balance", type: "number", get: (r: CashRow) => r.balance },
    { key: "enrollmentDate", label: "Enrollment Date", type: "date", get: (r: CashRow) => r.enrollmentDate },
    { key: "email", label: "Email", type: "text", get: (r: CashRow) => r.email, emailField: true },
    { key: "name", label: "Name", type: "text", get: (r: CashRow) => r.name },
  ],
};

const APPOINTMENTS: DatasetDef = {
  key: "appointments",
  label: "Appointments",
  icon: "📞",
  getEmail: (r: AppointmentRow) => norm(r.email),
  fields: [
    { key: "status", label: "Status", type: "select", get: (r: AppointmentRow) => r.status },
    { key: "appointmentType", label: "Type", type: "select", get: (r: AppointmentRow) => r.appointmentType },
    { key: "cohort", label: "Cohort", type: "select", get: (r: AppointmentRow) => r.cohort },
    { key: "enrManager", label: "Enr Manager", type: "select", get: (r: AppointmentRow) => r.enrManager },
    { key: "calendar", label: "Calendar", type: "select", get: (r: AppointmentRow) => r.calendar },
    { key: "showed", label: "Showed (Yes/No)", type: "boolean", get: (r: AppointmentRow) => (r.status ? showedStatuses.has(r.status) : false) },
    { key: "appointmentTime", label: "Appointment Time", type: "date", get: (r: AppointmentRow) => r.appointmentTime },
    { key: "email", label: "Email", type: "text", get: (r: AppointmentRow) => r.email, emailField: true },
    { key: "name", label: "Name", type: "text", get: (r: AppointmentRow) => r.name },
  ],
};

const SALES: DatasetDef = {
  key: "sales",
  label: "Sales Activity",
  icon: "📊",
  getEmail: () => "", // No email in this dataset
  fields: [
    { key: "enrManager", label: "Enr Manager", type: "select", get: (r: SalesActivityRow) => r.enrManager },
    { key: "launch", label: "Launch", type: "select", get: (r: SalesActivityRow) => r.launch },
    { key: "newCalls", label: "New Calls", type: "number", get: (r: SalesActivityRow) => r.newCalls },
    { key: "showed", label: "Showed", type: "number", get: (r: SalesActivityRow) => r.showed },
    { key: "offersMade", label: "Offers Made", type: "number", get: (r: SalesActivityRow) => r.offersMade },
    { key: "salesMade", label: "Sales Made", type: "number", get: (r: SalesActivityRow) => r.salesMade },
    { key: "cashCollectedOnCall", label: "Cash on Call", type: "number", get: (r: SalesActivityRow) => r.cashCollectedOnCall },
    { key: "salesRevenue", label: "Sales Revenue", type: "number", get: (r: SalesActivityRow) => r.salesRevenue },
    { key: "date", label: "Date", type: "date", get: (r: SalesActivityRow) => r.date },
  ],
};

const CHALLENGE: DatasetDef = {
  key: "challenge",
  label: "Challenge Sheet",
  icon: "🎯",
  getEmail: (r: ChallengeRow) => {
    for (const k of Object.keys(r)) if (k.toLowerCase().includes("email")) return norm(r[k]);
    return "";
  },
  fields: [], // populated dynamically from the sheet columns
};

export function buildDatasets(challenge: ChallengeRow[], columns: string[]): DatasetDef[] {
  // Populate Challenge fields from the actual sheet columns.
  const challengeFields: FieldDef[] = columns.map((col) => {
    const lc = col.toLowerCase();
    let type: FieldType = "text";
    if (lc === "amount" || lc.includes("price") || lc.includes("revenue")) type = "number";
    else if (lc.includes("date")) type = "date";
    else if (["product", "coupon", "utm medium", "utm source", "challange", "challenge"].includes(lc)) type = "select";
    return {
      key: col,
      label: col,
      type,
      get: (r: any) => r[col],
      emailField: lc.includes("email"),
    };
  });
  const CHALLENGE_FILLED = { ...CHALLENGE, fields: challengeFields };
  return [APPLICATIONS, CASH, APPOINTMENTS, SALES, CHALLENGE_FILLED];
}

// ────────────────────────────────────────────────────────────────
// Filter engine
// ────────────────────────────────────────────────────────────────

export interface FilterRule {
  fieldKey: string;
  op: OpKey;
  value?: string;
  valueList?: string[];
  valueNum?: number;
}

export interface QueryGroup {
  id: string;
  label: string;
  datasetKey: DatasetKey;
  filters: FilterRule[];
  color: string;
}

function matchRule(field: FieldDef | undefined, row: any, rule: FilterRule): boolean {
  if (!field) return false;
  const val = field.get(row);

  switch (rule.op) {
    case "eq":
      return norm(val) === norm(rule.value);
    case "neq":
      return norm(val) !== norm(rule.value);
    case "in":
      return (rule.valueList || []).map(norm).includes(norm(val));
    case "notIn":
      return !(rule.valueList || []).map(norm).includes(norm(val));
    case "contains":
      return norm(val).includes(norm(rule.value));
    case "isEmpty":
      return val === null || val === undefined || String(val).trim() === "";
    case "isNotEmpty":
      return val !== null && val !== undefined && String(val).trim() !== "";
    case "gt":
      return typeof val === "number" && val > (rule.valueNum ?? -Infinity);
    case "gte":
      return typeof val === "number" && val >= (rule.valueNum ?? -Infinity);
    case "lt":
      return typeof val === "number" && val < (rule.valueNum ?? Infinity);
    case "lte":
      return typeof val === "number" && val <= (rule.valueNum ?? Infinity);
    default:
      return false;
  }
}

export function applyFilters(dataset: DatasetDef, rows: any[], filters: FilterRule[], includeTest = false): any[] {
  return rows.filter((r) => {
    if (!includeTest && r.isTest) return false;
    return filters.every((rule) => {
      const field = dataset.fields.find((f) => f.key === rule.fieldKey);
      return matchRule(field, r, rule);
    });
  });
}

// ────────────────────────────────────────────────────────────────
// Comparison — computes results for a group, optionally cross-joined
// ────────────────────────────────────────────────────────────────

export type MetricKey = "count" | "percentOfPrevSet" | "sumRevenue" | "sumCashCollected" | "sumCashOnCall";

export interface CrossJoin {
  crossWith: DatasetKey; // e.g. "cash" to see who bought
  crossFilters: FilterRule[]; // e.g. Cash where balance == 0
}

export interface GroupResult {
  group: QueryGroup;
  base: any[]; // rows matching the group's filters
  baseCount: number;
  crossMatched: any[]; // rows from the group whose email appears in the cross-join dataset (filtered)
  crossMatchedCount: number;
  conversionRate: number | null;
  revenue: number;
  crossRows: any[]; // the actual matched cross-source rows for drill-down
}

export function computeGroup(
  group: QueryGroup,
  datasets: DatasetDef[],
  data: DataBundle,
  cross: CrossJoin | null,
  includeTest: boolean
): GroupResult {
  const dataset = datasets.find((d) => d.key === group.datasetKey)!;
  const rows = getRowsForDataset(group.datasetKey, data);
  const base = applyFilters(dataset, rows, group.filters, includeTest);
  const baseCount = base.length;

  if (!cross) {
    const revenue = sumRevenueOf(dataset, base);
    return {
      group,
      base,
      baseCount,
      crossMatched: [],
      crossMatchedCount: 0,
      conversionRate: null,
      revenue,
      crossRows: [],
    };
  }

  const crossDataset = datasets.find((d) => d.key === cross.crossWith)!;
  const crossRowsAll = getRowsForDataset(cross.crossWith, data);
  const crossFiltered = applyFilters(crossDataset, crossRowsAll, cross.crossFilters, includeTest);
  const crossByEmail = new Map<string, any>();
  for (const r of crossFiltered) {
    const e = crossDataset.getEmail(r);
    if (e && !crossByEmail.has(e)) crossByEmail.set(e, r);
  }

  const crossMatched: any[] = [];
  const crossRows: any[] = [];
  for (const r of base) {
    const e = dataset.getEmail(r);
    if (!e) continue;
    const match = crossByEmail.get(e);
    if (match) {
      crossMatched.push(r);
      crossRows.push({ base: r, cross: match });
    }
  }
  const crossRevenue = sumRevenueOf(crossDataset, crossRows.map((x) => x.cross));

  return {
    group,
    base,
    baseCount,
    crossMatched,
    crossMatchedCount: crossMatched.length,
    conversionRate: baseCount > 0 ? crossMatched.length / baseCount : null,
    revenue: crossRevenue,
    crossRows,
  };
}

function sumRevenueOf(dataset: DatasetDef, rows: any[]): number {
  const field = dataset.fields.find((f) => f.key === "cashCollected" || f.key === "revenue" || f.key.toLowerCase() === "amount");
  if (!field) return 0;
  return rows.reduce((s, r) => {
    const v = field.get(r);
    return s + (typeof v === "number" ? v : 0);
  }, 0);
}

// ────────────────────────────────────────────────────────────────
// Data bundle — passed to computeGroup
// ────────────────────────────────────────────────────────────────

export interface DataBundle {
  applications: ApplicationRow[];
  cash: CashRow[];
  appointments: AppointmentRow[];
  sales: SalesActivityRow[];
  challenge: ChallengeRow[];
}

export function getRowsForDataset(key: DatasetKey, bundle: DataBundle): any[] {
  return bundle[key];
}

/** Derive select-field options from the actual data present. */
export function optionsFor(dataset: DatasetDef, field: FieldDef, rows: any[]): string[] {
  const s = new Set<string>();
  for (const r of rows) {
    const v = field.get(r);
    if (v !== null && v !== undefined && v !== "") s.add(String(v));
  }
  return Array.from(s).sort();
}
