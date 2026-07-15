import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, authConfigured, roleForToken } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  // No gate configured → open (unchanged behaviour).
  if (!authConfigured()) return NextResponse.next();

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const entry = await roleForToken(token);
  if (entry) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!api/login|api/session|login|_next/static|_next/image|favicon.ico|logo\\.png).*)"],
};
