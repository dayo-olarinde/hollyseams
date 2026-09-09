import { redirect } from "next/navigation";

/**
 * Root page — auto-redirects based on session state.
 *
 * Since this is a single-user app with httpOnly session cookies,
 * we can't check the session server-side (cookies are httpOnly but
 * still readable by the server). We redirect to a client-side
 * checker that will route appropriately.
 *
 * Simple approach: redirect to /login. The auth context will
 * detect an existing session and redirect to /dashboard if valid.
 */
export default function Home() {
  redirect("/login");
}
