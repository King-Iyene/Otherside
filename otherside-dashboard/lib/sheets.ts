import type { SheetData } from "./types";

// Reads a Google Sheet through its CSV export endpoint. This works when the
// sheet is shared as "Anyone with the link can view" — no API key needed.
// If the sheet is private, the endpoint returns an HTML login page, which we
// detect and surface as a clear error instead of garbage data.

function csvUrl(sheetId: string, gid: string): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

/** RFC-4180-ish CSV parser: handles quoted fields, embedded commas,
 *  escaped quotes ("") and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

export async function fetchChallengeSheet(): Promise<SheetData> {
  const sheetId = process.env.CHALLENGE_SHEET_ID;
  const gid = process.env.CHALLENGE_SHEET_GID || "0";
  if (!sheetId) {
    return { ok: false, error: "CHALLENGE_SHEET_ID is not set. Add it in your environment variables to activate this tab.", headers: [], rows: [] };
  }
  try {
    const res = await fetch(csvUrl(sheetId, gid), { cache: "no-store", redirect: "follow" });
    const contentType = res.headers.get("content-type") ?? "";
    const text = await res.text();
    if (!res.ok || contentType.includes("text/html") || text.trimStart().startsWith("<")) {
      return {
        ok: false,
        error: "The Google Sheet is not publicly readable. Set its sharing to 'Anyone with the link can view', or check CHALLENGE_SHEET_ID / CHALLENGE_SHEET_GID.",
        headers: [], rows: [],
      };
    }
    const grid = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
    if (grid.length === 0) return { ok: true, error: null, headers: [], rows: [] };
    const headers = grid[0].map((h, i) => (h.trim() === "" ? `Column ${i + 1}` : h.trim()));
    const rows = grid.slice(1).map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = (r[i] ?? "").trim(); });
      return obj;
    });
    return { ok: true, error: null, headers, rows };
  } catch (e: any) {
    return { ok: false, error: `Could not reach the Google Sheet: ${e?.message ?? "unknown error"}`, headers: [], rows: [] };
  }
}
