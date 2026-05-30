import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";

/**
 * Proxy (formerly Middleware in Next < 16). Coarse auth gate: checks only for
 * the PRESENCE of the session cookie (cheap, no DB) — full validation happens
 * in the API routes / pages via getSessionUser(). Unauthenticated requests are
 * redirected to /login (pages) or rejected with 401 (API).
 *
 * Public paths: the login + invite pages and the auth API (which authenticate
 * themselves). Static assets are excluded by the matcher below.
 */
const PUBLIC_PREFIXES = ["/login", "/invite", "/api/auth/"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  if (hasSession) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Run on everything except Next internals + common static asset extensions.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)",
  ],
};
