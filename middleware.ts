import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, expectedAuthToken } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const expected = await expectedAuthToken();
  if (!expected) return NextResponse.next();

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (token === expected) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!api/login|login|_next/static|_next/image|favicon.ico).*)"],
};
