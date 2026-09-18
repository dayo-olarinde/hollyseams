import Link from "next/link";
import { useState } from "react";
import NewJobModal from "@/components/jobs/new-job-modal";
import { ErrorBanner } from "@/components/ui/error-banner";
import TabBar from "@/components/ui/tab-bar";
import ThemeToggle from "@/components/ui/theme-toggle";
// The one card shape, shared with the tap shell so a tab never shows two different skeletons.
import { JobCardSkeleton } from "@/components/ui/skeletons";
import {
  useJobCounts,
  useJobsList,
  usePrefetchJob,
  usePrefetchJobFilters,
  type JobsListFilter,
} from "@/hooks/use-jobs";
import { cloudinaryThumb } from "@/lib/cloudinary";
import {
  formatDay,
  formatStampDay,
  isOverdue,
  todayLine,
} from "@/lib/format";
import type { Job, JobCounts } from "@/types/job";

type JobFilter = JobsListFilter;

/** Rendered before the counts arrive, so the tab numbers have one non-null shape. */
const NO_COUNTS = {
  all: 0,
  pending: 0,
  ready: 0,
  delivered: 0,
  overdue: 0,
};

const FILTERS: { key: JobFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "completed", label: "Completed" },
  { key: "delivered", label: "Delivered" },
];

/**
 * The tab's name is not always the API's.
 *
 * The third tab is labelled "Completed", but the filter behind it is the API's `status=completed`
 * rule — completed *and* not yet delivered — which the counts endpoint reports as `ready` so that
 * "ready to collect" keeps its own count. This is the only place that translation lives, so the
 * label, the query and the number can never drift apart.
 */
const COUNT_FOR_FILTER: Record<JobFilter, keyof JobCounts> = {
  all: "all",
  pending: "pending",
  completed: "ready",
  delivered: "delivered",
};

const isPending = (j: Job) => j.status === "pending";
const isReady = (j: Job) => j.status === "completed" && !j.deliveredAt;
const isDelivered = (j: Job) => j.status === "completed" && !!j.deliveredAt;

function IconChevronDown() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-2.5 w-2.5 text-(--hig-accent)"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function IconPhoto() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
      aria-hidden="true"
    >
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m5.8 17.2 4.2-4.2 2.8 2.8 3.2-3.2 2.2 2.2" />
    </svg>
  );
}

