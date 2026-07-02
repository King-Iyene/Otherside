import {
  getTitle, getText, getSelect, getDate, getMoney, getNumber,
  getPersonName, relationCount,
} from "./notion";
import type {
  CashRow, AppointmentRow, ApplicationRow, SalesActivityRow, HealthFlag,
} from "./types";

// Test-record rule: internal systems email or "King Test" names.
// Rows are kept and flagged (never deleted) — the UI excludes them by
// default with a visible toggle, so totals are honest either way.
const TEST_EMAIL = "systems@joinotherside.com";
function isTestRecord(name: string, email: string): boolean {
  const n = (name ?? "").toLowerCase();
  const e = (email ?? "").toLowerCase();
  return e === TEST_EMAIL || n.startsWith("king test");
}

export function transformCash(pages: any[], health: HealthFlag[]): CashRow[] {
  return pages.map((page) => {
    const name = getTitle(page, "Name");
    const email = getText(page, "Email");
    const revenue = getMoney(page, "Revenue");
    const cash = getMoney(page, "Cash Collected");
    const enrollmentDate = getDate(page, "Enrollment Date");

    if (revenue.raw !== "" && revenue.value === null)
      health.push({ dataset: "Cash", row: name || page.id, issue: `Revenue "${revenue.raw}" could not be read as a number` });
    if (cash.raw !== "" && cash.value === null)
      health.push({ dataset: "Cash", row: name || page.id, issue: `Cash Collected "${cash.raw}" could not be read as a number` });
    if (!enrollmentDate)
      health.push({ dataset: "Cash", row: name || page.id, issue: "Missing Enrollment Date — excluded from time charts" });

    const balance =
      revenue.value !== null && cash.value !== null ? revenue.value - cash.value : null;

    return {
      id: page.id,
      name,
      email,
      product: getText(page, "Product"),
      cohort: getSelect(page, "Cohort"),
      enrollmentDate,
      revenue: revenue.value,
      cashCollected: cash.value,
      revenueRaw: revenue.raw,
      cashCollectedRaw: cash.raw,
      balance,
      couponCode: getText(page, "Coupon Code"),
      paymentMethod: getText(page, "Payment Method"),
      nextPaymentDate: getDate(page, "Date of Next Payment"),
      enrManager: getText(page, "Enr Manager"),
      note: getText(page, "Note"),
      isTest: isTestRecord(name, email),
    };
  });
}

export function transformAppointments(pages: any[], health: HealthFlag[]): AppointmentRow[] {
  return pages.map((page) => {
    const name = getTitle(page, "Name");
    const email = getText(page, "Email");
    const appointmentTime = getDate(page, "Appointment Time");
    if (!appointmentTime)
      health.push({ dataset: "Appointments", row: name || page.id, issue: "Missing Appointment Time" });
    return {
      id: page.id,
      name,
      email,
      phone: getText(page, "Phone"),
      appointmentTime,
      created: getDate(page, "Created"),
      status: getSelect(page, "Appointment Status"),
      type: getSelect(page, "Appointment Type"),
      cohort: getSelect(page, "Cohort"),
      calendar: getText(page, "Calendar"),
      enrManager: getText(page, "Enr Manager"),
      notes: getText(page, "Notes"),
      isTest: isTestRecord(name, email),
    };
  });
}

export function transformApplications(pages: any[], _health: HealthFlag[]): ApplicationRow[] {
  return pages.map((page) => {
    const firstName = getTitle(page, "First Name");
    const lastName = getText(page, "Last Name");
    const email = getText(page, "Email");
    return {
      id: page.id,
      firstName,
      lastName,
      email,
      phone: getText(page, "Phone"),
      status: getSelect(page, "Application Status"),
      incomeBand: getSelect(page, "What is your current level of annual earnings in USD?"),
      dateCreated: getDate(page, "Date Created"),
      hasPayment: relationCount(page, "REBORN Payments Tracker") > 0,
      isTest: isTestRecord(`${firstName} ${lastName}`, email),
    };
  });
}

export function transformSalesActivity(pages: any[], health: HealthFlag[]): SalesActivityRow[] {
  return pages.map((page) => {
    const entry = getTitle(page, "Entry");
    const closer = getPersonName(page, "Enr Manager");
    const date = getDate(page, "Date");
    if (!closer)
      health.push({ dataset: "Sales Activity", row: entry || page.id, issue: "Closer name unavailable — check the integration's 'Read user information' capability or the Enr Manager field" });
    if (!date)
      health.push({ dataset: "Sales Activity", row: entry || page.id, issue: "Missing Date" });
    const cashOnCall = getMoney(page, "Cash Collected on Call");
    const salesRev = getMoney(page, "Sales in Revenue");
    return {
      id: page.id,
      entry,
      date,
      closer,
      launch: getSelect(page, "Launch"),
      newCalls: getNumber(page, "New Calls in Calendar"),
      cancelled: getNumber(page, "Cancelled Calls"),
      rescheduled: getNumber(page, "Rescheduled"),
      noShow: getNumber(page, "No Show"),
      showed: getNumber(page, "Showed to Call"),
      offersMade: getNumber(page, "Offers Made"),
      salesMade: getNumber(page, "Sales Made"),
      paidInFull: getNumber(page, "Paid in Full Sold"),
      paymentPlans: getNumber(page, "Payment Plans Sold"),
      followUpCalls: getNumber(page, "Follow Up Calls"),
      followUpScheduled: getNumber(page, "Follow Up Call Scheduled"),
      cashCollectedOnCall: cashOnCall.value,
      salesInRevenue: salesRev.value,
      isTest: entry.toLowerCase().includes("king test"),
    };
  });
}
