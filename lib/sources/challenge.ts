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

export async function fetchChallengeSheet(): Promise<SourceResult<ChallengeRow> & { columns: string[] }> {
  const sheetId = process.env.CHALLENGE_SHEET_ID || "1mJ3DLye8otnjs2CbUganWGNQbciBssZFHEFusoGQFpc";
  const gid = process.env.CHALLENGE_SHEET_GID || "0";
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();

  const trimmedStart = text.trimStart().slice(0, 200).toLowerCase();
  if (trimmedStart.startsWith("<!doctype html") || trimmedStart.startsWith("<html")) {
    throw new Error(
      "Google Sheet returned an HTML login page instead of CSV. Make sure the sheet is shared as \"Anyone with the link can view\"."
    );
  }

  const table = parseCsv(text).filter((r) => r.some((cell) => cell.trim() !== ""));
  if (table.length === 0) {
    return { rows: [], error: null, fetchedAt: Date.now(), columns: [] };
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

  return { rows, error: null, fetchedAt: Date.now(), columns: headers };
}
