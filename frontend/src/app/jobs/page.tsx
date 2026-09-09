"use client";

/**
 * Jobs — Apple HIG (Concept 4 · The Rail, separated).
 *
 * The real version of the concept: separated job cards (12px air, 16px
 * padding, 20px radius — 8pt grid), a four-segment status filter with live
 * counts in the labels, and cursor pagination against GET /jobs
 * (limit 10, desc created_at — newest first).
 *
 * Data:
 *   - The list uses useInfiniteQuery keyed on the active filter; each filter
 *     is its own query with its own cursor (`?status=…&cursor=…`).
 *   - Counts (All/Pending/Completed/Delivered) come from one extra
 *     limit-100 read — the same pattern the dashboard uses for studio
 *     counts — because the cursor feed alone can't know totals.
 *   - Both queries live under the ["jobs"] key, so the New Job modal's
 *     post-create invalidation refreshes them together.
 *
 * Presentation follows the design-system doc (docs/design-system.md):
 * one accent, flat surfaces (no borders), semantic status colours,
 * 500-weight content type, tabular numerals for money.
 */
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import NewJobModal from "@/components/new-job-modal";
import ThemeToggle from "@/components/theme-toggle";
import {
  listJobs,
  type Job,
  type JobStatusFilter,
} from "@/lib/api-client";

/* ---------------------------------- filter ---------------------------------- */

/** "all" renders without a status param; the rest map 1:1 to it. */
type JobFilter = "all" | JobStatusFilter;

const FILTERS: { key: JobFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "completed", label: "Completed" },
  { key: "delivered", label: "Delivered" },
];

/* ---------------------------------- helpers ---------------------------------- */