function JobCard({ job }: { job: Job }) {
  const prefetchJob = usePrefetchJob();
  const overdue = isOverdue(job);
  const ready = isReady(job);
  const delivered = isDelivered(job);

  let pill: string;
  let label: string;
  let note: string;
  let noteClass = "";
  if (overdue) {
    pill = "bg-(--hig-danger) text-white";
    label = "Overdue";
    note = `was due ${formatDay(job.dueDate)}`;
    noteClass = " text-(--hig-danger)";
  } else if (isPending(job)) {
    pill = "bg-(--hig-warning-tint) text-(--hig-warning)";
    label = "In progress";
    note = job.dueDate ? `due ${formatDay(job.dueDate)}` : "no due date";
  } else if (ready) {
    pill = "bg-(--hig-success-tint) text-(--hig-success)";
    label = "Ready";
    note = job.dueDate
      ? `ready · due ${formatDay(job.dueDate)}`
      : "ready for pickup";
  } else if (delivered) {

    pill = "bg-(--hig-accent-tint) text-(--hig-accent)";
    label = "Delivered";
    note = `collected ${formatStampDay(job.deliveredAt)}`;
  } else {
    pill = "bg-(--hig-separator) text-(--hig-label-secondary)";
    label = "Canceled";
    note = "canceled";
  }

  const cover = job.coverUrl;
  const photoCount = job.photoCount ?? 0;

  return (
    /*
     * A link, so the route is prefetched the moment the card is on screen and long-press gives the
     * native menu. The *data* starts on `pointerdown`, which is the part that removes the detail
     * skeleton: by the time the finger lifts, the job is usually already in the cache.
     */
    <Link
      href={`/jobs/${job.id}`}
      onPointerDown={() => prefetchJob(job.id)}
      className="flex cursor-pointer overflow-hidden rounded-[20px] bg-(--hig-card) shadow-[0_1px_3px_rgba(0,0,0,0.10),0_1px_2px_rgba(0,0,0,0.06)] transition-transform duration-200 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-(--hig-accent)"
    >
      <div className="relative w-1/3 min-h-28 shrink-0 self-stretch overflow-hidden bg-(--hig-fill)">
        {cover ? (
          <img

            src={cloudinaryThumb(cover)}
            alt={job.description || "Garment"}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-(--hig-label-tertiary)">
            <IconPhoto />
          </div>
        )}
        {cover && photoCount > 1 && (
          <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/45 px-1.5 py-0.5 text-[9px] font-semibold text-white">
            {photoCount}
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col px-4 py-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-[16px] font-medium tracking-[-0.01em]">
            {job.subjectName ?? "Client"}
          </p>
          <p
            className={`max-w-[45%] shrink-0 truncate text-[9.5px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-tertiary)${noteClass}`}
          >
            {note}
          </p>
        </div>
        <p className="mt-1 line-clamp-2 text-[13px] leading-4.5 text-(--hig-label-secondary)">
          {job.description || "Garment"}
        </p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div className="min-w-0">
            <div className="text-[17px] font-medium leading-none tracking-[-0.01em] [font-variant-numeric:tabular-nums]">
              <small className="mr-0.5 text-[11px] font-medium text-(--hig-label-secondary)">
                ₦
              </small>
              {job.agreedPrice.toLocaleString("en-US")}
            </div>
            <p className="mt-1 text-[9px] font-medium uppercase tracking-[0.06em] text-(--hig-label-tertiary)">
              Agreed price
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${pill}`}
          >
            {label}
          </span>
        </div>
      </div>
    </Link>
  );
}

const EMPTY_COPY: Record<JobFilter, { big: string; small: string }> = {
  all: {
    big: "No jobs yet.",
    small: "New garments will land here, newest first.",
  },
  pending: {
    big: "The bench is clear.",
    small: "No garments in progress right now.",
  },
  completed: {
    big: "Nothing ready yet.",
    small: "Finished garments waiting for pickup will appear here.",
  },
  delivered: {
    big: "No deliveries yet.",
    small: "Collected garments will appear here.",
  },
};

export function JobsView() {
  const [filter, setFilter] = useState<JobFilter>("all");
  const [newJobOpen, setNewJobOpen] = useState(false);

  const listQ = useJobsList(filter);

  // The tab bar is not the only "tab" on this screen: the status filter row swaps the query key
  // below, so warming the other statuses is what makes tapping one of them instant.
  usePrefetchJobFilters();

  const countsQ = useJobCounts();

  const jobs = listQ.data ?? [];

  /**
   * The tab numbers, aggregated by the server.
   *
   * They used to be produced by downloading `limit=100` jobs and filtering them in the browser:
   * a hundred rows on every visit to this screen and to the dashboard, and counts that quietly
   * stopped being true once the studio had more than a hundred jobs. `completed` maps to the
   * API's `ready` because that is the filter the tab actually applies.
   */
  const counts = countsQ.data ?? NO_COUNTS;

  /**
   * The overdue alert is a two-part message: how many, and which one first.
   *
   * The *count* is authoritative (from the endpoint) and no longer capped at a hundred. The
   * example row can only come from the cards this page has actually loaded, so it is shown when
   * one is available and the count alone is shown when it is not. Inventing a "was due" date for a
   * job that is not on screen would be worse than saying nothing.
   */
  const overdueCount = counts.overdue;
  const firstOverdue = jobs.find(isOverdue);
  const showBanner =
    (filter === "all" || filter === "pending") && overdueCount > 0;

  const loading = listQ.isPending;
  const failure = listQ.error ?? countsQ.error;
  const retryAll = () => {
    void listQ.refetch();
    void countsQ.refetch();
  };

  const selectedTotal = counts[COUNT_FOR_FILTER[filter]];
  const metaCount = countsQ.isPending || countsQ.isError
    ? `${jobs.length} loaded`
    : jobs.length < selectedTotal
      ? `${jobs.length} of ${selectedTotal}${filter === "all" ? "" : " matching"}`
      : filter === "all"
        ? `${selectedTotal} jobs`
        : `${selectedTotal} matching`;

  const empty = EMPTY_COPY[filter];
  const activeIndex = FILTERS.findIndex((f) => f.key === filter);

  return (
    <main className="hig content-safe min-h-dvh bg-(--hig-grouped) text-(--hig-label) transition-colors duration-300">
      <div className="relative mx-auto w-full max-w-107.5">
        {}
        {}
        <header
          className="hig-rise safe-top sticky top-0 z-20 flex items-center justify-between bg-(--hig-bar)/80 px-5 pb-2.5 backdrop-blur-[20px] backdrop-saturate-150"
          style={{ animationDelay: "0ms" }}
        >
          <p className="text-[20px] font-medium tracking-[-0.02em]">
            Holly<span className="text-(--hig-accent)">Seams</span>
          </p>
          <ThemeToggle />
        </header>

        <div className="hig-rise px-5 pt-3" style={{ animationDelay: "40ms" }}>
          <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-secondary)">
            {todayLine()}
          </p>
          <h1 className="mt-1 text-[34px] font-medium leading-10.25 tracking-[-0.02em]">
            Jobs, <span className="text-(--hig-accent)">on the rack.</span>
          </h1>
        </div>

        {}
        {}
        <div
          className="hig-rise relative mt-6 flex rounded-[14px] bg-(--hig-card) p-0.75 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)]"
          style={{ animationDelay: "40ms" }}
        >
          {}
          <span
            aria-hidden="true"
            className="absolute bottom-0.75 left-0.75 top-0.75 w-[calc((100%-6px)/4)] rounded-[11px] bg-(--hig-fill) transition-transform duration-300 ease-out"
            style={{ transform: `translateX(${activeIndex * 100}%)` }}
          />
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`relative z-10 flex min-w-0 flex-1 flex-col items-center gap-px rounded-[11px] px-1 py-2 transition-colors duration-200 ${
                filter === f.key
                  ? "text-(--hig-label)"
                  : "text-(--hig-label-secondary)"
              }`}
            >
              <span className="text-[12.5px] font-semibold">{f.label}</span>
              <span
                className={`text-[10.5px] font-semibold [font-variant-numeric:tabular-nums] ${
                  filter === f.key
                    ? "text-(--hig-accent)"
                    : "text-(--hig-label-secondary)"
                }`}
              >
                {/* “…” while the first answer is on its way, “—” when there is no answer to
                    show: a number that will never arrive should not look like one that is
                    still coming. */}
                {countsQ.isPending
                  ? "…"
                  : countsQ.isError
                    ? "—"
                    : counts[COUNT_FOR_FILTER[f.key]]}
              </span>
            </button>
          ))}
        </div>

        {}
        <div
          className="hig-rise mt-4 flex items-baseline justify-between text-[12px] text-(--hig-label-secondary) [font-variant-numeric:tabular-nums]"
          style={{ animationDelay: "80ms" }}
        >
          <span>{metaCount}</span>
          <span className="flex items-center gap-1">
            <IconChevronDown />
            newest first
          </span>
        </div>

        {failure && (
          <ErrorBanner
            error={failure}
            offlineMessage="Couldn't reach the studio. Check your connection."
            onRetry={retryAll}
            className="mt-4"
          />
        )}

        {showBanner && !failure && (
          <div
            className="hig-rise mt-4 flex items-center gap-2.5 rounded-2xl bg-(--hig-danger-tint) px-4 py-3"
            style={{ animationDelay: "100ms" }}
          >
            <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
              <span className="hig-ping absolute inset-0 rounded-full bg-(--hig-danger)" />
              <span className="relative h-2.5 w-2.5 rounded-full bg-(--hig-danger)" />
            </span>
            <div className="flex-1 text-[12.5px] text-(--hig-danger)">
              <b>
                {overdueCount} garment
                {overdueCount === 1 ? "" : "s"} overdue
              </b>
              {firstOverdue && (
                <small className="block text-[11.5px] text-(--hig-label-secondary)">
                  {firstOverdue.description} — was due{" "}
                  {formatDay(firstOverdue.dueDate)}
                </small>
              )}
            </div>
          </div>
        )}

        {}
        {loading ? (
          <div className="mt-4 space-y-4">
            {[0, 1, 2, 3].map((i) => (
              <JobCardSkeleton key={i} />
            ))}
          </div>
        ) : jobs.length === 0 && !failure ? (
          <div
            className="hig-rise mt-4 rounded-[20px] bg-(--hig-card) px-6 py-10 text-center"
            style={{ animationDelay: "120ms" }}
          >
            <p className="text-[15px] font-semibold">{empty.big}</p>
            <p className="mt-1.5 text-[13px] leading-5 text-(--hig-label-secondary)">
              {empty.small}
            </p>
            <button
              type="button"
              onClick={() => setNewJobOpen(true)}
              className="mt-4 rounded-[13px] bg-(--hig-accent) px-5 py-3 text-[14px] font-semibold text-white transition-transform duration-200 active:scale-95"
            >
              + New job
            </button>
          </div>
        ) : (
          <div
            className="hig-rise mt-4 space-y-4"
            style={{ animationDelay: "120ms" }}
          >
            {jobs.map((j) => (
              <JobCard key={j.id} job={j} />
            ))}

            {}
            {listQ.hasNextPage && (
              <button
                type="button"
                onClick={() => listQ.fetchNextPage()}
                disabled={listQ.isFetchingNextPage}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-(--hig-card) py-3.5 text-[15px] font-medium text-(--hig-label) transition-transform duration-200 active:scale-[0.98] disabled:opacity-60"
              >
                {listQ.isFetchingNextPage ? (
                  <>
                    <span
                      className="h-4 w-4 animate-spin rounded-full border-2 border-(--hig-accent-soft) border-t-(--hig-accent)"
                      aria-hidden="true"
                    />
                    Loading…
                  </>
                ) : (
                  <>
                    Show more jobs
                    <span className="text-(--hig-accent)">▾</span>
                  </>
                )}
              </button>
            )}
            {!listQ.hasNextPage && (
              <p className="mt-5 text-center text-[11.5px] text-(--hig-label-tertiary)">
                You&apos;re all caught up — newest jobs first.
              </p>
            )}
          </div>
        )}
      </div>

      {}
      <TabBar
        active="jobs"
        fab={
          <button
            type="button"
            aria-label="New job"
            title="New job"
            onClick={() => setNewJobOpen(true)}
            className="fab-safe pointer-events-auto absolute right-0 z-10 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-(--hig-accent) text-white shadow-(--hig-bar-shadow) transition-transform duration-200 active:scale-90"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
              aria-hidden="true"
            >
              <path d="M12 5.5v13" />
              <path d="M5.5 12h13" />
            </svg>
          </button>
        }
      />

      {}
      <NewJobModal open={newJobOpen} onClose={() => setNewJobOpen(false)} />
    </main>
  );
}