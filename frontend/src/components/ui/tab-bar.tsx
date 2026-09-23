"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { createContext, useContext } from "react";
import type { ReactNode } from "react";

export type TabKey = "overview" | "jobs" | "customers" | "reports";

/**
 * Tab switching as *state*, not navigation.
 *
 * The bottom tabs used to call `router.replace("/dashboard?tab=…")` — which is still a real
 * navigation to Next.js: it fetches the server-component payload for the new URL, waits for the
 * round trip, then commits. On a dev server that read as a flat ~2s delay on every switch, even
 * though the tabs were "one route". The status filters on the Jobs tab were instant because they
 * were plain `useState` — so the bottom tabs now are too.
 *
 * `DashboardClient` renders everything and owns the tab as React state; it provides its instant
 * `selectTab` through this context. `TabBar` prefers the context when one is provided and only
 * falls back to the router navigation when rendered without one (defensive; today every TabBar
 * sits inside the dashboard). The URL still updates — via `history.replaceState`, which Next 14+
 * treats as first-class — so deep links (`/dashboard?tab=jobs`) and the detail pages'
 * `fallbackHref` keep working, with zero server round trip on switch.
 */
export const TabNavContext = createContext<((tab: TabKey) => void) | null>(null);

function IconHouse() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19Z" />
      <path d="M9.5 20.5v-5.5h5v5.5" />
    </svg>
  );
}
function IconScissors() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="6" r="2.6" />
      <circle cx="6" cy="18" r="2.6" />
      <path d="M20 4 8.4 15.6" />
      <path d="m14.2 14.2 5.8 5.8" />
      <path d="m8.4 8.4 3.4 3.4" />
    </svg>
  );
}
function IconCustomers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="7.5" r="3.5" />
      <path d="M3 20.5v-1a6 6 0 0 1 12 0v1" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.5" />
      <path d="M17.5 14.6a6 6 0 0 1 3.5 5.4v.5" />
    </svg>
  );
}
function IconReports() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="M8 17v-4" />
      <path d="M13 17V7" />
      <path d="M18 17v-7" />
    </svg>
  );
}

const TABS: { key: TabKey; label: string; icon: ReactNode }[] = [
  { key: "overview", label: "Overview", icon: <IconHouse /> },
  { key: "jobs", label: "Jobs", icon: <IconScissors /> },
  { key: "customers", label: "Customers", icon: <IconCustomers /> },
  { key: "reports", label: "Reports", icon: <IconReports /> },
];

/**
 * All four tabs are one route now (`/dashboard`), so a "tap" is a state change, not a navigation —
 * there is no route for the browser to unmount/remount, so there is nothing for a shell to cover
 * anymore. The old version of this file painted a placeholder screen to bridge the gap between a
 * tap and the next route committing (see the removed `lib/tab-shell.ts`); that gap doesn't exist
 * here, which is the whole point of the merge.
 *
 * `router.replace` (not `push`) keeps tab switches out of browser history when the fallback
 * navigation path is used — tapping between tabs ten times shouldn't take ten taps of the back
 * button to undo.
 */
export default function TabBar({
  active,
  fab,
}: {
  active: TabKey;
  fab?: ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientSelect = useContext(TabNavContext);

  /** The fallback path — only used when no instant client select was provided. */
  const selectTab = (tab: TabKey) => {
    if (tab === active) return;
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "overview") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const query = params.toString();
    router.replace(query ? `/dashboard?${query}` : "/dashboard", { scroll: false });
  };

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-10">
      <div className="relative mx-auto w-full sm:max-w-107.5">
        {fab}
        {/*
          `tabbar-safe` is the 64px of real tab bar the design always had, plus the home-indicator
          strip as padding underneath it — so the blur reaches the bottom edge of the screen while
          the labels stay clear of the indicator. On a phone without a notch the inset is zero and
          this is exactly the old `h-16`.
        */}
        <div className="tabbar-safe pointer-events-auto flex items-center rounded-t-3xl bg-(--hig-bar) px-2 shadow-(--hig-bar-shadow) backdrop-blur-[20px] backdrop-saturate-150">
          {TABS.map((tab) => {
            const isActive = tab.key === active;
            return (
              <button
                key={tab.key}
                type="button"
                aria-label={tab.label}
                aria-current={isActive ? "page" : undefined}
                onClick={() => (clientSelect ?? selectTab)(tab.key)}
                className={`flex h-full flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-2xl transition-all duration-200 active:scale-95 ${
                  isActive
                    ? "text-(--hig-accent)"
                    : "text-(--hig-label-secondary)"
                }`}
              >
                <span className="h-6 w-6">{tab.icon}</span>
                <span
                  className={`text-[11.5px] ${isActive ? "font-semibold" : "font-medium"}`}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
