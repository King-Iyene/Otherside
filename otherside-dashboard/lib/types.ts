// Normalized row shapes for every data source.
// Every money field keeps both the parsed number and the raw value so
// nothing is ever silently dropped — unparseable values are flagged.

export interface HealthFlag {
  dataset: string;
  row: string; // human-readable identifier (name/entry)
  issue: string;
}

export interface CashRow {
  id: string;
  name: string;
  email: string;
  product: string;
  cohort: string;
  enrollmentDate: string | null; // ISO
  revenue: number | null;
  cashCollected: number | null;
  revenueRaw: string;
  cashCollectedRaw: string;
  balance: number | null; // revenue - cashCollected when both parse
  couponCode: string;
  paymentMethod: string;
  nextPaymentDate: string | null;
  enrManager: string;
  note: string;
  isTest: boolean;
}

export interface AppointmentRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  appointmentTime: string | null;
  created: string | null;
  status: string;
  type: string;
  cohort: string;
  calendar: string;
  enrManager: string;
  notes: string;
  isTest: boolean;
}

export interface ApplicationRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: string;
  incomeBand: string;
  dateCreated: string | null;
  hasPayment: boolean; // linked to REBORN Payments Tracker
  isTest: boolean;
}

export interface SalesActivityRow {
  id: string;
  entry: string;
  date: string | null;
  closer: string;
  launch: string;
  newCalls: number;
  cancelled: number;
  rescheduled: number;
  noShow: number;
  showed: number;
  offersMade: number;
  salesMade: number;
  paidInFull: number;
  paymentPlans: number;
  followUpCalls: number;
  followUpScheduled: number;
  cashCollectedOnCall: number | null;
  salesInRevenue: number | null;
  isTest: boolean;
}

export interface SheetData {
  ok: boolean;
  error: string | null;
  headers: string[];
  rows: Record<string, string>[];
}

export interface DashboardData {
  fetchedAt: string;
  cash: CashRow[];
  appointments: AppointmentRow[];
  applications: ApplicationRow[];
  salesActivity: SalesActivityRow[];
  challengeSheet: SheetData;
  health: HealthFlag[];
  errors: { dataset: string; message: string }[];
}