/** "2026-09-12" (or ISO) → "12 Sep" without timezone drift. */
function formatDueDate(value: string | null | undefined): string {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const date = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

/* status derivation — same as the dashboard: delivered is derived, not a
   row status (delivered = completed + deliveredAt set). */
const isPending = (j: Job) => j.status === "pending";
const isReady = (j: Job) => j.status === "completed" && !j.deliveredAt;
const isDelivered = (j: Job) => j.status === "completed" && !!j.deliveredAt;

/* The pg `date` column serializes as ISO ("2026-09-24T00:00:00.000Z");
   appending "T00:00:00" to that yields Invalid Date, so parse both shapes
   before comparing (the detail page shares this helper's logic). */
function parseDay(value: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return new Date(+m[1]!, +m[2]! - 1, +m[3]!).getTime();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return NaN;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
const isOverdue = (j: Job) =>
  isPending(j) &&
  !!j.dueDate &&
  Number.isFinite(parseDay(j.dueDate)) &&
  parseDay(j.dueDate) < new Date(new Date().toDateString()).getTime();

/* ---------------------------------- icons ---------------------------------- */

function IconChevronDown() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[10px] w-[10px] text-[var(--hig-accent)]"
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

/* ---------------------------------- card ---------------------------------- */

/**
 * Split card with the photo strip FLUSH to the card's left edge (like the
 * Verdant reference — no padding frame around the image): the strip takes
 * ~1/3 of the card width and spans its full height, with a quiet placeholder
 * when the job has no pictures. The right side leads with the subject name,
 * the garment description underneath, and the price + status pill at the foot.
 */
function JobCard({ job }: { job: Job }) {
  const router = useRouter();
  const overdue = isOverdue(job);
  const ready = isReady(job);
  const delivered = isDelivered(job);

  let pill: string;
  let label: string;
  let note: string;
  let noteClass = "";
  if (overdue) {
    pill = "bg-[var(--hig-danger)] text-white";
    label = "Overdue";
    note = `was due ${formatDueDate(job.dueDate)}`;
    noteClass = " text-[var(--hig-danger)]";
  } else if (isPending(job)) {
    pill = "bg-[var(--hig-warning-tint)] text-[var(--hig-warning)]";
    label = "In progress";
    note = job.dueDate ? `due ${formatDueDate(job.dueDate)}` : "no due date";
  } else if (ready) {
    pill = "bg-[var(--hig-success-tint)] text-[var(--hig-success)]";
    label = "Ready";
    note = job.dueDate
      ? `ready · due ${formatDueDate(job.dueDate)}`
      : "ready for pickup";
  } else if (delivered) {
    // accent blue — "done" reads distinctly from Ready's green and keeps the
    // one-accent rule; gray is reserved for canceled.
    pill = "bg-[var(--hig-accent-tint)] text-[var(--hig-accent)]";
    label = "Delivered";
    note = `collected ${formatDueDate(job.deliveredAt)}`;
  } else {
    pill = "bg-[var(--hig-separator)] text-[var(--hig-label-secondary)]";
    label = "Canceled";
    note = "canceled";
  }

  /* photo strip — once a finished-job photo exists it wins (it shows the
     outcome); before that, fall back to the first style reference. A quiet
     placeholder marks the slot when the job has no pictures at all. */
  const stylePhotos = (job.styleRef ?? [])
    .map((p) => p.url)
    .filter(Boolean);
  const finishedPhotos = (job.finishedJob ?? [])
    .map((p) => p.url)
    .filter(Boolean);
  const photos = [...stylePhotos, ...finishedPhotos];
  const cover = finishedPhotos[0] ?? stylePhotos[0];

  /* the whole card is the tap target → /jobs/:id (the Inspection screen) */
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open job: ${job.description || "Garment"} for ${job.subjectName ?? "the client"}`}
      onClick={() => router.push(`/jobs/${job.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(`/jobs/${job.id}`);
        }
      }}
      className="flex cursor-pointer overflow-hidden rounded-[20px] bg-[var(--hig-card)] shadow-[0_1px_3px_rgba(0,0,0,0.10),0_1px_2px_rgba(0,0,0,0.06)] transition-transform duration-200 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--hig-accent)]"
    >
      {/* photo strip — flush with the card's left edge, spans the full height */}
      <div className="relative w-1/3 min-h-[112px] shrink-0 self-stretch overflow-hidden bg-[var(--hig-fill)]">
        {cover ? (
          <img
            src={cover}
            alt={job.description || "Garment"}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[var(--hig-label-tertiary)]">
            <IconPhoto />
          </div>
        )}
        {cover && photos.length > 1 && (
          <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/45 px-1.5 py-0.5 text-[9px] font-semibold text-white">
            {photos.length}
          </span>
        )}
      </div>
      {/* info — fills the remaining two thirds */}
      <div className="flex min-w-0 flex-1 flex-col px-4 py-3.5">
        <div className="flex items-baseline justify-between gap-2">
          {/* names and amounts read at 500 per the design system; 600 is
              reserved for tiny labels and pills */}
          <p className="truncate text-[16px] font-medium tracking-[-0.01em]">
            {job.subjectName ?? "Client"}
          </p>
          <p
            className={`max-w-[45%] shrink-0 truncate text-[9.5px] font-semibold uppercase tracking-[0.06em] text-[var(--hig-label-tertiary)]${noteClass}`}
          >
            {note}
          </p>
        </div>
        <p className="mt-1 line-clamp-2 text-[13px] leading-[18px] text-[var(--hig-label-secondary)]">
          {job.description || "Garment"}
        </p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div className="min-w-0">
            <div className="text-[17px] font-medium leading-none tracking-[-0.01em] [font-variant-numeric:tabular-nums]">
              <small className="mr-0.5 text-[11px] font-medium text-[var(--hig-label-secondary)]">
                ₦
              </small>
              {job.agreedPrice.toLocaleString("en-US")}
            </div>
            <p className="mt-1 text-[9px] font-medium uppercase tracking-[0.06em] text-[var(--hig-label-tertiary)]">
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
    </div>
  );
}

/* Skeleton bars mirror the card's anatomy: the flush photo strip on the
   left, then the subject line, two description lines, and the price + pill
   row at the foot — so loading doesn't shift the layout. */
