import { parseMoney } from "./money";

const NOTION_VERSION = "2022-06-28";
const PAGE_PAUSE_MS = 350;
const MAX_RETRIES = 5;

export interface NotionPage {
  id: string;
  url?: string;
  properties: Record<string, any>;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function notionFetch(url: string, body: unknown, token: string): Promise<any> {
  if (!token) {
    throw new Error("No Notion access token available (neither OAuth cookie nor NOTION_TOKEN env var is set).");
  }

  let attempt = 0;
  for (;;) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (res.status === 429 || res.status === 529) {
      attempt++;
      if (attempt > MAX_RETRIES) {
        throw new Error(`Notion API rate limited after ${MAX_RETRIES} retries (status ${res.status}).`);
      }
      const retryAfter = Number(res.headers.get("Retry-After"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * attempt;
      await sleep(waitMs);
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Notion API error ${res.status}: ${text.slice(0, 300)}`);
    }

    return res.json();
  }
}

/** Queries a full Notion database, following pagination cursors with a rate-limit pause. */
export async function queryDatabase(
  databaseId: string,
  token: string,
  baseBody: Record<string, unknown> = {}
): Promise<NotionPage[]> {
  const url = `https://api.notion.com/v1/databases/${databaseId}/query`;
  const pages: NotionPage[] = [];
  let cursor: string | undefined;
  let first = true;

  do {
    if (!first) await sleep(PAGE_PAUSE_MS);
    first = false;

    const body = { ...baseBody, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) };
    const json = await notionFetch(url, body, token);
    pages.push(...json.results);
    cursor = json.has_more ? json.next_cursor : undefined;
  } while (cursor);

  return pages;
}

/** Looks up a property by name, falling back to a trimmed/lowercased match. */
export function getProp(properties: Record<string, any>, name: string): any {
  if (name in properties) return properties[name];
  const target = name.trim().toLowerCase();
  for (const key of Object.keys(properties)) {
    if (key.trim().toLowerCase() === target) return properties[key];
  }
  return undefined;
}

export function getTitle(properties: Record<string, any>, name: string): string {
  const prop = getProp(properties, name);
  if (!prop || prop.type !== "title") return "";
  return (prop.title || []).map((t: any) => t.plain_text).join("").trim();
}

export function getRichText(properties: Record<string, any>, name: string): string | null {
  const prop = getProp(properties, name);
  if (!prop) return null;
  if (prop.type === "rich_text") {
    const text = (prop.rich_text || []).map((t: any) => t.plain_text).join("").trim();
    return text || null;
  }
  if (prop.type === "email") return prop.email || null;
  if (prop.type === "phone_number") return prop.phone_number || null;
  if (prop.type === "url") return prop.url || null;
  return null;
}

/**
 * Read an email property and normalize it. RFC 5321 says the local part is
 * technically case-sensitive but every real-world mail server treats
 * `Foo@x.com` and `foo@x.com` as the same address — treating them as separate
 * people splits every join and inflates counts. We normalize at the read
 * boundary so downstream code doesn't have to remember.
 */
export function getEmail(properties: Record<string, any>, name: string): string | null {
  const prop = getProp(properties, name);
  if (!prop) return null;
  const raw = prop.type === "email" ? prop.email : getRichText(properties, name);
  if (!raw) return null;
  return String(raw).trim().toLowerCase() || null;
}

export function getSelect(properties: Record<string, any>, name: string): string | null {
  const prop = getProp(properties, name);
  if (!prop) return null;
  if (prop.type === "select") return prop.select?.name ?? null;
  if (prop.type === "status") return prop.status?.name ?? null;
  return null;
}

export function getDate(properties: Record<string, any>, name: string): string | null {
  const prop = getProp(properties, name);
  if (!prop) return null;
  if (prop.type === "date") return prop.date?.start ?? null;
  if (prop.type === "created_time") return prop.created_time ?? null;
  return null;
}

export function getCheckbox(properties: Record<string, any>, name: string): boolean {
  const prop = getProp(properties, name);
  return !!(prop && prop.type === "checkbox" && prop.checkbox);
}

export function getRelationCount(properties: Record<string, any>, name: string): number {
  const prop = getProp(properties, name);
  if (!prop) return 0;
  if (prop.type === "relation") return (prop.relation || []).length;
  if (prop.type === "rollup" && prop.rollup?.type === "array") return (prop.rollup.array || []).length;
  return 0;
}

export function getPerson(properties: Record<string, any>, name: string): string | null {
  const prop = getProp(properties, name);
  if (!prop) return null;
  if (prop.type === "people") {
    const names = (prop.people || []).map((p: any) => p.name).filter(Boolean);
    return names.length ? names.join(", ") : null;
  }
  return null;
}

/**
 * Extracts a raw string/number representation of a property for money parsing,
 * handling number, formula(number|string), and rich_text shapes.
 */
function rawMoneyValue(prop: any): unknown {
  if (!prop) return null;
  if (prop.type === "number") return prop.number;
  if (prop.type === "formula") {
    if (prop.formula?.type === "number") return prop.formula.number;
    if (prop.formula?.type === "string") return prop.formula.string;
    return null;
  }
  if (prop.type === "rich_text") {
    return (prop.rich_text || []).map((t: any) => t.plain_text).join("").trim();
  }
  return null;
}

export interface MoneyResult {
  value: number | null;
  raw: string;
}

export function getMoney(properties: Record<string, any>, name: string): MoneyResult {
  const prop = getProp(properties, name);
  const raw = rawMoneyValue(prop);
  const rawStr = raw === null || raw === undefined ? "" : String(raw);
  return { value: parseMoney(raw), raw: rawStr };
}

export function getPlainNumber(properties: Record<string, any>, name: string): number | null {
  const prop = getProp(properties, name);
  if (!prop) return null;
  if (prop.type === "number") return typeof prop.number === "number" ? prop.number : null;
  if (prop.type === "formula" && prop.formula?.type === "number") return prop.formula.number ?? null;
  return null;
}
