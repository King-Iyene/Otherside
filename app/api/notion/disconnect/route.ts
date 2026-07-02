import { NextRequest, NextResponse } from "next/server";
import { NOTION_META_COOKIE, NOTION_OAUTH_COOKIE } from "@/lib/notionAuth";

export const dynamic = "force-dynamic";

async function clear(request: NextRequest) {
  const res = NextResponse.json({ ok: true });
  const expire = { path: "/", maxAge: 0 };
  res.cookies.set(NOTION_OAUTH_COOKIE, "", expire);
  res.cookies.set(NOTION_META_COOKIE, "", expire);
  return res;
}

export async function POST(request: NextRequest) {
  return clear(request);
}

export async function GET(request: NextRequest) {
  return clear(request);
}
