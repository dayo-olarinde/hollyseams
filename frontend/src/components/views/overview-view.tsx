import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import NewJobModal from "@/components/jobs/new-job-modal";
import { ErrorBanner } from "@/components/ui/error-banner";
import TabBar from "@/components/ui/tab-bar";
import ThemeToggle from "@/components/ui/theme-toggle";
// The bar shape, shared with the tap shell so a tab never shows two different skeletons.
import { SkeletonBar as Skeleton } from "@/components/ui/skeletons";
import {
  useJobCounts,
  useJobsList,
  usePrefetchJob,
} from "@/hooks/use-jobs";
import {
  useMonthlyRevenue,
  useOutstandingPayments,
} from "@/hooks/use-reports";
import { avatarColor, avatarTint } from "@/lib/avatar-colors";
import {
  formatDay,
  initials,
  isOverdue,
  naira,
} from "@/lib/format";
import type { Job } from "@/types/job";

/**
 * The overview, v3 — the Stitch design, faithfully.
 *
 * The earlier pass treated Stitch as inspiration and trimmed it to what the
 * backend could "honestly" support; that was the wrong call — v2 remains the
 * fallback and this folder is the testing ground, so the UI follows the design
 * and the data bends to fit it. Every section of Stitch's `today_studio_overview`
 * is here, in its order, at its density:
 *
 *   1. Fixed top bar — monogram avatar + studio name, trailing buttons
 *   2. Date line over the "Today" Large Title
 *   3. The money bento — Collected / To collect, icon-chip corners
 *   4. The quick-actions bar — Record Payment / New Order / Measure
 *   5. Today's pickups & deadlines — the schedule-shaped section
 *   6. Workshop floor — segmented control + garment cards with cover thumbs
 *   7. The atelier note — a data-derived line, same visual slot
 *
 * The smart part is the wiring, and it is stated per-section below: Stitch's
 * fictional content (fittings at 11:30, "Victoria Island Studio", calendar
 * goals) is replaced by what the API actually answers — due dates, ready-to-
 * collect work, live balances. HIG stays as the paint: one blue accent, flat
 * fills, tabular numerals, semantic pills.
 */
const reduceMotion =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function CountUp({
  value,
  currency = false,
}: {
  value: number;
  currency?: boolean;
}) {
  const [display, setDisplay] = useState(0);

  const lastRef = useRef(value);
  useEffect(() => {
    if (reduceMotion) {
      setDisplay(value);
      lastRef.current = value;
      return;
    }
    const start = performance.now();
    const duration = 900;
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(
        Math.round(lastRef.current + (value - lastRef.current) * eased),
      );
      if (p < 1) raf = requestAnimationFrame(step);
      else lastRef.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <>{currency ? naira(display) : display.toLocaleString("en-US")}</>
  );
}

const card = "stitch-card rounded-xl";

/** Rendered before the counts arrive, so the counters read one non-null shape. */
const NO_COUNTS = { all: 0, pending: 0, ready: 0, delivered: 0 };

function ShearIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
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
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.5" y="5" width="17" height="16" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}

/**
 * Stitch's garment thumbnail, WhatsApp-row sized: cover photo or initials tile.
 */
function JobThumb({ job }: { job: Job }) {
  if (job.coverUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote Cloudinary URLs, unoptimized on purpose
      <img loading="lazy"
        src={job.coverUrl}
        alt=""
        className="h-12 w-12 shrink-0 rounded-[10px] object-cover"
      />
    );
  }
  const name = job.subjectName ?? "";
  return (
    <div
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] text-[14px] font-semibold"
      style={{ backgroundColor: avatarTint(name), color: avatarColor(name) }}
    >
      {initials(name)}
    </div>
  );
}

/** The workshop-floor filter. API "completed" already means "ready, not delivered". */
type FloorFilter = "all" | "pending" | "completed" | "delivered";

