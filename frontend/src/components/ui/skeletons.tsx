/**
 * The app's skeleton shapes, defined once.
 *
 * These used to live inside each page, which is exactly why the tap shell drifted: it drew its
 * own idea of a card, and the page then replaced it with the real shape — a visible double flash
 * of two different skeletons. Every shape below is copied verbatim from the page that owns it,
 * and both the page and `PageSkeleton` render the same component, so the shell and the page it
 * is standing in for cannot disagree.
 *
 * Only the *shapes* live here. The arrangement of them (which section, what order, what spacing)
 * stays with the page, because only the page knows its own layout.
 */
import type { ReactNode } from "react";

/** The generic bar. `rounded-xl` matches the cards it sits inside. */
export function SkeletonBar({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-(--hig-separator) ${className}`}
    />
  );
}

/**
 * A card in the jobs list: Stitch's vertical ledger card — chip, title, client, then the
 * two-column price/timeline row and the one-tap status switcher at the foot.
 */
export function JobCardSkeleton() {
  const bar = "animate-pulse rounded bg-(--hig-separator)";
  return (
    <div className="stitch-card rounded-[20px] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className={`h-4.5 w-20 rounded-md ${bar}`} />
          <div className={`mt-2 h-4 w-full ${bar}`} />
          <div className={`mt-1.5 h-4 w-2/3 ${bar}`} />
          <div className={`mt-2 h-3 w-24 ${bar}`} />
        </div>
        <div className={`h-16 w-16 shrink-0 rounded-xl ${bar}`} />
      </div>
      <div className={`mt-3 h-px ${bar}`} />
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <div>
          <div className={`h-2.5 w-16 ${bar}`} />
          <div className={`mt-1.5 h-4 w-24 ${bar}`} />
        </div>
        <div className="text-right">
          <div className={`ml-auto h-2.5 w-12 ${bar}`} />
          <div className={`ml-auto mt-1.5 h-3.5 w-20 ${bar}`} />
        </div>
      </div>
      {/* The switcher well: same recessed track, three same-shape pills. */}
      <div className="mt-3.5 grid grid-cols-3 gap-1.5 rounded-xl border border-(--hig-separator) bg-(--hig-filter-well) p-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`min-h-11 rounded-lg ${bar}`} />
        ))}
      </div>
    </div>
  );
}

/**
 * A card in the customers list: Stitch's patron dossier — avatar + contact circles, the work
 * well, and the ledger strip at the foot. Mirrors `DossierCard` in customers-view.
 */
export function DossierCardSkeleton() {
  const bar = "animate-pulse rounded bg-(--hig-separator)";
  return (
    <div className="stitch-card rounded-[20px] px-4 py-4">
      {/* Identity row */}
      <div className="flex items-start gap-3">
        <div className={`h-11 w-11 shrink-0 rounded-full ${bar}`} />
        <div className="min-w-0 flex-1">
          <div className={`h-4 w-32 ${bar}`} />
          <div className={`mt-1.5 h-3 w-28 ${bar}`} />
        </div>
        <div className="flex gap-1.5">
          <div className={`h-8 w-8 rounded-full ${bar}`} />
          <div className={`h-8 w-8 rounded-full ${bar}`} />
        </div>
      </div>
      {/* Work well */}
      <div className={`mt-3 h-12.5 rounded-xl ${bar}`} />
      {/* Ledger strip */}
      <div className="mt-3 flex items-baseline justify-between">
        <div className={`h-2.5 w-20 ${bar}`} />
        <div className={`h-3.5 w-24 ${bar}`} />
      </div>
    </div>
  );
}

/** A "top clients" filmstrip card on the customers tab. */
export function FilmstripCardSkeleton() {
  const bar = "animate-pulse rounded bg-(--hig-separator)";
  return (
    <div className="w-37.5 shrink-0 stitch-card rounded-[18px] px-3.5 py-3">
      <div className={`h-3 w-8 ${bar}`} />
      <div className={`mt-2 h-9 w-9 rounded-full ${bar}`} />
      <div className={`mt-2 h-3.5 w-24 ${bar}`} />
      <div className={`mt-0.5 h-2.5 w-14 ${bar}`} />
      <div className={`mt-2 h-5 w-20 ${bar}`} />
      <div className={`mt-0.5 h-2.5 w-8 ${bar}`} />
    </div>
  );
}

/** One of the three floating counters (to collect / overdue / households). */
export function StatCardSkeleton({ label }: { label: ReactNode }) {
  return (
    <div className="stitch-card rounded-[18px] py-3 text-center">
      <SkeletonBar className="mx-auto h-5 w-20" />
      <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-tertiary)">
        {label}
      </p>
    </div>
  );
}

/** The studios-balance card at the top of the reports tab. */
export function StatementSummarySkeleton() {
  return (
    <div className="py-1">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`flex items-center justify-between py-1.75 ${
            i !== 0 ? "border-t border-dashed border-(--hig-separator)" : ""
          }`}
        >
          <SkeletonBar className="h-3.5 w-28" />
          <SkeletonBar className="h-5.75 w-24" />
        </div>
      ))}
      <div className="flex items-center justify-between border-t border-dashed border-(--hig-separator) pb-1 pt-3">
        <SkeletonBar className="h-3 w-16" />
        <SkeletonBar className="h-7 w-28" />
      </div>
    </div>
  );
}

/**
 * Rows of a three-column report table.
 *
 * `subLabel` is the only difference between the collected statement (a note under the month) and
 * the best-clients statement (job count) — keeping them one component is what stops the two from
 * drifting apart the way the shell and the pages did.
 */
export function StatementRowsSkeleton({
  rows = 3,
  subLabel = "w-20",
}: {
  rows?: number;
  subLabel?: string;
}) {
  return (
    <div className="p-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-2.5 px-4 py-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <SkeletonBar className="h-4 w-32" />
            <SkeletonBar className={`h-3 ${subLabel}`} />
          </div>
          <SkeletonBar className="h-4 w-21.5 shrink-0" />
          <SkeletonBar className="h-4 w-23 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/**
 * The body of a job's file, below its header.
 *
 * Moved here from inside `app/jobs/[id]/page.tsx` so that route's `loading.tsx` — which streams
 * before that page's JavaScript exists in the browser — can show the *same* shape the page will
 * draw. A shell that drew its own approximation would flash twice on every cold open, which is the
 * exact failure the comment at the top of this file describes.
 */
export function JobDetailSkeleton() {
  const bar = "animate-pulse rounded bg-(--hig-separator)";
  return (
    <div className="mx-auto w-full sm:max-w-107.5 px-4">
      <div className={`mt-6 h-2.5 w-24 ${bar}`} />
      <div className={`mt-3 h-7 w-3/4 ${bar}`} />
      <div className="mt-4 flex items-center gap-2.5">
        <div className={`h-10 w-10 shrink-0 rounded-full ${bar}`} />
        <div className="flex-1">
          <div className={`h-3.5 w-28 ${bar}`} />
          <div className={`mt-1.5 h-2.5 w-40 ${bar}`} />
        </div>
      </div>
      <div className="mt-5 flex">
        <div className={`h-11 flex-1 ${bar}`} />
        <div className={`mx-4 h-11 w-px ${bar}`} />
        <div className={`h-11 flex-1 ${bar}`} />
      </div>
      <div className="mt-8 grid grid-cols-2 gap-3">
        <div className={`aspect-3/4 ${bar}`} />
        <div className={`aspect-3/4 ${bar}`} />
      </div>
      <div className={`mt-8 h-40 ${bar}`} />
      <div className={`mt-6 h-44 ${bar}`} />
    </div>
  );
}

/** The body of a client's file (`/customers/[id]`), on the same shell contract. */
export function CustomerFileSkeleton() {
  const bar = "animate-pulse rounded bg-(--hig-separator)";
  return (
    <div className="mx-auto w-full sm:max-w-107.5 px-4">
      <div className="mt-6 flex items-center gap-3">
        <div className={`h-12 w-12 shrink-0 rounded-full ${bar}`} />
        <div className="flex-1">
          <div className={`h-4 w-32 ${bar}`} />
          <div className={`mt-2 h-3 w-40 ${bar}`} />
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2.5">
        <div className={`h-16 ${bar}`} />
        <div className={`h-16 ${bar}`} />
        <div className={`h-16 ${bar}`} />
      </div>
      <div className={`mt-7 h-40 ${bar}`} />
    </div>
  );
}

/** Rows of the outstanding statement: garment, client, due/paid line, agreed + balance. */
export function OutstandingRowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="p-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="px-4 py-3.5">
          <SkeletonBar className="h-5 w-3/4" />
          <SkeletonBar className="mt-0.5 h-3.5 w-1/2" />
          <div className="mt-2 flex items-center justify-between">
            <SkeletonBar className="h-3.5 w-28" />
            <SkeletonBar className="h-5 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}
