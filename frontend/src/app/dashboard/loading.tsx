import PageSkeleton from "@/components/ui/page-skeleton";
import TabBar from "@/components/ui/tab-bar";

/** Cold-load shell for the dashboard; the greeting is time-dependent, so it stays a bar. */
export default function DashboardLoading() {
  return (
    <PageSkeleton active="overview" tabBar={<TabBar active="overview" />} />
  );
}
