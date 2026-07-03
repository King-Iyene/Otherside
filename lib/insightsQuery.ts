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
 *
 * Naming philosophy: everything a salesperson sees uses sales language, not
 * data-engineering language. Datasets are labeled by what they represent
 * ("Leads", "Enrolled Members") not what they're stored in. Fields hidden
 * from the filter UI (name/email/phone) are still available for row display
 * in the drill-down modal.
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
  /** When false, hide from the filter dropdown (still available in row display).
   * Used to hide name/email/phone/etc. from the "filter by…" picker since nobody
   * ever filters "leads where First Name = John" — that's not a comparison,
   * that's a text search. */
  filterable?: boolean;
}

export interface DatasetDef {
  key: DatasetKey;
  label: string;
  /** Short noun for a single row, used in UI ("filter leads", "12 members"). */
  rowNoun: string;
  icon: string;
  fields: FieldDef[];
  /** Get email off any row for cross-source joins. */
  getEmail: (row: any) => string;
}

const norm = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim().toLowerCase());
const showedStatuses = new Set(["Showed", "Client Won", "Finisher"]);

// ────────────────────────────────────────────────────────────────
// Dataset definitions — labels use sales language
// ────────────────────────────────────────────────────────────────

const APPLICATIONS: DatasetDef = {
  key: "applications",
  label: "Leads (Applications)",
  rowNoun: "leads",
  icon: "🧲",
  getEmail: (r: ApplicationRow) => norm(r.email),
  fields: [
    { key: "annualEarnings", label: "Income Bracket", type: "select", filterable: true, get: (r: ApplicationRow) => r.annualEarnings },
    { key: "applicationStatus", label: "Application Status", type: "select", filterable: true, get: (r: ApplicationRow) => r.applicationStatus },
    { key: "purchased", label: "Bought Reborn?", type: "boolean", filterable: true, get: (r: ApplicationRow) => r.purchased },
    { key: "dateCreated", label: "Application Date", type: "date", filterable: true, get: (r: ApplicationRow) => r.dateCreated },
    // Display-only — hidden from filter picker but shown in the leads table
    { key: "firstName", label: "First Name", type: "text", filterable: false, get: (r: ApplicationRow) => r.firstName },
    { key: "lastName", label: "Last Name", type: "text", filterable: false, get: (r: ApplicationRow) => r.lastName },
    { key: "email", label: "Email", type: "text", filterable: false, get: (r: ApplicationRow) => r.email, emailField: true },
    { key: "phone", label: "Phone", type: "text", filterable: false, get: (r: ApplicationRow) => r.phone },
  ],
};

const CASH: DatasetDef = {
  key: "cash",
  label: "Enrolled Members (Cash Tracker)",
  rowNoun: "members",
  icon: "🏆",
  getEmail: (r: CashRow) => norm(r.email),
  fields: [
    { key: "product", label: "Product", type: "select", filterable: true, get: (r: CashRow) => r.product },
    { key: "cohort", label: "Cohort", type: "select", filterable: true, get: (r: CashRow) => r.cohort },
    { key: "enrManager", label: "Closer (Enr Manager)", type: "select", filterable: true, get: (r: CashRow) => r.enrManager },
    { key: "paymentMethod", label: "Payment Method", type: "select", filterable: true, get: (r: CashRow) => r.paymentMethod },
    { key: "couponCode", label: "Used Coupon?", type: "text", filterable: true, get: (r: CashRow) => r.couponCode },
    { key: "revenue", label: "Deal Size ($)", type: "number", filterable: true, get: (r: CashRow) => r.revenue },
    { key: "cashCollected", label: "Cash Collected ($)", type: "number", filterable: true, get: (r: CashRow) => r.cashCollected },
    { key: "balance", label: "Outstanding Balance ($)", type: "number", filterable: true, get: (r: CashRow) => r.balance },
    { key: "enrollmentDate", label: "Enrollment Date", type: "date", filterable: true, get: (r: CashRow) => r.enrollmentDate },
    { key: "name", label: "Name", type: "text", filterable: false, get: (r: CashRow) => r.name },
    { key: "email", label: "Email", type: "text", filterable: false, get: (r: CashRow) => r.email, emailField: true },
  ],
};

