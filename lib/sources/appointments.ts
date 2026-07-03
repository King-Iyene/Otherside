import { queryDatabase, getTitle, getEmail, getRichText, getSelect, getDate } from "../notion";
import { isTestRecord } from "../testFlag";
import { appointmentRowHealthChecks } from "../dataHealth";
import type { AppointmentRow, HealthFlag, SourceResult } from "../types";

const DATABASE_ID = "368c2386-6468-803e-8fac-fe68a4ed8a6a";

function getStatusProp(properties: Record<string, any>, name: string): string | null {
  return getSelect(properties, name);
}

export async function fetchAppointments(token: string): Promise<SourceResult<AppointmentRow>> {
  const pages = await queryDatabase(DATABASE_ID, token);

  const rows: AppointmentRow[] = pages.map((page) => {
    const props = page.properties;
    const health: HealthFlag[] = [];

    const name = getTitle(props, "Name");
    const email = getEmail(props, "Email");
    const appointmentTime = getDate(props, "Appointment Time");

    if (!appointmentTime) health.push({ field: "Appointment Time", kind: "missing_date", raw: "" });

    const status = getStatusProp(props, "Appointment Status");
    const cohort = getSelect(props, "Cohort");
    const enrManager = getRichText(props, "Enr Manager ");

    // Extended per-row checks
    health.push(...appointmentRowHealthChecks({ cohort, enrManager, status, appointmentTime }));

    return {
      id: page.id,
      url: page.url,
      isTest: isTestRecord(name, email),
      health,
      name,
      email,
      phone: getRichText(props, "Phone"),
      appointmentTime,
      created: getDate(props, "Created"),
      status,
      appointmentType: getSelect(props, "Appointment Type"),
      cohort,
      calendar: getRichText(props, "Calendar"),
      enrManager,
      ghlAppointmentId: getRichText(props, "GHL Appointment ID"),
      notes: getRichText(props, "Notes"),
    };
  });

  return { rows, error: null, fetchedAt: Date.now() };
}
