import Link from "next/link";
import { useMemo, useState } from "react";
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
  useUpdateJob,
  type JobsListFilter,
} from "@/hooks/use-jobs";
import { useOutstandingPayments } from "@/hooks/use-reports";
import { cloudinaryThumb } from "@/lib/cloudinary";
import { formatDay, isOverdue, naira, todayLine } from "@/lib/format";
// The card, the order file and the detail skeleton all read the state from one place.
import { jobStage } from "@/lib/job-stage";
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

const isReady = (j: Job) => j.status === "completed" && !j.deliveredAt;
const isDelivered = (j: Job) => j.status === "completed" && !!j.deliveredAt;

/* ------------------------------------------------------------------ */
/* Icons                                                               */
/* ------------------------------------------------------------------ */

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
      className="h-5 w-5"
      aria-hidden="true"
    >
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m5.8 17.2 4.2-4.2 2.8 2.8 3.2-3.2 2.2 2.2" />
    </svg>
  );
}

function IconWallet() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 text-(--hig-accent)"
      aria-hidden="true"
    >
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h11A2.5 2.5 0 0 1 19 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 3 16.5Z" />
      <path d="M16 12h5v4h-5a2 2 0 0 1 0-4Z" />
    </svg>
  );
}

function IconTruck() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 text-(--hig-warning)"
      aria-hidden="true"
    >
      <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" />
      <circle cx="7" cy="18.5" r="1.6" />
      <circle cx="17" cy="18.5" r="1.6" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

/**
 * The one-tap status switcher, wired to the same optimistic mutation the detail page uses.
 *
 * The pills speak *intent* — `pending | completed | delivered` — which is deliberately not the
 * stored `JobStatus`: the API has no "delivered" status, only `completed` + a `deliveredAt`
 * stamp. Moving to `delivered` stamps now; every other state clears it, because a garment sent
 * back to the bench is not delivered. That translation lives here (the only place a list-level
 * status change exists) so the detail page and this switcher cannot disagree.
 */
type StatusIntent = "pending" | "completed" | "delivered";

const STATUS_PILLS: { status: StatusIntent; label: string; glyph: React.ReactNode }[] = [
  {
    status: "pending",
    label: "Pending",
    glyph: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-3.5 w-3.5" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </svg>
    ),
  },
  {
    status: "completed",
    label: "Ready",
    glyph: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" />
        <path d="m8.5 12.5 2.5 2.5 4.5-5" />
      </svg>
    ),
  },
  {
    status: "delivered",
    label: "Delivered",
    glyph: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
        <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" />
        <circle cx="7" cy="18.5" r="1.6" />
        <circle cx="17" cy="18.5" r="1.6" />
      </svg>
    ),
  },
];

