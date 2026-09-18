import { NextResponse, type NextRequest } from "next/server";

/**
 * The first half of the auth story: a cheap redirect before React exists.
 *
 * The session cookie is `httpOnly` (JavaScript cannot read it) but the *server* can, including this
 * middleware — so a request with no session cookie is answered with a redirect to `/login` before
 * any app JavaScript is downloaded, parsed or rendered. Without it, tapping a bookmark to `/jobs`
 * with no session painted the whole app shell, ran the session probe, and only then navigated: a
 * visible flash of a screen the user is not allowed to see, plus a wasted bundle and request.
 *
 * What this is **not**: authorisation. It checks that a cookie exists, not that the session behind
 * it is alive — the browser can hold a cookie for a session the server has already revoked or
 * expired. The API's own guard is what actually decides, on every request, and the client's
 * `SessionWatcher` handles the "cookie present but dead" case. Treating this as a security boundary
 * would be exactly the mistake the review is meant to prevent; it is a routing shortcut, and it
 * saves a round trip in the common "never signed in" case.
 */
const SESSION_COOKIE = "sessionId";

const PROTECTED_PREFIXES = ["/dashboard", "/jobs", "/customers", "/reports"];

export function proxy(request: NextRequest) {
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
