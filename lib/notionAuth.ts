import type { NextRequest } from "next/server";
import { cookies } from "next/headers";

export const NOTION_OAUTH_COOKIE = "notion_oauth";
export const NOTION_META_COOKIE = "notion_oauth_meta";

export interface OAuthMeta {
  workspaceName?: string;
  workspaceIcon?: string;
  botId?: string;
  ownerName?: string;
  connectedAt?: number;
}

/**
 * Returns the Notion access token to use for this request:
 *   1. OAuth cookie (user connected their own account) — always wins
 *   2. NOTION_TOKEN env var — the workspace-scoped integration fallback
 *   3. null if neither is available
 * The `authMode` tells callers which one won so the UI can display it.
 */
export interface ResolvedToken {
  token: string | null;
  authMode: "oauth" | "env" | "none";
  meta: OAuthMeta | null;
}

function readMeta(raw: string | undefined): OAuthMeta | null {
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw)) as OAuthMeta;
  } catch {
    return null;
  }
}

/** For route handlers / server components that use next/headers cookies(). */
export function resolveTokenFromCookieStore(): ResolvedToken {
  const store = cookies();
  const oauth = store.get(NOTION_OAUTH_COOKIE)?.value;
  const meta = readMeta(store.get(NOTION_META_COOKIE)?.value);
  if (oauth) return { token: oauth, authMode: "oauth", meta };
  const env = process.env.NOTION_TOKEN;
  if (env) return { token: env, authMode: "env", meta: null };
  return { token: null, authMode: "none", meta: null };
}

/** For middleware / API routes that only have a NextRequest. */
export function resolveTokenFromRequest(request: NextRequest): ResolvedToken {
  const oauth = request.cookies.get(NOTION_OAUTH_COOKIE)?.value;
  const meta = readMeta(request.cookies.get(NOTION_META_COOKIE)?.value);
  if (oauth) return { token: oauth, authMode: "oauth", meta };
  const env = process.env.NOTION_TOKEN;
  if (env) return { token: env, authMode: "env", meta: null };
  return { token: null, authMode: "none", meta: null };
}
