import { NextRequest, NextResponse } from "next/server";
import { NOTION_META_COOKIE, NOTION_OAUTH_COOKIE, type OAuthMeta } from "@/lib/notionAuth";

export const dynamic = "force-dynamic";

function resolveRedirectUri(request: NextRequest): string {
  const configured = process.env.NOTION_OAUTH_REDIRECT_URI;
  if (configured) return configured;
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const host = request.headers.get("host");
  return `${proto}://${host}/api/notion/callback`;
}

export async function GET(request: NextRequest) {
  const clientId = process.env.NOTION_OAUTH_CLIENT_ID;
  const clientSecret = process.env.NOTION_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "OAuth env vars missing." }, { status: 500 });
  }

  const url = request.nextUrl;
  const error = url.searchParams.get("error");
  if (error) {
    return NextResponse.redirect(new URL(`/?notion_error=${encodeURIComponent(error)}`, request.url));
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/?notion_error=missing_code", request.url));
  }

  const redirectUri = resolveRedirectUri(request);
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const tokenRes = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
    cache: "no-store",
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => "");
    return NextResponse.redirect(
      new URL(`/?notion_error=${encodeURIComponent(`token_exchange_failed: ${text.slice(0, 200)}`)}`, request.url)
    );
  }

  const tokenJson: any = await tokenRes.json();
  const accessToken: string | undefined = tokenJson.access_token;
  if (!accessToken) {
    return NextResponse.redirect(new URL("/?notion_error=no_access_token", request.url));
  }

  const meta: OAuthMeta = {
    workspaceName: tokenJson.workspace_name,
    workspaceIcon: tokenJson.workspace_icon,
    botId: tokenJson.bot_id,
    ownerName: tokenJson.owner?.user?.name || tokenJson.owner?.user?.person?.email,
    connectedAt: Date.now(),
  };

  const nextPath = url.searchParams.get("state")
    ? decodeURIComponent(url.searchParams.get("state") as string)
    : "/";
  const redirect = NextResponse.redirect(new URL(nextPath, request.url));

  const cookieOpts = {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };

  redirect.cookies.set(NOTION_OAUTH_COOKIE, accessToken, cookieOpts);
  redirect.cookies.set(NOTION_META_COOKIE, encodeURIComponent(JSON.stringify(meta)), {
    ...cookieOpts,
    httpOnly: false, // meta is safe to expose to JS (workspace name, timestamps)
  });

  return redirect;
}
