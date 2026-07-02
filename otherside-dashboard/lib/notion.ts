// Minimal Notion API client.
// Uses the documented REST endpoint POST /v1/databases/{id}/query with
// Notion-Version 2022-06-28, handles pagination and 429 rate limiting
// per https://developers.notion.com/reference/request-limits
// (average 3 req/s per integration; on 429, respect Retry-After).

const NOTION_VERSION = "2022-06-28";
const BASE = "https://api.notion.com/v1";

function token(): string {
  const t = process.env.NOTION_TOKEN;
  if (!t) throw new Error("NOTION_TOKEN environment variable is not set");
  return t;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function notionPost(path: string, body: unknown, attempt = 0): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (res.status === 429 || res.status === 529) {
    if (attempt >= 5) throw new Error(`Notion rate limit persisted after 5 retries (${path})`);
    const retryAfter = Number(res.headers.get("Retry-After")) || 2 ** attempt;
    await sleep(retryAfter * 1000 + 250);
    return notionPost(path, body, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Notion API ${res.status} on ${path}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

/** Query every page of a database. Small pause between pages keeps us well under 3 req/s. */
export async function queryAllPages(databaseId: string): Promise<any[]> {
  const results: any[] = [];
  let cursor: string | undefined = undefined;
  do {
    const body: any = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const data = await notionPost(`/databases/${databaseId}/query`, body);
    results.push(...(data.results ?? []));
    cursor = data.has_more ? data.next_cursor : undefined;
    if (cursor) await sleep(350);
  } while (cursor);
  return results;
}

// ---------- Property extraction ----------
// Notion property names must match exactly. Two of the trackers use
// "Enr Manager " WITH a trailing space, so we resolve names by their
// trimmed form as a fallback to survive future renames.

export function prop(page: any, name: string): any {
  const props = page?.properties ?? {};
  if (props[name] !== undefined) return props[name];
  const wanted = name.trim().toLowerCase();
  for (const key of Object.keys(props)) {
    if (key.trim().toLowerCase() === wanted) return props[key];
  }
  return undefined;
}

function richTextToString(rt: any[]): string {
  if (!Array.isArray(rt)) return "";
  return rt.map((t) => t?.plain_text ?? "").join("").trim();
}

export function getTitle(page: any, name: string): string {
  const p = prop(page, name);
  return richTextToString(p?.title ?? []);
}

export function getText(page: any, name: string): string {
  const p = prop(page, name);
  if (!p) return "";
  if (p.type === "rich_text") return richTextToString(p.rich_text);
  if (p.type === "title") return richTextToString(p.title);
  if (p.type === "email") return p.email ?? "";
  if (p.type === "phone_number") return p.phone_number ?? "";
  if (p.type === "url") return p.url ?? "";
  if (p.type === "select") return p.select?.name ?? "";
  if (p.type === "status") return p.status?.name ?? "";
  return "";
}

export function getSelect(page: any, name: string): string {
  const p = prop(page, name);
  if (!p) return "";
  if (p.type === "select") return p.select?.name ?? "";
  if (p.type === "status") return p.status?.name ?? "";
  return "";
}

export function getDate(page: any, name: string): string | null {
  const p = prop(page, name);
  if (!p) return null;
  if (p.type === "date") return p.date?.start ?? null;
  if (p.type === "created_time") return p.created_time ?? null;
  if (p.type === "last_edited_time") return p.last_edited_time ?? null;
  return null;
}

/** First person's name on a people property. Requires the integration to
 *  have the "Read user information" capability, otherwise names come back empty. */
export function getPersonName(page: any, name: string): string {
  const p = prop(page, name);
  if (!p || p.type !== "people") return "";
  const person = (p.people ?? [])[0];
  return person?.name ?? "";
}

export function relationCount(page: any, name: string): number {
  const p = prop(page, name);
  if (!p || p.type !== "relation") return 0;
  return (p.relation ?? []).length;
}

/**
 * Money extractor that survives schema drift:
 *  - number property  -> the number
 *  - rich_text/title  -> parsed from strings like "$5,000.00", "5000", "5,000"
 *  - formula          -> number or parsed string result
 * Returns { value, raw }. value is null when nothing parseable exists,
 * so callers can flag it instead of silently treating it as 0.
 */
export function getMoney(page: any, name: string): { value: number | null; raw: string } {
  const p = prop(page, name);
  if (!p) return { value: null, raw: "" };

  if (p.type === "number") {
    const n = p.number;
    return { value: typeof n === "number" ? n : null, raw: n == null ? "" : String(n) };
  }
  if (p.type === "formula") {
    const f = p.formula;
    if (f?.type === "number") {
      return { value: typeof f.number === "number" ? f.number : null, raw: f.number == null ? "" : String(f.number) };
    }
    if (f?.type === "string") return parseMoneyString(f.string ?? "");
  }
  if (p.type === "rich_text") return parseMoneyString(richTextToString(p.rich_text));
  if (p.type === "title") return parseMoneyString(richTextToString(p.title));
  return { value: null, raw: "" };
}

export function parseMoneyString(raw: string): { value: number | null; raw: string } {
  const s = (raw ?? "").trim();
  if (s === "") return { value: null, raw: s };
  // Strip currency symbols, commas, spaces. Keep digits, minus, dot.
  const cleaned = s.replace(/[$€£₦,\s]/g, "");
  if (cleaned === "" || !/^-?\d*\.?\d+$/.test(cleaned)) return { value: null, raw: s };
  const n = Number(cleaned);
  return Number.isFinite(n) ? { value: n, raw: s } : { value: null, raw: s };
}

export function getNumber(page: any, name: string): number {
  const { value } = getMoney(page, name);
  return value ?? 0;
}
