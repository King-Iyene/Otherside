import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, authConfigured, roleForToken } from "@/lib/auth";

/**
 * Returns the current viewer's role (derived server-side from the httpOnly
 * session cookie) so the dashboard can render only that role's tabs. When no gate
 * is configured, everyone is treated as full-access `oliver`.
 */
export async function GET(request: NextRequest) {
  if (!authConfigured()) {
    return NextResponse.json({ role: "oliver", names: ["Oliver"] });
  }
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const entry = await roleForToken(token);
  if (!entry) return NextResponse.json({ role: null }, { status: 401 });
  return NextResponse.json({ role: entry.role, names: entry.names });
}
