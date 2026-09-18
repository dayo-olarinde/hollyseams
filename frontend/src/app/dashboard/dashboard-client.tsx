"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PageSkeleton from "@/components/ui/page-skeleton";
import TabBar from "@/components/ui/tab-bar";
import { CustomersView } from "@/components/views/customers-view";
import { JobsView } from "@/components/views/jobs-view";
import { OverviewView } from "@/components/views/overview-view";
import { ReportsView } from "@/components/views/reports-view";
import type { TabKey } from "@/components/ui/tab-bar";

/**
 * The four bottom tabs used to be four separate routes. Switching between them meant Next
 * unmounting one page's React tree and mounting another's — a real navigation, with a real gap
 * where nothing could paint, no matter how warm the React Query cache already was. `lib/tab-shell.ts`
 * covered that gap with a placeholder; it's gone now because the gap it covered is gone.
 *
 * All four tabs are one route (`/dashboard`) with the active tab as a query param. Tapping a tab
 * is `TabBar` calling `router.replace("/dashboard?tab=jobs")` — same segment, so React just swaps
 * which child is rendered in the same commit. No unmount-across-a-navigation-boundary, so nothing
 * to cover with a shell. Revisiting an already-visited tab is a synchronous re-render straight from
 * the React Query cache; a tab visited for the first time still shows its own real skeleton
 * (`listQ.isPending`, unchanged from before) while its data loads, same as it always did.
 *
 * `useSearchParams()` requires a Suspense ancestor — `DashboardLoading` (`app/dashboard/loading.tsx`)
 * already covers the one real gap left: the cold navigation from `/login` before this route's own
 * JavaScript has arrived at all.
 */
function DashboardTabs() {
  const searchParams = useSearchParams();
  const tab = (searchParams.get("tab") as TabKey | null) ?? "overview";

  switch (tab) {
    case "jobs":
      return <JobsView />;
    case "customers":
      return <CustomersView />;
    case "reports":
      return <ReportsView />;
    default:
      return <OverviewView />;
  }
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
