import { DetailHeader } from "@/components/ui/detail-header";
import { JobDetailSkeleton } from "@/components/ui/skeletons";

/**
 * The shell for a cold open of a job's file.
 *
 * Unlike the four tabs, a pushed page had no `loading.tsx` at all, so tapping a card from a cold
 * start left the *previous* screen frozen in place until this route's JavaScript arrived — the
 * exact freeze the tab shell was built to cover, unfixed one level deeper. The header is rendered
 * for real (its title and back button are static), and the body is the same skeleton the page
 * itself draws, so the handover is one paint rather than two.
 */
export default function JobDetailLoading() {
  return (
    <main className="hig content-safe min-h-dvh bg-(--hig-grouped) text-(--hig-label) transition-colors duration-300">
      <DetailHeader title="Inspection" fallbackHref="/dashboard?tab=jobs" />
      <JobDetailSkeleton />
    </main>
  );
}
