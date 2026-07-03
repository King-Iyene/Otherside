import { queryDatabase, getTitle, getEmail, getRichText, getSelect, getDate, getRelationCount } from "../notion";
import { isTestRecord } from "../testFlag";
import { applicationRowHealthChecks } from "../dataHealth";
import type { ApplicationRow, HealthFlag, SourceResult } from "../types";

const DATABASE_ID = "33ec2386-6468-8004-b411-d9243b1f17e5";
const EARNINGS_FIELD = "What is your current level of annual earnings in USD?";

export async function fetchApplications(token: string): Promise<SourceResult<ApplicationRow>> {
  const pages = await queryDatabase(DATABASE_ID, token);

  const rows: ApplicationRow[] = pages.map((page) => {
    const props = page.properties;
    const health: HealthFlag[] = [];

    const firstName = getTitle(props, "First Name");
    const email = getEmail(props, "Email");
    const dateCreated = getDate(props, "Date Created");

    if (!dateCreated) health.push({ field: "Date Created", kind: "missing_date", raw: "" });

    const annualEarnings = getSelect(props, EARNINGS_FIELD);
    health.push(...applicationRowHealthChecks({ annualEarnings }));

    return {
      id: page.id,
      url: page.url,
      isTest: isTestRecord(firstName, email),
      health,
      firstName,
      lastName: getRichText(props, "Last Name"),
      email,
      phone: getRichText(props, "Phone"),
      applicationStatus: getSelect(props, "Application Status"),
      annualEarnings,
      dateCreated,
      purchased: getRelationCount(props, "REBORN Payments Tracker") > 0,
    };
  });

  return { rows, error: null, fetchedAt: Date.now() };
}