function JobCardSkeleton() {
  const bar = "animate-pulse rounded bg-[var(--hig-separator)]";
  return (
    <div className="flex overflow-hidden rounded-[20px] bg-[var(--hig-card)] shadow-[0_1px_3px_rgba(0,0,0,0.10),0_1px_2px_rgba(0,0,0,0.06)]">
      <div className={`w-1/3 min-h-[112px] shrink-0 self-stretch ${bar}`} />
      <div className="flex min-w-0 flex-1 flex-col px-4 py-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <div className={`h-4 w-24 ${bar}`} />
          <div className={`h-2.5 w-14 shrink-0 ${bar}`} />
        </div>
        <div className={`mt-2.5 h-3.5 w-full ${bar}`} />
        <div className={`mt-1.5 h-3.5 w-2/3 ${bar}`} />
        <div className="mt-auto flex items-end justify-between gap-2 pt-4">
          <div className={`h-5 w-20 ${bar}`} />
          <div className={`h-6 w-[72px] rounded-full ${bar}`} />
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- page ---------------------------------- */

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

export default function JobsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<JobFilter>("all");
  const [newJobOpen, setNewJobOpen] = useState(false);

  const status = filter === "all" ? undefined : filter;

  /* The list — one infinite query per filter, cursor-paginated (limit 10). */
  const listQ = useInfiniteQuery({
    queryKey: ["jobs", "list", filter],
    queryFn: ({ pageParam }) => listJobs({ limit: 10, cursor: pageParam, status }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });

  /* Counts — a single limit-100 read (dashboard precedent) so the filter
     labels can show real totals instead of just loaded rows. */
  const countsQ = useQuery({
    queryKey: ["jobs", "counts"],
    queryFn: () => listJobs({ limit: 100 }),
  });

  const jobs = useMemo(
    () => listQ.data?.pages.flatMap((p) => p.data ?? []) ?? [],
    [listQ.data],
  );

  const counts = useMemo(() => {
    const all = countsQ.data?.data ?? [];
    return {
      all: all.length,
      pending: all.filter(isPending).length,
      completed: all.filter(isReady).length,
      delivered: all.filter(isDelivered).length,
    };
  }, [countsQ.data]);

  /* overdue banner — derived from the full counts feed, not just page one */
  const overdueJobs = useMemo(
    () => (countsQ.data?.data ?? []).filter(isOverdue),
    [countsQ.data],
  );
  const showBanner =
    (filter === "all" || filter === "pending") && overdueJobs.length > 0;

  const loading = listQ.isPending;
  const anyError = listQ.isError || countsQ.isError;
  const retryAll = () => {
    listQ.refetch();
    countsQ.refetch();
  };

  /* results line: loaded-vs-total, or a flat matching count per filter */
  const metaCount =
    !countsQ.data && listQ.data
      ? `${jobs.length} loaded`
      : filter === "all"
        ? jobs.length < counts.all
          ? `${jobs.length} of ${counts.all}`
          : `${counts.all} jobs`
        : jobs.length < counts[filter]
          ? `${jobs.length} of ${counts[filter]} matching`
          : `${counts[filter]} matching`;

  const empty = EMPTY_COPY[filter];
  const activeIndex = FILTERS.findIndex((f) => f.key === filter);

  return (
    <main className="hig min-h-dvh bg-[var(--hig-grouped)] pb-40 text-[var(--hig-label)] transition-colors duration-300">
      <div className="relative mx-auto w-full max-w-[430px]">
        {/* ---------- header ---------- */}
        <header className="hig-rise pt-3" style={{ animationDelay: "0ms" }}>
          <div className="flex items-center justify-between">
            <div className="text-[20px] font-medium tracking-[-0.02em]">
              HollySeams
            </div>
            <ThemeToggle />
          </div>
          <p className="mt-4 text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--hig-label-secondary)]">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
          <h1 className="mt-1 text-[34px] font-medium leading-[41px] tracking-[-0.02em]">
            Jobs, <span className="text-[var(--hig-accent)]">on the rack.</span>
          </h1>
        </header>

        {/* ---------- status filter (counts in labels) ---------- */}
        {/* 24px section gap (8pt grid) between the header and the filter */}
        <div
          className="hig-rise relative mt-6 flex rounded-[14px] bg-[var(--hig-card)] p-[3px] shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)]"
          style={{ animationDelay: "40ms" }}
        >
          {/* sliding thumb — one quarter per segment */}
          <span
            aria-hidden="true"
            className="absolute bottom-[3px] left-[3px] top-[3px] w-[calc((100%-6px)/4)] rounded-[11px] bg-[var(--hig-fill)] transition-transform duration-300 ease-out"
            style={{ transform: `translateX(${activeIndex * 100}%)` }}
          />
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`relative z-10 flex min-w-0 flex-1 flex-col items-center gap-[1px] rounded-[11px] px-1 py-2 transition-colors duration-200 ${
                filter === f.key
                  ? "text-[var(--hig-label)]"
                  : "text-[var(--hig-label-secondary)]"
              }`}
            >
              <span className="text-[12.5px] font-semibold">{f.label}</span>
              <span
                className={`text-[10.5px] font-semibold [font-variant-numeric:tabular-nums] ${
                  filter === f.key
                    ? "text-[var(--hig-accent)]"
                    : "text-[var(--hig-label-secondary)]"
                }`}
              >
                {countsQ.isPending ? "…" : counts[f.key]}
              </span>
            </button>
          ))}
        </div>

        {/* ---------- results line ---------- */}
        <div
          className="hig-rise mt-4 flex items-baseline justify-between text-[12px] text-[var(--hig-label-secondary)] [font-variant-numeric:tabular-nums]"
          style={{ animationDelay: "80ms" }}
        >
          <span>{metaCount}</span>
          <span className="flex items-center gap-1">
            <IconChevronDown />
            newest first
          </span>
        </div>

        {/* ---------- error banner ---------- */}
        {anyError && (
          <div
            className="mt-4 flex items-center justify-between rounded-[16px] bg-[var(--hig-danger-tint)] px-4 py-3"
            style={{ animationDelay: "100ms" }}
          >
            <p className="text-[15px] text-[var(--hig-danger)]">
              Couldn&apos;t reach the studio. Check your connection.
            </p>
            <button
              type="button"
              onClick={retryAll}
              className="shrink-0 pl-3 text-[15px] font-semibold text-[var(--hig-accent)]"
            >
              Retry
            </button>
          </div>
        )}

        {/* ---------- overdue banner ---------- */}
        {showBanner && !anyError && (
          <div
            className="hig-rise mt-4 flex items-center gap-2.5 rounded-[16px] bg-[var(--hig-danger-tint)] px-4 py-3"
            style={{ animationDelay: "100ms" }}
          >
            <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
              <span className="hig-ping absolute inset-0 rounded-full bg-[var(--hig-danger)]" />
              <span className="relative h-2.5 w-2.5 rounded-full bg-[var(--hig-danger)]" />
            </span>
            <div className="flex-1 text-[12.5px] text-[var(--hig-danger)]">
              <b>
                {overdueJobs.length} garment
                {overdueJobs.length === 1 ? "" : "s"} overdue
              </b>
              <small className="block text-[11.5px] text-[var(--hig-label-secondary)]">
                {overdueJobs[0]?.description} — was due{" "}
                {formatDueDate(overdueJobs[0]?.dueDate)}
              </small>
            </div>
          </div>
        )}

        {/* ---------- the list ---------- */}
        {loading ? (
          <div className="mt-4 space-y-4">
            {[0, 1, 2, 3].map((i) => (
              <JobCardSkeleton key={i} />
            ))}
          </div>
        ) : jobs.length === 0 && !anyError ? (
          <div
            className="hig-rise mt-4 rounded-[20px] bg-[var(--hig-card)] px-6 py-10 text-center"
            style={{ animationDelay: "120ms" }}
          >
            <p className="text-[15px] font-semibold">{empty.big}</p>
            <p className="mt-1.5 text-[13px] leading-5 text-[var(--hig-label-secondary)]">
              {empty.small}
            </p>
            <button
              type="button"
              onClick={() => setNewJobOpen(true)}
              className="mt-4 rounded-[13px] bg-[var(--hig-accent)] px-5 py-3 text-[14px] font-semibold text-white transition-transform duration-200 active:scale-95"
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

            {/* show more — only while a next cursor exists */}
            {listQ.hasNextPage && (
              <button
                type="button"
                onClick={() => listQ.fetchNextPage()}
                disabled={listQ.isFetchingNextPage}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-[16px] bg-[var(--hig-card)] py-3.5 text-[15px] font-medium text-[var(--hig-label)] transition-transform duration-200 active:scale-[0.98] disabled:opacity-60"
              >
                {listQ.isFetchingNextPage ? (
                  <>
                    <span
                      className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--hig-accent-soft)] border-t-[var(--hig-accent)]"
                      aria-hidden="true"
                    />
                    Loading…
                  </>
                ) : (
                  <>
                    Show more jobs
                    <span className="text-[var(--hig-accent)]">▾</span>
                  </>
                )}
              </button>
            )}
            {!listQ.hasNextPage && (
              <p className="mt-5 text-center text-[11.5px] text-[var(--hig-label-tertiary)]">
                You&apos;re all caught up — newest jobs first.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ---------- FAB + tab bar (anchored to the phone-width column) ---------- */}
      <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-10">
        <div className="relative mx-auto w-full max-w-[430px]">
          <button
            type="button"
            aria-label="New job"
            title="New job"
            onClick={() => setNewJobOpen(true)}
            className="pointer-events-auto absolute bottom-[84px] right-0 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--hig-accent)] text-white shadow-[var(--hig-bar-shadow)] transition-transform duration-200 active:scale-90"
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
          <div className="pointer-events-auto flex h-16 items-center rounded-t-[24px] bg-[var(--hig-bar)] px-2 shadow-[var(--hig-bar-shadow)] backdrop-blur-[20px] backdrop-saturate-150">
            <button
              type="button"
              aria-label="Overview"
              onClick={() => router.push("/dashboard")}
              className="flex h-full flex-1 flex-col items-center justify-center gap-0.5 rounded-[16px] text-[var(--hig-label-tertiary)] transition-all duration-200 active:scale-95"
            >
              <span className="h-[22px] w-[22px]">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19Z" />
                  <path d="M9.5 20.5v-5.5h5v5.5" />
                </svg>
              </span>
              <span className="text-[10px] font-medium">Overview</span>
            </button>
            <button
              type="button"
              aria-label="Jobs"
              aria-current="page"
              className="flex h-full flex-1 flex-col items-center justify-center gap-0.5 rounded-[16px] bg-[var(--hig-accent-tint)] text-[var(--hig-accent)] transition-all duration-200 active:scale-95"
            >
              <span className="h-[22px] w-[22px]">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="6" cy="6" r="2.6" />
                  <circle cx="6" cy="18" r="2.6" />
                  <path d="M20 4 8.4 15.6" />
                  <path d="m14.2 14.2 5.8 5.8" />
                  <path d="m8.4 8.4 3.4 3.4" />
                </svg>
              </span>
              <span className="text-[10px] font-semibold">Jobs</span>
            </button>
            <button
              type="button"
              aria-label="Customers"
              className="flex h-full flex-1 flex-col items-center justify-center gap-0.5 rounded-[16px] text-[var(--hig-label-tertiary)] transition-all duration-200 active:scale-95"
            >
              <span className="h-[22px] w-[22px]">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="9" cy="7.5" r="3.5" />
                  <path d="M3 20.5v-1a6 6 0 0 1 12 0v1" />
                  <path d="M16 4.6a3.5 3.5 0 0 1 0 6.5" />
                  <path d="M17.5 14.6a6 6 0 0 1 3.5 5.4v.5" />
                </svg>
              </span>
              <span className="text-[10px] font-medium">Customers</span>
            </button>
            <button
              type="button"
              aria-label="Reports"
              className="flex h-full flex-1 flex-col items-center justify-center gap-0.5 rounded-[16px] text-[var(--hig-label-tertiary)] transition-all duration-200 active:scale-95"
            >
              <span className="h-[22px] w-[22px]">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 3v16a2 2 0 0 0 2 2h16" />
                  <path d="M8 17v-4" />
                  <path d="M13 17V7" />
                  <path d="M18 17v-7" />
                </svg>
              </span>
              <span className="text-[10px] font-medium">Reports</span>
            </button>
          </div>
        </div>
      </nav>

      {/* New job — same sheet as the dashboard, wired to the API */}
      <NewJobModal open={newJobOpen} onClose={() => setNewJobOpen(false)} />
    </main>
  );
}