import { NotionPage } from "./notion";

const NOTION_VERSION = "2022-06-28";

export interface NotionAccessInfo {
  bot: {
    id: string | null;
    name: string | null;
    workspaceName: string | null;
    workspaceId: string | null;
    ownerType: string | null;
  } | null;
  accessible: {
    pages: number;
    databases: number;
    databaseTitles: string[];
    samplePageTitles: string[];
  };
  targets: TargetProbeResult[];
  tokenError: string | null;
}

export interface TargetProbeResult {
  label: string;
  databaseId: string;
  ok: boolean;
  errorCode: string | null;
  errorMessage: string | null;
}

const TARGET_DATABASES: { label: string; id: string }[] = [
  { label: "Reborn Cash Tracker", id: "367c2386-6468-80af-bbe1-d5f6d2510876" },
  { label: "Appointments Tracker", id: "368c2386-6468-803e-8fac-fe68a4ed8a6a" },
  { label: "REBORN Application Tracker", id: "33ec2386-6468-8004-b411-d9243b1f17e5" },
  { label: "Sales Activity Tracker Daily Inputs", id: "25ac2fe5-3b3e-450b-bf9f-4a485cf6a410" },
];

async function notionRequest(url: string, method: "GET" | "POST", body?: unknown): Promise<Response> {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("NOTION_TOKEN not configured on the server.");
  return fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
}

async function getBotIdentity(): Promise<NotionAccessInfo["bot"] | null> {
  const res = await notionRequest("https://api.notion.com/v1/users/me", "GET");
  if (!res.ok) return null;
  const json: any = await res.json();
  const bot = json?.bot ?? {};
  const workspaceName = bot.workspace_name ?? bot.workspace_id ?? null;
  return {
    id: json?.id ?? null,
    name: json?.name ?? null,
    workspaceName,
    workspaceId: bot.workspace_id ?? null,
    ownerType: bot.owner?.type ?? null,
  };
}

async function listAccessible(): Promise<NotionAccessInfo["accessible"]> {
  const dbRes = await notionRequest("https://api.notion.com/v1/search", "POST", {
    filter: { property: "object", value: "database" },
    page_size: 100,
  });
  const dbJson: any = dbRes.ok ? await dbRes.json() : { results: [] };
  const databases: NotionPage[] = dbJson.results ?? [];
  const databaseTitles = databases
    .map((d: any) => d?.title?.map?.((t: any) => t.plain_text).join("") || "(untitled)")
    .filter(Boolean);

  const pageRes = await notionRequest("https://api.notion.com/v1/search", "POST", {
    filter: { property: "object", value: "page" },
    page_size: 25,
  });
  const pageJson: any = pageRes.ok ? await pageRes.json() : { results: [] };
  const samplePageTitles = (pageJson.results ?? [])
    .slice(0, 15)
    .map((p: any) => {
      const props = p?.properties || {};
      for (const key of Object.keys(props)) {
        const prop = props[key];
        if (prop?.type === "title") {
          return (prop.title || []).map((t: any) => t.plain_text).join("") || "(untitled)";
        }
      }
      return p?.id || "(no title)";
    });

  return {
    pages: pageJson.results?.length ?? 0,
    databases: databases.length,
    databaseTitles,
    samplePageTitles,
  };
}

async function probeTargets(): Promise<TargetProbeResult[]> {
  const results: TargetProbeResult[] = [];
  for (const target of TARGET_DATABASES) {
    try {
      const res = await notionRequest(`https://api.notion.com/v1/databases/${target.id}`, "GET");
      if (res.ok) {
        results.push({ label: target.label, databaseId: target.id, ok: true, errorCode: null, errorMessage: null });
      } else {
        const json: any = await res.json().catch(() => ({}));
        results.push({
          label: target.label,
          databaseId: target.id,
          ok: false,
          errorCode: json?.code || String(res.status),
          errorMessage: json?.message || `HTTP ${res.status}`,
        });
      }
    } catch (err: any) {
      results.push({
        label: target.label,
        databaseId: target.id,
        ok: false,
        errorCode: "fetch_failed",
        errorMessage: err?.message || "Unknown error",
      });
    }
  }
  return results;
}

export async function collectNotionDiagnostics(): Promise<NotionAccessInfo> {
  if (!process.env.NOTION_TOKEN) {
    return {
      bot: null,
      accessible: { pages: 0, databases: 0, databaseTitles: [], samplePageTitles: [] },
      targets: TARGET_DATABASES.map((t) => ({
        label: t.label,
        databaseId: t.id,
        ok: false,
        errorCode: "no_token",
        errorMessage: "NOTION_TOKEN environment variable is not set on the server.",
      })),
      tokenError: "NOTION_TOKEN is not configured on the server.",
    };
  }

  try {
    const [bot, accessible, targets] = await Promise.all([
      getBotIdentity().catch(() => null),
      listAccessible().catch(() => ({ pages: 0, databases: 0, databaseTitles: [], samplePageTitles: [] })),
      probeTargets(),
    ]);
    return { bot, accessible, targets, tokenError: null };
  } catch (err: any) {
    return {
      bot: null,
      accessible: { pages: 0, databases: 0, databaseTitles: [], samplePageTitles: [] },
      targets: [],
      tokenError: err?.message || "Unknown error while probing Notion.",
    };
  }
}
