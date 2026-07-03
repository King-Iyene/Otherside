export type HealthFlagKind =
  | "unparseable_money"
  | "missing_date"
  | "missing_value"
  | "missing_cohort"
  | "inconsistent_cohort"
  | "missing_closer"
  | "duplicate_email_in_cash"
  | "duplicate_application"
  | "duplicate_challenge_registration"
  | "zero_revenue_enrollment"
  | "cash_gt_revenue"
  | "outstanding_no_next_payment"
  | "showed_no_status"
  | "missing_income_bracket";

export type HealthFlag = {
  field: string;
  kind: HealthFlagKind;
  raw: string;
  /** Optional short human explanation shown in the data-health tooltip. */
  hint?: string;
};

export interface BaseRow {
  id: string;
  isTest: boolean;
  health: HealthFlag[];
  url?: string;
}

export interface CashRow extends BaseRow {
  name: string;
  email: string | null;
  product: string | null;
  cohort: string | null;
  enrollmentDate: string | null;
  revenue: number | null;
  cashCollected: number | null;
  balance: number | null;
  couponCode: string | null;
  paymentMethod: string | null;
  nextPaymentDate: string | null;
  enrManager: string | null;
  note: string | null;
}

export interface AppointmentRow extends BaseRow {
  name: string;
  email: string | null;
  phone: string | null;
  appointmentTime: string | null;
  created: string | null;
  status: string | null;
  appointmentType: string | null;
  cohort: string | null;
  calendar: string | null;
  enrManager: string | null;
  ghlAppointmentId: string | null;
  notes: string | null;
}

export interface ApplicationRow extends BaseRow {
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  applicationStatus: string | null;
  annualEarnings: string | null;
  dateCreated: string | null;
  purchased: boolean;
}

export interface SalesActivityRow extends BaseRow {
  entry: string;
  date: string | null;
  enrManager: string | null;
  launch: string | null;
  newCalls: number | null;
  cancelledCalls: number | null;
  rescheduled: number | null;
  noShow: number | null;
  showed: number | null;
  offersMade: number | null;
  salesMade: number | null;
  paidInFull: number | null;
  paymentPlans: number | null;
  followUpCalls: number | null;
  followUpScheduled: number | null;
  cashCollectedOnCall: number | null;
  salesRevenue: number | null;
}

export interface ChallengeRow extends BaseRow {
  [key: string]: any;
}

export interface SourceResult<T> {
  rows: T[];
  error: string | null;
  fetchedAt: number;
}

export interface DashboardPayload {
  cash: SourceResult<CashRow>;
  appointments: SourceResult<AppointmentRow>;
  applications: SourceResult<ApplicationRow>;
  salesActivity: SourceResult<SalesActivityRow>;
  challenge: SourceResult<ChallengeRow> & { columns: string[] };
  generatedAt: number;
}
