"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageSkeleton from "@/components/ui/page-skeleton";
import TabBar, { TabNavContext } from "@/components/ui/tab-bar";
import type { TabKey } from "@/components/ui/tab-bar";
import { CustomersView } from "@/components/views/customers-view";
import { JobsView } from "@/components/views/jobs-view";
import { OverviewView } from "@/components/views/overview-view";
import { ReportsView } from "@/components/views/reports-view";

/**
 * Tabs as *state*, not navigation.
 *
 * The four bottom tabs used to be four routes; the merge to `/dashboard` fixed the
 * unmount/remount cost but the switch still went through `router.replace("/dashboard?tab=…")`,
 * which is a real Next navigation — fetch the server payload for the new URL, wait for the round
 * trip, then commit. On a dev server over LAN that read as ~2s of dead air per switch, while the
 * Jobs screen's status filters (plain `useState`) felt instant. Same bug, two solutions staring
 * at each other.
 *
 * Now the tab is plain React state here. Switching swaps which child renders in one commit —
 * the exact mechanics the status filters use. Each view manages its own data through React Query,
 * so revisiting a tab paints synchronously from cache (staleTime 30s) and shows its own skeleton
 * only when its data genuinely isn't there yet.
 *
 * The URL stays true (`/dashboard?tab=jobs`) via `history.replaceState` — which Next treats as
 * first-class — so deep links and the detail pages' `fallbackHref` still land on the right tab,
 * and `router.back()` from a detail page still returns you to where you were. Tab switches
 * themselves never touch the router, so there is nothing to wait for.
 */
const TAB_VIEWS: Record<TabKey, () => React.JSX.Element> = {
  overview: OverviewView,
  jobs: JobsView,
  customers: CustomersView,
  reports: ReportsView,
};

const isTabKey = (value: string | null): value is TabKey =>
  value === "overview" || value === "jobs" || value === "customers" || value === "reports";

function DashboardTabs() {
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");

  // One-time initialization from the URL; after mount, `tab` is the single source of truth and
  // the URL follows it (not the other way round) — that's what keeps switching server-free.
  const [tab, setTab] = useState<TabKey>(() =>
    isTabKey(requested) ? requested : "overview",
  );

  // …except when the URL is changed by a real navigation while already mounted ("View All",
  // a detail page's fallback link, the logo): the state initializer never re-runs, so the
  // search param is followed here. In-app switches use replaceState, which the router never
  // hears about, so this effect cannot fight them.
  useEffect(() => {
    const next: TabKey = isTabKey(requested) ? requested : "overview";
    setTab((current) => (current === next ? current : next));
    window.scrollTo({ top: 0 });
  }, [requested]);

  const selectTab = useCallback((next: TabKey) => {
    setTab(next);
    // A new screen starts at its top — never inherit the previous tab's scroll.
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const url = tab === "overview" ? "/dashboard" : `/dashboard?tab=${tab}`;
    // replaceState, not the router: zero async work, zero fetch, zero commit delay.
    window.history.replaceState(null, "", url);
  }, [tab]);

  const View = TAB_VIEWS[tab];

  return (
    <TabNavContext.Provider value={selectTab}>
      <View />
    </TabNavContext.Provider>
  );
}

export default function DashboardClient() {
  return (
    <Suspense
      fallback={<PageSkeleton active="overview" tabBar={<TabBar active="overview" />} />}
    >
      <DashboardTabs />
    </Suspense>
  );
}
