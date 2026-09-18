import { DetailHeader } from "@/components/ui/detail-header";
import { CustomerFileSkeleton } from "@/components/ui/skeletons";

/** The shell for a cold open of a client's file. See `app/jobs/[id]/loading.tsx`. */
export default function CustomerFileLoading() {
  return (
    <main className="hig min-h-dvh bg-(--hig-grouped) pb-[calc(4rem+env(safe-area-inset-bottom))] text-(--hig-label) transition-colors duration-300">
      <DetailHeader title="Customer file" fallbackHref="/dashboard?tab=customers" />
      <CustomerFileSkeleton />
    </main>
  );
}
