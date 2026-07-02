import { queryDatabase, getTitle, getEmail, getRichText, getSelect, getDate } from "../notion";
import { isTestRecord } from "../testFlag";
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
      status: getStatusProp(props, "Appointment Status"),
      appointmentType: getSelect(props, "Appointment Type"),
      cohort: getSelect(props, "Cohort"),
      calendar: getRichText(props, "Calendar"),
      enrManager: getRichText(props, "Enr Manager "),
      ghlAppointmentId: getRichText(props, "GHL Appointment ID"),
      notes: getRichText(props, "Notes"),
    };
  });

  return { rows, error: null, fetchedAt: Date.now() };
}