const APPOINTMENTS: DatasetDef = {
  key: "appointments",
  label: "Booked Calls (Appointments)",
  rowNoun: "calls",
  icon: "📞",
  getEmail: (r: AppointmentRow) => norm(r.email),
  fields: [
    { key: "status", label: "Call Status", type: "select", filterable: true, get: (r: AppointmentRow) => r.status },
    { key: "showed", label: "Showed Up?", type: "boolean", filterable: true, get: (r: AppointmentRow) => (r.status ? showedStatuses.has(r.status) : false) },
    { key: "appointmentType", label: "Call Type", type: "select", filterable: true, get: (r: AppointmentRow) => r.appointmentType },
    { key: "cohort", label: "Cohort", type: "select", filterable: true, get: (r: AppointmentRow) => r.cohort },
    { key: "enrManager", label: "Closer (Enr Manager)", type: "select", filterable: true, get: (r: AppointmentRow) => r.enrManager },
    { key: "calendar", label: "Calendar", type: "select", filterable: true, get: (r: AppointmentRow) => r.calendar },
    { key: "appointmentTime", label: "Call Date", type: "date", filterable: true, get: (r: AppointmentRow) => r.appointmentTime },
    { key: "name", label: "Name", type: "text", filterable: false, get: (r: AppointmentRow) => r.name },
    { key: "email", label: "Email", type: "text", filterable: false, get: (r: AppointmentRow) => r.email, emailField: true },
    { key: "phone", label: "Phone", type: "text", filterable: false, get: (r: AppointmentRow) => r.phone },
  ],
};

const SALES: DatasetDef = {
  key: "sales",
  label: "Daily Sales Activity",
  rowNoun: "daily entries",
  icon: "📊",
  getEmail: () => "", // No email in this dataset
  fields: [
    { key: "enrManager", label: "Closer (Enr Manager)", type: "select", filterable: true, get: (r: SalesActivityRow) => r.enrManager },
    { key: "launch", label: "Launch", type: "select", filterable: true, get: (r: SalesActivityRow) => r.launch },
    { key: "newCalls", label: "New Calls (that day)", type: "number", filterable: true, get: (r: SalesActivityRow) => r.newCalls },
    { key: "showed", label: "Showed (that day)", type: "number", filterable: true, get: (r: SalesActivityRow) => r.showed },
    { key: "offersMade", label: "Offers Made (that day)", type: "number", filterable: true, get: (r: SalesActivityRow) => r.offersMade },
    { key: "salesMade", label: "Sales Made (that day)", type: "number", filterable: true, get: (r: SalesActivityRow) => r.salesMade },
    { key: "cashCollectedOnCall", label: "Cash on Call ($)", type: "number", filterable: true, get: (r: SalesActivityRow) => r.cashCollectedOnCall },
    { key: "salesRevenue", label: "Deal Size on Call ($)", type: "number", filterable: true, get: (r: SalesActivityRow) => r.salesRevenue },
    { key: "date", label: "Date", type: "date", filterable: true, get: (r: SalesActivityRow) => r.date },
  ],
};

const CHALLENGE: DatasetDef = {
  key: "challenge",
  label: "Challenge Registrants",
  rowNoun: "registrants",
  icon: "🎯",
  getEmail: (r: ChallengeRow) => {
    for (const k of Object.keys(r)) if (k.toLowerCase().includes("email")) return norm(r[k]);
    return "";
  },
  fields: [], // populated dynamically from the sheet columns
};

/** Non-comparable field labels — hidden from filter dropdown even if they're in the sheet. */
const CHALLENGE_HIDDEN_FROM_FILTERS = /^(first name|last name|email|phone|telegram)/i;

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
      label: prettifyLabel(col),
      type,
      filterable: !CHALLENGE_HIDDEN_FROM_FILTERS.test(col),
      get: (r: any) => r[col],
      emailField: lc.includes("email"),
    };
  });
  const CHALLENGE_FILLED = { ...CHALLENGE, fields: challengeFields };
  return [APPLICATIONS, CASH, APPOINTMENTS, SALES, CHALLENGE_FILLED];
}

/** Convert "UTM MEDIUM" → "Utm Medium", "First name" → "First Name", etc. */
function prettifyLabel(raw: string): string {
  return raw
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
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
  /** Optional custom label — if empty, we auto-generate a sales-friendly name from the filters. */
  label: string;
  datasetKey: DatasetKey;
  filters: FilterRule[];
  color: string;
}

