import DashboardClient from "./dashboard-client";

/**
 * This is a Server Component on purpose — `export const dynamic` (a Next.js route segment
 * config) is only honored in a Server Component; it's silently ignored in a file marked
 * "use client". The route needs it because it's behind login and reads `?tab=` at request time,
 * so it was never a candidate for static prerendering. The actual tab-switching logic lives in
 * `DashboardClient`.
 */
export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return <DashboardClient />;
}
