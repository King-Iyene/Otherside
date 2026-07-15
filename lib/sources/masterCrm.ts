import {
  queryDatabase,
  getTitle,
  getEmail,
  getSelect,
  getDate,
  getCheckbox,
  getPlainNumber,
  getRollupDate,
  getRollupText,
  getRichText,
} from "../notion";
import { isTestRecord } from "../testFlag";
import type { MasterCrmRow, SourceResult } from "../types";

const DATABASE_ID = "2d03c7d4-85e7-4808-a3d9-028e8acacf89";

export async function fetchMasterCrm(token: string): Promise<SourceResult<MasterCrmRow>> {
  const pages = await queryDatabase(DATABASE_ID, token);

  const rows: MasterCrmRow[] = pages.map((page) => {
    const props = page.properties;

    const name = getTitle(props, "Name");
    const email = getEmail(props, "Email");

    return {
      id: page.id,
      url: page.url,
      isTest: isTestRecord(name, email),
      health: [],
      name,
      email,
      totalRevenue: getPlainNumber(props, "Total Revenue"),
      totalCashCollected: getPlainNumber(props, "Total Cash Collected"),
      enrollmentDate: getRollupDate(props, "Enrollment Date"),
      lastPaymentDate: getRollupDate(props, "Last Payment Date"),
      nextPaymentDate: getDate(props, "Date of Next Payment"),
      paymentCount: getPlainNumber(props, "Payment Count"),
      cohort: getRollupText(props, "Cohort"),
      product: getRollupText(props, "Product"),
      adjustmentType: (getSelect(props, "Adjustment Type") as MasterCrmRow["adjustmentType"]) ?? null,
      referredByEmail: getEmail(props, "Referred By (Email)"),
      note: getRichText(props, "Note"),
      agreementSigned: getCheckbox(props, "Agreement Signed?"),
      intakeFormSubmitted: getCheckbox(props, "Intake Form Submitted?"),
      invitedToCircle: getCheckbox(props, "Invited to Circle?"),
      joinedCircle: getCheckbox(props, "Actually Joined Circle?"),
      addedToKickoff: getCheckbox(props, "Added to Kickoff Call?"),
      addedToPod: getCheckbox(props, "Added to Pod?"),
      exitFormSubmitted: getCheckbox(props, "Exit Form Submitted?"),
    };
  });

  return { rows, error: null, fetchedAt: Date.now() };
}