/** Sales-friendly operator labels — no "eq" / "gte" in the UI. */
export const OP_LABELS_SALES: Record<OpKey, string> = {
  eq: "is",
  neq: "is not",
  in: "is one of",
  notIn: "is not one of",
  gt: "is more than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
  contains: "contains",
  isEmpty: "is blank",
  isNotEmpty: "has any value",
};

function matchRule(field: FieldDef | undefined, row: any, rule: FilterRule): boolean {
  if (!field) return false;
  const val = field.get(row);

  switch (rule.op) {
    case "eq":
      // Boolean fields serialize as "true"/"false" strings from the UI
      if (field.type === "boolean") return String(!!val) === String(rule.value);
      return norm(val) === norm(rule.value);
    case "neq":
      if (field.type === "boolean") return String(!!val) !== String(rule.value);
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

/** Sales-language description of a group's filters — used as auto-label when the user hasn't renamed. */
export function describeGroup(group: QueryGroup, dataset: DatasetDef): string {
  if (group.filters.length === 0) return `All ${dataset.rowNoun}`;
  const parts = group.filters.map((rule) => {
    const field = dataset.fields.find((f) => f.key === rule.fieldKey);
    if (!field) return "";
    const label = field.label;
    switch (rule.op) {
      case "in":
        return `${label}: ${(rule.valueList || []).join(", ") || "?"}`;
      case "notIn":
        return `${label} not in: ${(rule.valueList || []).join(", ") || "?"}`;
      case "eq":
        return `${label} = ${rule.value ?? "?"}`;
      case "neq":
        return `${label} ≠ ${rule.value ?? "?"}`;
      case "gt":
      case "gte":
      case "lt":
      case "lte":
        return `${label} ${OP_LABELS_SALES[rule.op]} ${rule.valueNum ?? "?"}`;
      case "contains":
        return `${label} contains "${rule.value ?? ""}"`;
      case "isEmpty":
        return `${label} is blank`;
      case "isNotEmpty":
        return `${label} has any value`;
      default:
        return "";
    }
  });
  return parts.filter(Boolean).join(" · ");
}

// ────────────────────────────────────────────────────────────────
// Comparison — computes results for a group, optionally cross-joined
// ────────────────────────────────────────────────────────────────

export interface CrossJoin {
  crossWith: DatasetKey;
  crossFilters: FilterRule[];
}

export interface GroupResult {
  group: QueryGroup;
  base: any[];
  baseCount: number;
  crossMatched: any[];
  crossMatchedCount: number;
  conversionRate: number | null;
  revenue: number;
  crossRows: any[];
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
// Data bundle
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

export function optionsFor(dataset: DatasetDef, field: FieldDef, rows: any[]): string[] {
  const s = new Set<string>();
  for (const r of rows) {
    const v = field.get(r);
    if (v !== null && v !== undefined && v !== "") s.add(String(v));
  }
  return Array.from(s).sort();
}

// ────────────────────────────────────────────────────────────────
// Cohort presets — one-click filter sets keyed on real data patterns.
// Applied against the group's dataset; only fires for the datasets
// listed under `appliesTo`. Missing options are silently skipped so
// a preset still works when a cohort name changes.
// ────────────────────────────────────────────────────────────────

export interface CohortPreset {
  id: string;
  label: string;
  emoji: string;
  color: string;
  /** Which datasets this preset makes sense on. */
  appliesTo: DatasetKey[];
  /** Build the filter rules for a given dataset (or return null to skip). */
  buildFilters: (datasetKey: DatasetKey, availableOptions: Record<string, string[]>) => FilterRule[] | null;
}

const cohortContains = (pattern: RegExp) => (options: string[]) => options.filter((o) => pattern.test(o));

export const COHORT_PRESETS: CohortPreset[] = [
  {
    id: "penetrate",
    label: "Penetrate",
    emoji: "🎯",
    color: "#61aaf2",
    appliesTo: ["cash", "appointments", "challenge"],
    buildFilters: (key, opts) => {
      if (key === "challenge") {
        const products = cohortContains(/penetrate/i)(opts["Product"] || []);
        if (!products.length) return null;
        return [{ fieldKey: "Product", op: "in", valueList: products }];
      }
      const matches = cohortContains(/penetrate/i)(opts.cohort || []);
      if (!matches.length) return null;
      return [{ fieldKey: "cohort", op: "in", valueList: matches }];
    },
  },
  {
    id: "erupt1",
    label: "Erupt 1 / Reborn Dec 2025",
    emoji: "🔥",
    color: "#f28b61",
    appliesTo: ["cash", "appointments"],
    buildFilters: (_key, opts) => {
      const matches = cohortContains(/erupt\s*1|dec\s*2025/i)(opts.cohort || []);
      if (!matches.length) return null;
      return [{ fieldKey: "cohort", op: "in", valueList: matches }];
    },
  },
  {
    id: "erupt2",
    label: "Erupt 2 / Reborn Apr 2026",
    emoji: "🔥",
    color: "#a48bf2",
    appliesTo: ["cash", "appointments"],
    buildFilters: (_key, opts) => {
      const matches = cohortContains(/erupt\s*2|apr\s*2026/i)(opts.cohort || []);
      if (!matches.length) return null;
      return [{ fieldKey: "cohort", op: "in", valueList: matches }];
    },
  },
  {
    id: "erupt3",
    label: "Erupt 3 / Reborn Aug 2026",
    emoji: "🔥",
    color: "#f2b63c",
    appliesTo: ["cash", "appointments"],
    buildFilters: (_key, opts) => {
      const matches = cohortContains(/erupt\s*3|aug\s*2026/i)(opts.cohort || []);
      if (!matches.length) return null;
      return [{ fieldKey: "cohort", op: "in", valueList: matches }];
    },
  },
  {
    id: "highIncome",
    label: "$100k+ leads",
    emoji: "💎",
    color: "#45d093",
    appliesTo: ["applications"],
    buildFilters: (_key, opts) => {
      const brackets = (opts.annualEarnings || []).filter((o) => /\$100k|\$250k|\$1M/i.test(o));
      if (!brackets.length) return null;
      return [{ fieldKey: "annualEarnings", op: "in", valueList: brackets }];
    },
  },
  {
    id: "midIncome",
    label: "$50k-$100k leads",
    emoji: "💼",
    color: "#61aaf2",
    appliesTo: ["applications"],
    buildFilters: (_key, opts) => {
      const brackets = (opts.annualEarnings || []).filter((o) => /\$50k\s*-\s*\$100k/i.test(o));
      if (!brackets.length) return null;
      return [{ fieldKey: "annualEarnings", op: "in", valueList: brackets }];
    },
  },
  {
    id: "lowIncome",
    label: "$0-$50k leads",
    emoji: "🌱",
    color: "#7d8899",
    appliesTo: ["applications"],
    buildFilters: (_key, opts) => {
      const brackets = (opts.annualEarnings || []).filter((o) => /\$0.*\$50k/i.test(o));
      if (!brackets.length) return null;
      return [{ fieldKey: "annualEarnings", op: "in", valueList: brackets }];
    },
  },
  {
    id: "readyToInvest",
    label: "Ready to Invest",
    emoji: "✅",
    color: "#45d093",
    appliesTo: ["applications"],
    buildFilters: () => [{ fieldKey: "applicationStatus", op: "in", valueList: ["Ready to Invest"] }],
  },
  {
    id: "adeyemiApproved",
    label: "Adeyemi Approved",
    emoji: "🎓",
    color: "#a48bf2",
    appliesTo: ["applications"],
    buildFilters: () => [{ fieldKey: "applicationStatus", op: "in", valueList: ["Adeyemi Approved DQ App"] }],
  },
  {
    id: "usedCoupon",
    label: "Used Coupon",
    emoji: "🏷️",
    color: "#f28b61",
    appliesTo: ["challenge", "cash"],
    buildFilters: (key) => {
      if (key === "challenge") return [{ fieldKey: "Coupon", op: "isNotEmpty" }];
      return [{ fieldKey: "couponCode", op: "isNotEmpty" }];
    },
  },
  {
    id: "showedCalls",
    label: "Showed Calls",
    emoji: "✅",
    color: "#45d093",
    appliesTo: ["appointments"],
    buildFilters: () => [{ fieldKey: "showed", op: "eq", value: "true" }],
  },
  {
    id: "noShows",
    label: "No Shows",
    emoji: "❌",
    color: "#f07070",
    appliesTo: ["appointments"],
    buildFilters: () => [{ fieldKey: "status", op: "in", valueList: ["No show"] }],
  },
];

/** Datasets that CAN cross-join by email. Sales Activity is aggregate (no email), so it's excluded. */
export function canCrossJoin(datasetKey: DatasetKey): boolean {
  return datasetKey !== "sales";
}
