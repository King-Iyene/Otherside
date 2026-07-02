import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function resolveRedirectUri(request: NextRequest): string {
  const configured = process.env.NOTION_OAUTH_REDIRECT_URI;
  if (configured) return configured;
  // Fall back to constructing from the current request origin (Vercel provides host header).
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const host = request.headers.get("host");
  return `${proto}://${host}/api/notion/callback`;
}

export async function GET(request: NextRequest) {
  const clientId = process.env.NOTION_OAUTH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      {
        error:
          "NOTION_OAUTH_CLIENT_ID is not set. Create a Public integration at notion.so/profile/integrations and add the client ID to Vercel env vars.",
      },
      { status: 500 }
    );
  }

  const redirectUri = resolveRedirectUri(request);
  const nextPath = request.nextUrl.searchParams.get("next") || "/";

  const authUrl = new URL("https://api.notion.com/v1/oauth/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("owner", "user");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", encodeURIComponent(nextPath));

  return NextResponse.redirect(authUrl.toString());
}
