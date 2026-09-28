import { NextResponse, type NextRequest } from "next/server";

/**
 * The first half of the auth story: a cheap redirect before React exists.
 *
 * The session cookie is `httpOnly` (JavaScript cannot read it) but the server can, so a request
 * with no cookie is answered with a redirect to `/login` before any app JavaScript runs. Must be
 * `middleware.ts` exporting `middleware` — the Next 15 convention; under any other name the file
 * is silently never loaded and return visits flash the login keypad.
 *
 * This is NOT authorisation: it checks a cookie exists, not that the session is alive. The API's
 * guard decides on every request; the client's `SessionWatcher` handles the dead-cookie case.
 */
const SESSION_COOKIE = "sessionId";

const PROTECTED_PREFIXES = ["/dashboard", "/jobs", "/customers", "/reports"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = request.cookies.has(SESSION_COOKIE);

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !hasSessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // A signed-in user opening the app lands on the studio, not the keypad.
  if (pathname === "/login" && hasSessionCookie) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Only the routes this rule can decide something about. Middleware runs on every matching
   * request — including the RSC payloads that `next/link` prefetches — so keeping the matcher
   * narrow keeps normal navigation free of it.
   */
  matcher: [
    "/login",
    "/dashboard/:path*",
    "/jobs/:path*",
    "/customers/:path*",
    "/reports/:path*",
  ],
};
