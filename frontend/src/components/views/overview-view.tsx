import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
  currentMonthName,
  formatDay,
  formatStampDay,
  greeting,
  initials,
  isOverdue,
  monthShort,
  naira,
  todayLine,
} from "@/lib/format";
import type { Job } from "@/types/job";
import type { MonthlyRevenue } from "@/types/report";

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
  const fromRef = useRef(0);

  useEffect(() => {
    if (reduceMotion) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const duration = 900;
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(
        Math.round(fromRef.current + (value - fromRef.current) * eased),
      );
      if (p < 1) raf = requestAnimationFrame(step);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <>{currency ? naira(display) : display.toLocaleString("en-US")}</>
  );
}

function IconScissors() {
  return (
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
  );
}

const cardClass = "rounded-[20px] bg-(--hig-card)";

/** Rendered before the counts arrive, so the two counters can read from one non-null shape. */
const NO_COUNTS = { all: 0, pending: 0, ready: 0, delivered: 0 };

function GroupHeader({
  title,
  link,
  linkHref,
  className = "",
  delay = 0,
}: {
  title: string;
  link?: string;
  linkHref?: string;
  className?: string;
  delay?: number;
}) {
  return (
    <div
      className={`hig-rise mb-2 flex items-baseline justify-between ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-secondary)">
        {title}
      </h2>
      {link &&
        (linkHref ? (
          <Link
            href={linkHref}
            className="cursor-pointer text-[13px] font-medium text-(--hig-accent) transition-opacity duration-200 active:opacity-60"
          >
            {link}
          </Link>
        ) : (
          <span className="text-[13px] font-medium text-(--hig-accent)">
            {link}
          </span>
        ))}
    </div>
  );
}

function RevenueChart({ data }: { data: MonthlyRevenue[] }) {
  const W = 340;
  const H = 140;
  const padX = 10;
  const padTop = 34;
  const bottom = 112;
  const max = Math.max(...data.map((m) => m.revenue), 1);

  const pts = useMemo(() => {
    if (data.length === 1) {
      return [
        {
          x: W / 2,
          y: bottom - (data[0]!.revenue / max) * (bottom - padTop),
          m: data[0]!,
        },
      ];
    }
    return data.map((m, i) => ({
      x: padX + (i * (W - padX * 2)) / (data.length - 1),
      y: bottom - (m.revenue / max) * (bottom - padTop),
      m,
    }));
  }, [data, max]);

  const lineD = useMemo(() => {
    if (pts.length < 2) return `M ${pts[0]?.x ?? W / 2} ${pts[0]?.y ?? bottom}`;
    let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)]!;
      const p1 = pts[i]!;
      const p2 = pts[i + 1]!;
      const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
      d +=
        ` C ${(p1.x + (p2.x - p0.x) / 6).toFixed(1)} ${(p1.y + (p2.y - p0.y) / 6).toFixed(1)}, ` +
        `${(p2.x - (p3.x - p1.x) / 6).toFixed(1)} ${(p2.y - (p3.y - p1.y) / 6).toFixed(1)}, ` +
        `${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  }, [pts]);

  if (data.length === 0) return null;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 block w-full"
        fill="none"
        aria-hidden="true"
      >
        {}
        <line x1="10" y1="34" x2="330" y2="34" stroke="var(--hig-grid)" />
        <line x1="10" y1="66" x2="330" y2="66" stroke="var(--hig-grid)" />
        <line x1="10" y1="98" x2="330" y2="98" stroke="var(--hig-grid)" />
        <line x1="10" y1="112" x2="330" y2="112" stroke="var(--hig-grid)" />
        {}
        {pts.length >= 2 && (
          <path
            d={`${lineD} L ${pts[pts.length - 1]!.x} ${bottom} L ${pts[0]!.x} ${bottom} Z`}
            fill="var(--hig-accent-tint)"
          />
        )}
        {}
        {pts.length >= 2 && (
          <path
            d={lineD}
            stroke="var(--hig-accent)"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {}
        {pts.map((p, i) => (
          <g key={i}>
            {i === pts.length - 1 && (
              <circle
                cx={p.x}
                cy={p.y}
                r="8"
                fill="var(--hig-accent)"
                opacity="0.14"
              />
            )}
            <circle
              cx={p.x}
              cy={p.y}
              r={i === pts.length - 1 ? 4 : 2.4}
              fill="var(--hig-accent)"
              className={i === pts.length - 1 ? "animate-dot-pulse" : ""}
              style={
                i === pts.length - 1
                  ? { transformBox: "fill-box", transformOrigin: "center" }
                  : undefined
              }
            />
          </g>
        ))}
      </svg>
      <div className="mt-1.5 flex justify-between px-1.5">
        {data.map((m, i) => (
          <span
            key={m.monthKey}
            className={`text-[10px] font-medium tracking-[0.04em] ${
              i === data.length - 1
                ? "font-semibold text-(--hig-accent)"
                : "text-(--hig-label-tertiary)"
            }`}
          >
            {monthShort(m.monthKey)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function OverviewView() {
  const [newJobOpen, setNewJobOpen] = useState(false);
  const prefetchJob = usePrefetchJob();
  const revenueQ = useMonthlyRevenue();
  const outstandingQ = useOutstandingPayments();
  const countsQ = useJobCounts();

  /**
   * The five newest jobs, from the same paginated list the Jobs tab reads.
   *
   * This screen used to fetch **100 jobs** (`limit=100`) and slice the first five from them,
   * because that one request also had to carry the status counts. It was 100 rows over the phone
   * for 5 visible ones, and the counts it produced were wrong past a hundred jobs. Now the counts
   * come from the aggregate endpoint and this is a normal first page of ten.
   */
  const recentQ = useJobsList("all");

  const months = revenueQ.data ?? [];
  const outstanding = outstandingQ.data ?? [];
  const counts = countsQ.data ?? NO_COUNTS;
  const jobs = recentQ.data ?? [];

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
  const largestDue = outstanding.reduce(
    (max, o) => Math.max(max, o.balanceDue),
    0,
  );

  /**
   * Each section reports its own state.
   *
   * The old page collapsed four queries into one `loading` boolean, so the revenue card stayed a
   * skeleton until the *slowest* of the four answered, and an error anywhere replaced everything.
   * Per-section flags mean the numbers that are ready are on screen — which is the whole point of
   * parallel requests.
   */
  const errors = [revenueQ.error, outstandingQ.error, countsQ.error, recentQ.error];
  const firstError = errors.find(Boolean);
  const countsLoading = countsQ.isPending;
  const moneyLoading = outstandingQ.isPending;

  const retryAll = () => {
    void revenueQ.refetch();
    void outstandingQ.refetch();
    void countsQ.refetch();
    void recentQ.refetch();
  };

  const timeOfDay = greeting();
  const monthName = currentMonthName();

  return (
    <main className="hig content-safe min-h-dvh bg-(--hig-grouped) text-(--hig-label) transition-colors duration-300">
      {}
      <div className="relative mx-auto w-full max-w-107.5">        {}
        {}
        <header
          className="hig-rise sticky top-0 z-20 flex items-center justify-between bg-(--hig-bar)/80 px-5 py-2.5 backdrop-blur-[20px] backdrop-saturate-150"
          style={{ animationDelay: "0ms" }}
        >
          <p className="text-[20px] font-medium tracking-[-0.02em]">
            Holly<span className="text-(--hig-accent)">Seams</span>
          </p>
          {}
          <ThemeToggle />
        </header>

        {}
        <div className="hig-rise mb-8 px-5 pt-3" style={{ animationDelay: "40ms" }}>
          {}
          <div className="relative mt-3 rounded-3xl bg-(--hig-accent-tint) px-5 pb-3.5 pt-4">
            <div className="flex items-center gap-2">
              {}
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="hig-ping absolute inset-0 rounded-full bg-(--hig-accent)" />
                <span className="relative h-2 w-2 rounded-full bg-(--hig-accent)" />
              </span>
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-(--hig-label-secondary)">
                {todayLine()}
              </p>
            </div>
            <h1 className="mt-2 text-[34px] font-medium leading-10.25 tracking-[-0.02em]">
              {timeOfDay}, Wunmi —{" "}
              {}
              <span className="text-(--hig-accent)">{monthName} is flying.</span>
            </h1>
            {}
            <p className="mt-1.5 flex items-center gap-1.5 text-[14px] font-medium text-(--hig-label-secondary)">
              <span className="h-3.5 w-3.5 text-(--hig-accent)" aria-hidden="true">
                <IconScissors />
              </span>
              Needles <span className="text-(--hig-label)">busy</span>. Threads{" "}
              <span className="text-(--hig-label)">tight</span>.
            </p>
            {}
            <div
              className="mt-3.5 border-t border-dashed border-(--hig-accent-line)"
              aria-hidden="true"
            />
          </div>
        </div>

        {}
        {firstError && (
          <ErrorBanner
            error={firstError}
            offlineMessage="Couldn't reach the studio. Check your connection."
            onRetry={retryAll}
            className="mb-4"
          />
        )}

        {}
        <section
          className={`${cardClass} hig-rise mb-3 px-4 pb-4 pt-4`}
          style={{ animationDelay: "60ms" }}
        >
          <div className="flex items-center justify-between">            <div className="text-[17px] font-medium leading-5.5">Revenue</div>
            {deltaPct !== null && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.75 text-[11px] font-medium ${
                  deltaPct >= 0
                    ? "bg-(--hig-success-tint) text-(--hig-success)"
                    : "bg-(--hig-danger-tint) text-(--hig-danger)"
                }`}
              >
                {deltaPct >= 0 ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(0)}%
              </span>
            )}
          </div>

          {}
          {revenueQ.isPending ? (
            <div className="py-2">
              <Skeleton className="h-9 w-36" />
              <Skeleton className="mt-2 h-3 w-32" />
              <Skeleton className="mt-3 h-45.75 w-full" />
            </div>
          ) : (
            <>
              <div className="mt-2 text-[34px] font-medium leading-10.25 tracking-[-0.02em] [font-variant-numeric:tabular-nums]">
                <small className="mr-0.5 text-[19px] font-medium text-(--hig-label-secondary)">
                  ₦
                </small>
                <CountUp value={thisMonth?.revenue ?? 0} />
              </div>
              <p className="text-[13px] text-(--hig-label-secondary)">
                {thisMonth
                  ? `${monthName} to date${months.length > 1 ? ` · ${months.length}-month trend` : ""}`
                  : "No revenue yet — payments will appear here."}
              </p>
              <RevenueChart data={months} />
            </>
          )}
        </section>

        <section
          className="hig-rise mb-3 grid grid-cols-2 gap-3"
          style={{ animationDelay: "120ms" }}
        >
          <div className={`${cardClass} px-4 py-3`}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-medium text-(--hig-label-secondary)">
                To collect
              </span>
              <span className="h-2 w-2 rounded-full bg-(--hig-warning) shadow-[0_0_10px_rgba(255,149,0,0.55)]" aria-hidden="true" />
            </div>
            <div className="text-[22px] font-medium leading-7 tracking-[-0.01em] [font-variant-numeric:tabular-nums]">
              {moneyLoading ? (
                <>
                  <Skeleton className="h-7 w-20" />
                  <Skeleton className="mt-2 h-3 w-24" />
                </>
              ) : (
                <>
                  <small className="mr-0.5 text-[13px] font-medium text-(--hig-label-secondary)">
                    ₦
                  </small>
                  <CountUp value={totalOutstanding} />
                </>
              )}
            </div>            {}
            <p className="mt-2 truncate text-[12px] leading-4 text-(--hig-label-secondary)">
              {outstanding.length > 0 ? (
                <>
                  <b className="font-medium text-(--hig-label)">{outstanding.length} garment{outstanding.length === 1 ? "" : "s"}</b>
                  {largestDue > 0 && <> · largest {naira(largestDue)}</>}
                </>
              ) : (
                "all settled"
              )}
            </p>
          </div>
          <div className={`${cardClass} px-4 py-3`}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-medium text-(--hig-label-secondary)">
                On the bench
              </span>
              <span className="h-2 w-2 rounded-full bg-(--hig-accent) shadow-[0_0_10px_rgba(10,132,255,0.55)]" aria-hidden="true" />
            </div>
            <div className="text-[22px] font-medium leading-7 tracking-[-0.01em] [font-variant-numeric:tabular-nums]">
              {countsLoading ? (
                <>
                  <Skeleton className="h-7 w-10" />
                  <Skeleton className="mt-2 h-3 w-16" />
                </>
              ) : (
                <CountUp value={counts.pending} />
              )}
            </div>
            {}
            <p className="mt-2 truncate text-[12px] leading-4 text-(--hig-label-secondary)">
              <b className="font-medium text-(--hig-label)">{counts.ready} ready</b> to pick up
            </p>
          </div>
        </section>

        {}
        <GroupHeader title="Latest Work" link="View all" linkHref="/dashboard?tab=jobs" className="mt-8" delay={180} />
        {recentQ.isPending ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-18 w-full" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <p
            className={`${cardClass} px-4 py-4 text-[15px] text-(--hig-label-secondary)`}
          >
            No jobs yet — add your first garment from the Jobs tab.
          </p>
        ) : (          <div
            className={`${cardClass} hig-rise overflow-hidden divide-y divide-(--hig-separator)`}
            style={{ animationDelay: "200ms" }}
          >
            {jobs.slice(0, 5).map((j) => (
              <JobRow key={j.id} job={j} />
            ))}
          </div>
        )}

        {}
        <GroupHeader
          title="Balances to Collect"
          link={
            outstanding.length > 0 ? `${outstanding.length} open` : undefined
          }
          className="mt-8"
          delay={240}
        />
        {outstandingQ.isPending ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-19 w-full" />
            ))}
          </div>
        ) : outstanding.length === 0 ? (
          <p
            className={`${cardClass} px-4 py-4 text-[15px] text-(--hig-label-secondary)`}
          >
            All balances settled — nothing due right now.
          </p>
        ) : (          <div
            className={`${cardClass} hig-rise overflow-hidden divide-y divide-(--hig-separator)`}
            style={{ animationDelay: "260ms" }}
          >
            {outstanding.slice(0, 4).map((o) => {
              const balance = o.balanceDue;
              const pct =
                o.agreedPrice > 0
                  ? Math.min(
                      100,
                      Math.round((o.totalPaid / o.agreedPrice) * 100),
                    )
                  : 0;
              // The same rule the reports and the customer file use: an unpaid balance on a
              // cancelled job is not "overdue", it is a decision someone made.
              const overdue = isOverdue(o);

              const customerName = o.customer.name;
              const isSelf =
                !!o.subjectName &&
                o.subjectName.trim().toLowerCase() ===
                  customerName.trim().toLowerCase();
              return (
                /**
                 * A real link, not a div with a click handler.
                 *
                 * Same pixels, materially better behaviour on a phone: long-press gives the
                 * native "open in new tab / copy link" menu, the URL is in the status bar on
                 * hover, and `next/link` prefetches the route so the destination's JavaScript is
                 * already here. The data starts loading on `pointerdown` — the ~100–250ms between
                 * the finger landing and lifting is enough to hide the whole request.
                 */
                <Link
                  key={o.jobId}
                  href={`/jobs/${o.jobId}`}
                  onPointerDown={() => prefetchJob(o.jobId)}
                  className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors duration-200 active:bg-(--hig-fill) focus-visible:outline-2 focus-visible:outline-(--hig-accent)"
                >
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[13px] font-semibold"
                    style={{
                      backgroundColor: avatarTint(customerName),
                      color: avatarColor(customerName),
                    }}
                  >
                    {initials(customerName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[15px] font-medium leading-5">
                        {customerName || "Client"}
                      </span>
                      {}
                      {o.subjectName && (
                        <span className="shrink-0 rounded-full bg-(--hig-accent-tint) px-2 py-0.75 text-[10px] font-medium text-(--hig-accent)">
                          {isSelf ? "Self" : o.subjectName}
                        </span>
                      )}
                    </div>
                    {}
                    <div className="mt-1 text-[12px] leading-4 text-(--hig-label-secondary) [font-variant-numeric:tabular-nums]">
                      <b className="font-medium text-(--hig-label)">
                        {naira(o.agreedPrice)}
                      </b>{" "}
                      agreed ·{" "}
                      <b
                        className={`font-medium ${
                          o.totalPaid > 0
                            ? "text-(--hig-success)"
                            : "text-(--hig-label)"
                        }`}
                      >
                        {naira(o.totalPaid)}
                      </b>{" "}
                      paid
                    </div>
                    {}
                    <div className="mt-2 h-0.75 overflow-hidden rounded-full bg-(--hig-separator)">
                      <div
                        className="h-full rounded-full bg-(--hig-accent) transition-[width] duration-600 ease-out"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[17px] font-medium leading-5.5 tracking-[-0.01em] [font-variant-numeric:tabular-nums]">
                      <small className="mr-0.5 text-[11px] font-medium text-(--hig-label-secondary)">
                        ₦
                      </small>
                      {balance.toLocaleString("en-US")}
                    </div>
                    <div
                      className={`mt-0.5 text-[12px] ${
                        overdue
                          ? "font-medium text-(--hig-danger)"
                          : "text-(--hig-label-secondary)"
                      }`}
                    >
                      {overdue ? "overdue" : "due"}{" "}
                      {formatDay(o.dueDate) || "—"}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {}
      <TabBar
        active="overview"
        fab={
          <button
            type="button"
            aria-label="New job"
            title="New job"
            onClick={() => setNewJobOpen(true)}
            className="pointer-events-auto absolute bottom-21 right-0 z-10 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-(--hig-accent) text-white shadow-(--hig-bar-shadow) transition-transform duration-200 active:scale-90"
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

const statusMeta: Record<Job["status"], { chip: string }> = {
  pending: {
    chip: "bg-(--hig-warning-tint) text-(--hig-warning)",
  },
  completed: {
    chip: "bg-(--hig-success-tint) text-(--hig-success)",
  },
  canceled: {
    chip: "bg-(--hig-separator) text-(--hig-label-secondary)",
  },
};

function JobRow({ job }: { job: Job }) {
  const prefetchJob = usePrefetchJob();
  const delivered = job.deliveredAt !== null;
  const meta = statusMeta[job.status] ?? statusMeta.pending;
  const label =
    job.status === "completed"
      ? delivered
        ? "Delivered"
        : "Ready to collect"
      : job.status === "pending"
        ? "In progress"
        : "Canceled";
  const note =
    job.status === "completed"
      ? delivered
        ? `collected ${formatStampDay(job.deliveredAt)}`
        : "ready for pickup"
      : job.dueDate
        ? `due ${formatDay(job.dueDate)}`
        : "no due date";

  return (
    <Link
      href={`/jobs/${job.id}`}
      onPointerDown={() => prefetchJob(job.id)}
      className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors duration-200 active:bg-(--hig-fill) focus-visible:outline-2 focus-visible:outline-(--hig-accent)"
    >
      <span
        className="h-2.25 w-2.25 shrink-0 rounded-full"
        style={{
          backgroundColor: avatarColor(job.subjectName ?? ""),
          boxShadow: `0 0 10px ${avatarColor(job.subjectName ?? "")}80`,
        }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium leading-5">
          {job.description || "Garment"}
        </div>
        <div className="mt-0.5 truncate text-[13px] text-(--hig-label-secondary)">
          <span className="text-(--hig-label)">{job.subjectName}</span> ·{" "}
          {note}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[15px] font-medium leading-5 tracking-[-0.01em] [font-variant-numeric:tabular-nums]">
          <small className="mr-0.5 text-[11px] font-medium text-(--hig-label-secondary)">
            ₦
          </small>
          {job.agreedPrice.toLocaleString("en-US")}
        </div>        <span className={`mt-1.5 inline-block rounded-full px-2 py-0.75 text-[10px] font-medium ${meta.chip}`}>
          {label}
        </span>
      </div>
    </Link>
  );
}