function StatusPillGroup({ job }: { job: Job }) {
  const updateJob = useUpdateJob();
  const stage = jobStage(job);
  const busy = updateJob.isPending;

  // The pill's value is the *intent* read back out of the row: `completed` without a stamp is
  // "ready", with one it's "delivered" — the exact mapping `jobStage` renders above.
  const currentPill: StatusIntent = isDelivered(job)
    ? "delivered"
    : isReady(job)
      ? "completed"
      : "pending";

  const setStatus = (intent: StatusIntent) => {
    if (intent === currentPill || busy) return;
    updateJob.mutate({
      id: job.id,
      input: {
        status: intent === "delivered" ? "completed" : intent,
        deliveredAt: intent === "delivered" ? new Date().toISOString() : null,
      },
    });
  };

  return (
    /*
     * Below the whole-card link, so the pills stay tappable: the transparent Link overlay is
     * z-0, this block is z-10 — a card that opens on tap *and* changes state on tap of its own
     * pills, exactly like Stitch's switcher. Buttons stay ≥44px tall for the finger.
     */
    <div className="relative z-10 mt-3.5 border-t border-(--hig-separator) pt-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-tertiary)">
          Garment state
        </span>
        <span
          className={`flex items-center gap-1.5 text-[11px] font-medium ${stage.dueTone}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {stage.phrase}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-(--hig-separator) bg-(--hig-filter-well) p-1">
        {STATUS_PILLS.map((pill) => {
          const active = pill.status === currentPill;
          return (
            <button
              key={pill.status}
              type="button"
              aria-pressed={active}
              disabled={busy}
              onClick={() => setStatus(pill.status)}
              className={`flex min-h-11 items-center justify-center gap-1 rounded-lg border px-1 text-[12px] font-semibold transition-all duration-200 active:scale-[0.97] disabled:opacity-60 ${
                active
                  ? `${stage.pillActive} bg-(--hig-card) shadow-sm`
                  : "border-transparent text-(--hig-label-secondary)"
              }`}
            >
              {pill.glyph}
              {pill.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function JobCard({ job, ledger }: { job: Job; ledger?: { balanceDue: number; totalPaid: number } }) {
  const prefetchJob = usePrefetchJob();
  const stage = jobStage(job);

  const cover = job.coverUrl;
  const photoCount = job.photoCount ?? 0;

  /*
   * The balance line comes from the server's outstanding-payments statement, matched by job id —
   * never from summing client-side payments (the list endpoint doesn't carry them, and a number
   * computed from a partial page would lie). "Paid in full" is the *absence* of a row here,
   * which is exactly what the backend's `having balance > 0` means.
   */
  const balanceDue = ledger?.balanceDue ?? 0;

  return (
    <article className="stitch-card relative overflow-hidden rounded-[20px] p-4 transition-transform duration-200 active:scale-[0.98]">
      {/*
       * The whole card opens the job file via a transparent stretched link — the pattern that
       * lets every other pixel of the card stay interactive. The *data* starts on `pointerdown`,
       * which is the part that removes the detail skeleton: by the time the finger lifts, the
       * job is usually already in the cache.
       */}
      <Link
        href={`/jobs/${job.id}`}
        aria-label={`${job.description || "Garment"} — ${job.subjectName ?? "client"}`}
        onPointerDown={() => prefetchJob(job.id)}
        className="absolute inset-0 z-0 rounded-[20px] focus-visible:outline-2 focus-visible:outline-(--hig-accent)"
      />

      {/* Header: stage chip + swatch */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] ${stage.chip}`}
            >
              {stage.label}
            </span>
          </div>
          <h2 className="mt-1.5 line-clamp-2 text-[16px] font-semibold leading-5 tracking-[-0.01em]">
            {job.description || "Garment"}
          </h2>
          <p className="mt-1 truncate text-[13px] font-medium text-(--hig-label-secondary)">
            {job.subjectName ?? "Client"}
          </p>
        </div>
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-(--hig-separator) bg-(--hig-fill)">
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
            <span className="absolute bottom-1 right-1 rounded-full bg-black/45 px-1.5 py-0.5 text-[9px] font-semibold text-white">
              {photoCount}
            </span>
          )}
        </div>
      </div>

      {/* Ledger: what the job is worth, and where it stands in time */}
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-(--hig-separator) pt-2.5">
        <div>
          <span className="block text-[11px] text-(--hig-label-tertiary)">
            Agreed price
          </span>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-[15px] font-semibold tracking-[-0.01em] [font-variant-numeric:tabular-nums]">
              {naira(job.agreedPrice)}
            </span>
            {balanceDue > 0 ? (
              <span className="text-[11px] font-medium text-(--hig-warning)">
                {naira(balanceDue)} balance
              </span>
            ) : (
              ledger && (
                <span className="text-[11px] font-medium text-(--hig-success)">
                  Paid in full
                </span>
              )
            )}
          </div>
        </div>
        <div className="text-right">
          <span className="block text-[11px] text-(--hig-label-tertiary)">
            Timeline
          </span>
          <span
            className={`mt-0.5 flex items-center justify-end gap-1 text-[12px] font-semibold ${stage.dueTone}`}
          >
            {stage.due}
          </span>
        </div>
      </div>

      <StatusPillGroup job={job} />
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

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
  const outstandingQ = useOutstandingPayments();

  const jobs = listQ.data ?? [];
  const counts = countsQ.data ?? NO_COUNTS;

  /*
   * The pipeline bento is aggregate-first, like Stitch's: two server-authoritative statements
   * instead of arithmetic over whatever rows happen to be on screen.
   *
   * - Pipeline balance: the outstanding-payments report already computes `balance_due` per job
   *   in SQL (`agreed − paid`), for *every* job that owes — not just the loaded page.
   * - Ready for pickup + overdue come from the counts endpoint.
   * Nothing here is derived from `jobs` (a paginated slice) — that would print different money
   * depending on how far the user had scrolled.
   */
  const outstanding = outstandingQ.data ?? [];
  const pipelineBalance = useMemo(
    () => outstanding.reduce((sum, row) => sum + row.balanceDue, 0),
    [outstanding],
  );
  const balanceByJob = useMemo(() => {
    const map = new Map<string, { balanceDue: number; totalPaid: number }>();
    for (const row of outstanding) {
      map.set(row.jobId, { balanceDue: row.balanceDue, totalPaid: row.totalPaid });
    }
    return map;
  }, [outstanding]);

  /**
   * The overdue banner is a two-part message: how many, and which one first.
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
  const failure =
    listQ.error ?? countsQ.error ?? outstandingQ.error;
  const retryAll = () => {
    void listQ.refetch();
    void countsQ.refetch();
    void outstandingQ.refetch();
  };

  const selectedTotal = counts[COUNT_FOR_FILTER[filter]];
  const metaCount =
    countsQ.isPending || countsQ.isError
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
      <div className="relative mx-auto w-full sm:max-w-107.5">
        <header
          className="hig-rise safe-top sticky top-0 z-20 flex items-center justify-between bg-(--hig-bar)/80 px-5 pb-2.5 backdrop-blur-[20px] backdrop-saturate-150"
          style={{ animationDelay: "0ms" }}
        >
          <p className="text-[20px] font-medium tracking-[-0.02em]">
            Holly<span className="text-(--hig-accent)">Seams</span>
          </p>
          <ThemeToggle />
        </header>

        {/* Apple HIG large title + the operational count under it */}
        <div className="hig-rise px-5 pt-3" style={{ animationDelay: "40ms" }}>
          <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-secondary)">
            {todayLine()}
          </p>
          <h1 className="mt-1 text-[34px] font-medium leading-10.25 tracking-[-0.02em]">
            Garment Jobs
          </h1>
          <p className="mt-0.5 text-[13px] font-medium text-(--hig-label-secondary)">
            {countsQ.isPending || countsQ.isError ? (
              "Atelier queue"
            ) : (
              <>
                {counts.all} active commission{counts.all === 1 ? "" : "s"}
              </>
            )}
          </p>
        </div>

        {/* Pipeline glance: two server-authoritative numbers, the Stitch bento */}
        <section
          aria-label="Pipeline overview"
          className="hig-rise mt-4 grid grid-cols-2 gap-3 px-5"
          style={{ animationDelay: "60ms" }}
        >
          <div className="stitch-card flex flex-col justify-between rounded-2xl p-3.5">
            <div className="flex items-center justify-between text-[12px] font-medium tracking-tight text-(--hig-label-secondary)">
              <span>Pipeline balance</span>
              <IconWallet />
            </div>
            <div className="mt-1.5">
              <div className="text-[20px] font-semibold leading-snug tracking-[-0.02em] [font-variant-numeric:tabular-nums]">
                {outstandingQ.isPending ? "…" : naira(pipelineBalance)}
              </div>
              <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-(--hig-label-secondary)">
                <span className="h-1.5 w-1.5 rounded-full bg-(--hig-accent)" />
                {outstandingQ.isPending
                  ? "awaiting statement"
                  : `${outstanding.length} garment${outstanding.length === 1 ? "" : "s"} with a balance`}
              </p>
            </div>
          </div>
          <div className="stitch-card flex flex-col justify-between rounded-2xl p-3.5">
            <div className="flex items-center justify-between text-[12px] font-medium tracking-tight text-(--hig-label-secondary)">
              <span>Ready for pickup</span>
              <IconTruck />
            </div>
            <div className="mt-1.5">
              <div className="text-[20px] font-semibold leading-snug tracking-[-0.02em] [font-variant-numeric:tabular-nums]">
                {countsQ.isPending ? "…" : `${counts.ready}`}
              </div>
              <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-(--hig-label-secondary)">
                {overdueCount > 0 ? (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-(--hig-danger)" />
                    {overdueCount} overdue — needs chasing
                  </>
                ) : (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-(--hig-success)" />
                    bench on schedule
                  </>
                )}
              </p>
            </div>
          </div>
        </section>

        {/* Recessed segmented filter (the Stitch well + sliding thumb) */}
        <div
          className="hig-rise relative mx-5 mt-4 flex rounded-[14px] border border-(--hig-separator) bg-(--hig-filter-well) p-0.75"
          style={{ animationDelay: "40ms" }}
        >
          <span
            aria-hidden="true"
            className="absolute bottom-0.75 left-0.75 top-0.75 w-[calc((100%-6px)/4)] rounded-[11px] bg-(--hig-card) shadow-sm transition-transform duration-300 ease-out"
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
              <span className="text-[13.5px] font-semibold">{f.label}</span>
              <span
                className={`text-[12px] font-semibold [font-variant-numeric:tabular-nums] ${
                  filter === f.key
                    ? "text-(--hig-accent)"
                    : "text-(--hig-label-secondary)"
                }`}
              >
                {/* "…" while the first answer is on its way, "—" when there is no answer to
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

        {/* Queue meta — Stitch's section-title row */}
        <div
          className="hig-rise mt-4 flex items-baseline justify-between px-5 text-[12px] text-(--hig-label-secondary) [font-variant-numeric:tabular-nums]"
          style={{ animationDelay: "80ms" }}
        >
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-(--hig-label-tertiary)">
            {metaCount}
          </span>
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
            className="mx-5 mt-4"
          />
        )}

        {showBanner && !failure && (
          <div
            className="hig-rise mx-5 mt-4 flex items-center gap-2.5 rounded-2xl bg-(--hig-danger-tint) px-4 py-3"
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

        {/* The queue */}
        {loading ? (
          <div className="mt-4 space-y-4 px-5">
            {[0, 1, 2, 3].map((i) => (
              <JobCardSkeleton key={i} />
            ))}
          </div>
        ) : jobs.length === 0 && !failure ? (
          <div
            className="hig-rise mx-5 mt-4 rounded-[20px] bg-(--hig-card) px-6 py-10 text-center shadow-(--hig-card-shadow)"
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
            className="hig-rise mt-4 space-y-3.5 px-5"
            style={{ animationDelay: "120ms" }}
          >
            {jobs.map((j) => (
              <JobCard key={j.id} job={j} ledger={balanceByJob.get(j.id)} />
            ))}

            {/* Pagination */}
            {listQ.hasNextPage && (
              <button
                type="button"
                onClick={() => listQ.fetchNextPage()}
                disabled={listQ.isFetchingNextPage}
                className="stitch-card mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-medium text-(--hig-label) transition-transform duration-200 active:scale-[0.98] disabled:opacity-60"
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

      {/* Tap shell: tab bar + the floating "new job" action */}
      <TabBar
        active="jobs"
        fab={
          <button
            type="button"
            aria-label="New job"
            title="New job"
            onClick={() => setNewJobOpen(true)}
            className="fab-safe pointer-events-auto absolute right-5 z-10 flex h-16 w-16 cursor-pointer items-center justify-center rounded-full bg-(--hig-accent) text-white shadow-(--hig-bar-shadow) transition-transform duration-200 active:scale-90"
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

      {/* The create sheet */}
      <NewJobModal open={newJobOpen} onClose={() => setNewJobOpen(false)} />
    </main>
  );
}