export function OverviewView() {
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [floor, setFloor] = useState<FloorFilter>("all");
  const prefetchJob = usePrefetchJob();
  const revenueQ = useMonthlyRevenue();
  const outstandingQ = useOutstandingPayments();
  const countsQ = useJobCounts();
  const floorQ = useJobsList(floor);

  const months = revenueQ.data ?? [];
  const outstanding = outstandingQ.data ?? [];
  const counts = countsQ.data ?? NO_COUNTS;
  const floorJobs = floorQ.data ?? [];
  const allJobs = useJobsList("all").data ?? [];

  const thisMonth = months.at(-1);
  const prevMonth = months.at(-2);
  const deltaPct =
    thisMonth && prevMonth && prevMonth.revenue > 0
      ? ((thisMonth.revenue - prevMonth.revenue) / prevMonth.revenue) * 100
      : null;

  const totalOutstanding = outstanding.reduce(
    (sum, o) => sum + o.balanceDue,
    0,
  );

  /**
   * The schedule section, filled with truth: jobs due within two days
   * (soonest first), then ready-to-collect work. No appointments exist in the
   * backend, so "today's sessions" are today's deadlines and pickups — the
   * things that genuinely have a clock on them.
   */
  const now = Date.now();
  const inTwoDays = now + 2 * 24 * 60 * 60 * 1000;
  const schedule = allJobs
    .filter((j) => j.status !== "canceled")
    .map((j) => {
      const dueSoon =
        j.dueDate !== null &&
        j.status === "pending" &&
        new Date(j.dueDate).getTime() <= inTwoDays;
      const ready = j.status === "completed" && j.deliveredAt === null;
      return { job: j, dueSoon, ready, rank: dueSoon ? 0 : ready ? 1 : 2 };
    })
    .filter((s) => s.dueSoon || s.ready)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 3);

  const nextDue = outstanding
    .filter((o) => o.dueDate)
    .sort(
      (a, b) =>
        new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime(),
    )[0];

  const errors = [revenueQ.error, outstandingQ.error, countsQ.error, floorQ.error];
  const firstError = errors.find(Boolean);

  const retryAll = () => {
    void revenueQ.refetch();
    void outstandingQ.refetch();
    void countsQ.refetch();
    void floorQ.refetch();
  };

  const weekdayDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  // Single-word labels (Stitch's style) — anything longer wraps at 390px.
  const floorTabs: Array<{
    key: FloorFilter;
    label: string;
    countKey: "all" | "pending" | "ready" | "delivered";
  }> = [
    { key: "all", label: "All", countKey: "all" },
    { key: "pending", label: "Sewing", countKey: "pending" },
    { key: "completed", label: "Ready", countKey: "ready" },
    { key: "delivered", label: "Done", countKey: "delivered" },
  ];

  return (
    <main className="hig content-safe min-h-dvh bg-transparent text-(--hig-label) transition-colors duration-300">
      {/* ——— 1. Fixed top bar (Stitch's: monogram + name, trailing actions) ——— */}
      <header className="fixed inset-x-0 top-0 z-30 bg-(--hig-bar)/80 px-3 pb-1.5 pt-2 backdrop-blur-[20px] backdrop-saturate-150">
        <div className="mx-auto flex h-12 w-full items-center justify-between">
          {/* The wordmark at the shared header size — same 20px/medium as every other tab. */}
          <p className="text-[20px] font-medium tracking-[-0.02em]">
            Holly<span className="text-(--hig-accent)">Seams</span>
          </p>
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto w-full px-3 pb-24 pt-16">
        {/* ——— 2. Date line + Large Title ——— */}
        <div className="hig-rise" style={{ animationDelay: "0ms" }}>
          <p className="text-[13px] leading-4 text-(--hig-label-secondary)">
            {weekdayDate}
          </p>
          <h1 className="text-[34px] font-semibold leading-10 tracking-[-0.02em]">
            Today
          </h1>
        </div>

        {firstError && (
          <ErrorBanner
            error={firstError}
            offlineMessage="Couldn't reach the studio. Check your connection."
            onRetry={retryAll}
            className="mb-4 mt-4"
          />
        )}

      {/* ——— 3. The money bento ——— */}
      <section className="hig-rise mt-3.5" style={{ animationDelay: "60ms" }}>
        <div className="grid grid-cols-2 gap-2">
          <div className={`${card} flex flex-col justify-between p-3`}>
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] text-(--hig-label-secondary)">
                Total collected
              </span>
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-(--hig-success-tint) text-(--hig-success)">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
                  </svg>
                </span>
              </div>
              <div className="mt-1.5">
                <div className="text-[22px] font-semibold leading-6.5 tracking-[-0.02em] [font-variant-numeric:tabular-nums]">
                  {revenueQ.isPending ? (
                    <Skeleton className="h-6 w-24" />
                  ) : (
                    <CountUp value={thisMonth?.revenue ?? 0} currency />
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-(--hig-success)" aria-hidden="true" />
                  <span className="text-[11.5px] font-medium text-(--hig-label-secondary)">
                    {deltaPct !== null
                      ? `${deltaPct >= 0 ? "▲" : "▼"} ${Math.abs(deltaPct).toFixed(0)}% vs last month`
                      : "this month to date"}
                  </span>
                </div>
              </div>
            </div>

            <div className={`${card} flex flex-col justify-between p-3`}>
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] text-(--hig-label-secondary)">
                  Total pending
                </span>
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-(--hig-warning-tint) text-(--hig-warning)">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="8.5" />
                    <path d="M12 7.5V12l3 2" />
                  </svg>
                </span>
              </div>
              <div className="mt-1.5">
                <div className="text-[22px] font-semibold leading-6.5 tracking-[-0.02em] text-(--hig-accent) [font-variant-numeric:tabular-nums]">
                  {outstandingQ.isPending ? (
                    <Skeleton className="h-6 w-24" />
                  ) : (
                    <CountUp value={totalOutstanding} currency />
                  )}
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-(--hig-accent)" aria-hidden="true" />
                  <span className="truncate text-[11.5px] font-medium text-(--hig-label-secondary)">
                    {outstanding.length} client balance{outstanding.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ——— 4. Today's pickups & deadlines (the schedule slot, real content) ——— */}
        <section className="mt-3.5">
          <div className="mb-1.5 flex items-center justify-between px-0.5">
            <h2 className="text-[15px] font-semibold text-(--hig-label)">
              Today&apos;s pickups &amp; deadlines
            </h2>
            {schedule.length > 0 && (
              <span className="text-[12px] text-(--hig-label-secondary)">
                {schedule.length} item{schedule.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          {(() => {
            if (schedule.length === 0) {
              return (
                <div className={`${card} px-3 py-3 text-[13px] text-(--hig-label-secondary)`}>
                  Nothing due in the next two days — the bench is yours.
                </div>
              );
            }
            return (
              <div className={`${card} hig-rise overflow-hidden divide-y divide-(--hig-separator)`} style={{ animationDelay: "140ms" }}>
                {schedule.map(({ job, ready }) => {
                  const name = job.subjectName ?? "";
                  const overdue = isOverdue(job);
                  return (
                    <Link
                      key={job.id}
                      href={`/jobs/${job.id}`}
                      onPointerDown={() => prefetchJob(job.id)}
                      className="flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors duration-200 active:bg-(--hig-fill)"
                    >
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[12px] font-semibold"
                        style={{
                          backgroundColor: avatarTint(name),
                          color: avatarColor(name),
                        }}
                      >
                        {initials(name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[15px] font-semibold leading-5">
                            {name || "Client"}
                          </span>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              ready
                                ? "bg-(--hig-success-tint) text-(--hig-success)"
                                : overdue
                                  ? "bg-(--hig-danger-tint) text-(--hig-danger)"
                                  : "bg-(--hig-accent-tint) text-(--hig-accent)"
                            }`}
                          >
                            {ready ? "Ready" : formatDay(job.dueDate)}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[13px] leading-4 text-(--hig-label-secondary)">
                          {job.description || "Garment"}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                          <span className={ready ? "font-medium text-(--hig-success)" : "text-(--hig-label-secondary)"}>
                            {ready
                              ? "Waiting for pickup"
                              : overdue
                                ? "Overdue"
                                : "Due soon"}
                          </span>
                          <span className="text-(--hig-label-tertiary)">•</span>
                          <span className="text-(--hig-label-secondary) [font-variant-numeric:tabular-nums]">
                            {naira(job.agreedPrice)}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            );
          })()}
        </section>

        {/* ——— 6. Workshop floor: segmented control + garment cards ——— */}
        <section className="mt-3.5">
          <div className="mb-1.5 flex items-center justify-between px-0.5">
            <h2 className="text-[15px] font-semibold text-(--hig-label)">
              Workshop floor
            </h2>
            <Link
              href="/dashboard?tab=jobs"
              className="text-[12px] font-medium text-(--hig-accent) transition-opacity active:opacity-60"
            >
              View All
            </Link>
          </div>

          {/* HIG segmented control, Stitch's placement. */}
          <div className="mb-3 flex items-center gap-1 rounded-lg border border-(--hig-separator) bg-(--hig-filter-well) p-1">
            {floorTabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setFloor(t.key)}
                className={`flex-1 rounded-md px-2 py-1.5 text-center text-[12px] transition-all duration-150 ${
                  floor === t.key
                    ? "bg-(--hig-card) font-semibold text-(--hig-label) shadow-(--hig-card-shadow)"
                    : "text-(--hig-label-secondary) active:text-(--hig-label)"
                }`}
              >
                {/* "…" until the counts answer, "—" when they failed: loading is not zero. */}
                {t.label}{" "}
                {countsQ.isPending
                  ? "(…)"
                  : countsQ.isError
                    ? "(—)"
                    : `(${counts[t.countKey]})`}
              </button>
            ))}
          </div>

          {floorQ.isPending ? (
            <div className="flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-25 w-full" />
              ))}
            </div>
          ) : floorJobs.length === 0 ? (
            <div className={`${card} px-3 py-3 text-[13px] text-(--hig-label-secondary)`}>
              Nothing here yet.
            </div>
          ) : (
            /* Stitch's floor: each garment its own card with a 12px gap — boxed cards
               are the design language here (the schedule keeps the grouped list). */
            <div className="flex flex-col gap-3">
              {floorJobs.slice(0, 6).map((j) => (
                <GarmentCard key={j.id} job={j} />
              ))
              }
            </div>
          )}
        </section>

        {/* ——— 7. The atelier note (same slot, data-derived) ——— */}
        <div className="stitch-card mt-3.5 flex items-center gap-2.5 rounded-xl p-3">
          <ShearIcon className="h-5 w-5 shrink-0 text-(--hig-accent)" />
          <p className="text-[13px] leading-4.5 text-(--hig-label-secondary)">
            {totalOutstanding > 0 ? (
              <>
                <b className="font-medium text-(--hig-label)">
                  {naira(totalOutstanding)}
                </b>{" "}
                awaits collection across {outstanding.length} garment
                {outstanding.length === 1 ? "" : "s"}
                {nextDue?.dueDate && (
                  <> — next due {formatDay(nextDue.dueDate)}.</>
                )}
                {counts.pending > 0 && <> {counts.pending} on the bench.</>}
              </>
            ) : (
              <>
                All settled — nothing outstanding.
                {counts.pending > 0 && <> {counts.pending} on the bench.</>}
              </>
            )}
          </p>
        </div>
      </div>

      <TabBar
        active="overview"
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
              className="h-7 w-7"
              aria-hidden="true"
            >
              <path d="M12 5.5v13" />
              <path d="M5.5 12h13" />
            </svg>
          </button>
        }
      />

      <NewJobModal open={newJobOpen} onClose={() => setNewJobOpen(false)} />
    </main>
  );
}

/**
 * The garment card — Stitch's floor card: 48px thumb, three lines of content,
 * white box with the Stitch ring + whisper shadow, 12px gaps between cards.
 */
function GarmentCard({ job }: { job: Job }) {
  const prefetchJob = usePrefetchJob();
  const delivered = job.deliveredAt !== null;
  const meta =
    job.status === "completed"
      ? delivered
        ? { chip: "bg-(--hig-separator) text-(--hig-label-secondary)", label: "Delivered" }
        : { chip: "bg-(--hig-success-tint) text-(--hig-success)", label: "Ready" }
      : job.status === "pending"
        ? { chip: "bg-(--hig-warning-tint) text-(--hig-warning)", label: "In progress" }
        : { chip: "bg-(--hig-separator) text-(--hig-label-secondary)", label: "Canceled" };

  const paid = job.payments?.reduce((sum, p) => sum + p.amount, 0) ?? 0;
  const balance = job.agreedPrice - paid;

  return (
    <Link
      href={`/jobs/${job.id}`}
      onPointerDown={() => prefetchJob(job.id)}
      className="stitch-card flex cursor-pointer items-center gap-3 rounded-xl p-3 transition-transform duration-200 active:scale-[0.98]"
    >
      <JobThumb job={job} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-[15px] font-semibold leading-5">
            {job.description || "Garment"}
          </h3>
          <span
            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${meta.chip}`}
          >
            {meta.label}
          </span>
        </div>
        <p className="truncate text-[12px] leading-4 text-(--hig-label-secondary)">
          {job.subjectName}
        </p>
        <div className="mt-0.5 flex items-center justify-between">
          <span className="flex items-center gap-1 text-[12px] text-(--hig-label-secondary)">
            <CalendarIcon className="h-3.5 w-3.5" />
            {job.dueDate
              ? `${delivered ? "delivered" : "due"} ${formatDay(job.dueDate)}`
              : delivered
                ? "delivered"
                : "no due date"}
          </span>
          <span
            className={`text-[12px] font-medium [font-variant-numeric:tabular-nums] ${
              balance > 0 ? "text-(--hig-accent)" : "text-(--hig-success)"
            }`}
          >
            {balance > 0 ? `${naira(balance)} balance` : "Paid in full"}
          </span>
        </div>
      </div>
    </Link>
  );
}
