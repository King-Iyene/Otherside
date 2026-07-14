import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, getRoleAccess, sessionToken } from "@/lib/auth";

/**
 * Password → role. Each role has its own password; on a match we set a signed
 * httpOnly session cookie carrying that role, and return the role + the list of
 * names sharing it so the client can show the "who are you" picker.
 */
export async function POST(request: NextRequest) {
  const access = getRoleAccess();
  if (access.length === 0) {
    // No gate configured — nothing to authenticate against.
    return NextResponse.json({ ok: true, role: "ops", names: ["Oliver"] });
  }

  const body = await request.json().catch(() => ({}));
  const submitted = typeof body?.password === "string" ? body.password : "";

  const entry = access.find((e) => e.password === submitted);
  if (!entry) {
    return NextResponse.json({ ok: false, error: "Incorrect password." }, { status: 401 });
  }

  const token = await sessionToken(entry.role, entry.password);
  const res = NextResponse.json({ ok: true, role: entry.role, names: entry.names });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
