import { parseMoney } from "../money";
import { isTestRecord } from "../testFlag";
import type { ChallengeRow, HealthFlag, SourceResult } from "../types";

/** Minimal RFC4180 CSV parser: handles quoted fields, embedded commas/newlines, and "" escapes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // skip, \n handles the row break
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export const MONEY_HEADER_PATTERN = /(cash|revenue|balance|paid|price|amount|\$)/i;
export const DATE_HEADER_PATTERN = /(date|created|enrolled|time)/i;

function looksLikeHtml(text: string): boolean {
  const start = text.trimStart().slice(0, 200).toLowerCase();
  return start.startsWith("<!doctype html") || start.startsWith("<html");
}

interface CsvAttempt {
  text: string;
  status: number;
  redirectedToLogin: boolean;
}

async function tryFetchCsv(url: string): Promise<CsvAttempt> {
  const res = await fetch(url, { cache: "no-store", redirect: "follow" });
  const text = await res.text();
  const redirectedToLogin = res.url.includes("accounts.google.com") || res.url.includes("ServiceLogin");
  return { text, status: res.status, redirectedToLogin };
}

/**
 * Tries the standard CSV export endpoint first, then falls back to the gviz query
 * endpoint (Google sometimes serves one but not the other depending on sheet
 * config), before giving up with a diagnostic error.
 */
async function fetchCsvWithFallback(sheetId: string, gid: string): Promise<string> {
  const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;

  const attempts: { label: string; result: CsvAttempt }[] = [];

  const first = await tryFetchCsv(exportUrl);
  attempts.push({ label: "export", result: first });
  if (first.status === 200 && !looksLikeHtml(first.text) && !first.redirectedToLogin) {
    return first.text;
  }

  const second = await tryFetchCsv(gvizUrl);
  attempts.push({ label: "gviz", result: second });
  if (second.status === 200 && !looksLikeHtml(second.text) && !second.redirectedToLogin) {
    return second.text;
  }

  const detail = attempts
    .map((a) => `${a.label}: HTTP ${a.result.status}${a.result.redirectedToLogin ? " (redirected to Google login)" : ""}`)
    .join("; ");

  throw new Error(
    `Google Sheet ${sheetId} (gid ${gid}) did not return CSV data from either endpoint (${detail}). ` +
      `This almost always means the sheet isn't actually public: open it, click Share, and confirm ` +
      `"General access" says "Anyone with the link" (globe icon) — not "Anyone at [your domain]" or "Restricted". ` +
      `If your Google Workspace admin has disabled external link-sharing org-wide, individual files can't override ` +
      `that policy; use File → Share → "Publish to web" instead (a separate, always-public mechanism) and point ` +
      `CHALLENGE_SHEET_ID/CHALLENGE_SHEET_GID at that published sheet, or ask an admin to allow external sharing.`
  );
}

export async function fetchChallengeSheet(): Promise<
  SourceResult<ChallengeRow> & { columns: string[]; gid: string; sheetUrl: string }
> {
  const sheetId = process.env.CHALLENGE_SHEET_ID || "1mJ3DLye8otnjs2CbUganWGNQbciBssZFHEFusoGQFpc";
  // Registrations live on the "1216509445" tab of the workbook (gid 0 is a
  // separate tracking/test tab). Override with CHALLENGE_SHEET_GID if your
  // data moves. The Challenge tab shows which gid is actually loaded, so a
  // wrong env value is visible rather than silent.
  const gid = process.env.CHALLENGE_SHEET_GID || "1216509445";
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=${gid}`;
  const text = await fetchCsvWithFallback(sheetId, gid);

  const table = parseCsv(text).filter((r) => r.some((cell) => cell.trim() !== ""));
  if (table.length === 0) {
    return { rows: [], error: null, fetchedAt: Date.now(), columns: [], gid, sheetUrl };
  }

  const headers = table[0].map((h) => h.trim());
  const dataRows = table.slice(1);

  const nameColIdx = headers.findIndex((h) => /name/i.test(h));
  const emailColIdx = headers.findIndex((h) => /email/i.test(h));

  const rows: ChallengeRow[] = dataRows.map((cells, idx) => {
    const health: HealthFlag[] = [];
    const record: ChallengeRow = { id: `row-${idx}`, isTest: false, health };

    headers.forEach((header, colIdx) => {
      const raw = (cells[colIdx] ?? "").trim();
      if (MONEY_HEADER_PATTERN.test(header)) {
        const parsed = parseMoney(raw);
        record[header] = parsed;
        if (raw && parsed === null) {
          health.push({ field: header, kind: "unparseable_money", raw });
        }
      } else if (DATE_HEADER_PATTERN.test(header)) {
        record[header] = raw || null;
        if (!raw) health.push({ field: header, kind: "missing_date", raw: "" });
      } else {
        record[header] = raw;
      }
    });

    const name = nameColIdx >= 0 ? cells[nameColIdx] : "";
    const email = emailColIdx >= 0 ? cells[emailColIdx] : "";
    record.isTest = isTestRecord(name, email);
    record.health = health;
    return record;
  });

  return { rows, error: null, fetchedAt: Date.now(), columns: headers, gid, sheetUrl };
}
