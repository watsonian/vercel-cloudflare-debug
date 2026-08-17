import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_NAME, isValidToken } from "@/app/lib/auth";

export function proxy(request: NextRequest) {
  const password = process.env.PROBE_PASSWORD;
  if (!password) return NextResponse.next();

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (token && isValidToken(token)) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
