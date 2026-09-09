"use client";

/**
 * Overview — Apple HIG (experiment). Mobile-only.
 *
 * Every number here comes from the live backend:
 *   - /reports/monthly-revenue      → revenue card + seam chart
 *   - /reports/outstanding-payments → balances to collect
 *   - /jobs                         → latest work + bench counts
 *
 * Jobs are fetched with limit 100 so the "on the bench" counts reflect the
 * whole studio rather than just the visible rows; a single tailor's list is
 * small, and the pagination cap is 100.
 *
 * Presentation follows the Apple HIG playbook:
 *   - Inter typeface via the `.hig` class (auth layout shares it)
 *   - iOS grouped layout: gray screen bg, white cards, hairline separators
 *   - One accent (system Blue) for the chart, FAB, active tab and avatars;
 *     green/orange/red only as semantic status colors
 *   - Full-bleed mobile layout (no side padding); inner card padding only
 *   - Light + dark via class-driven --hig-* variables; the top-right toggle
 *     overrides the OS preference and persists in localStorage
 *   - Motion: 260ms rise entrances, eased count-ups; reduced-motion safe
 *
 * The previous Midnight Indigo design is preserved in git history:
 *   git checkout b1fa5cc -- frontend/src/app/dashboard
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import NewJobModal from "@/components/new-job-modal";
import ThemeToggle from "@/components/theme-toggle";
import {
  getMonthlyRevenue,
  getOutstandingPayments,
  listJobs,
  type Job,
  type MonthlyRevenue,
  type OutstandingPayment,
} from "@/lib/api-client";
import { avatarColor, avatarTint } from "@/lib/avatar-colors";

/* ---------------------------------- helpers ---------------------------------- */

const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

const reduceMotion =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** "2026-09-12" (or any parseable date) → "12 Sep" without timezone drift. */
function formatDueDate(value: string | null | undefined): string {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const date = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

function shortMonth(monthKey: string): string {
  const [, y, m] = /^(\d{4})-(\d{2})/.exec(monthKey) ?? [];
  if (!y || !m) return monthKey;
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString("en-US", { month: "short" })
    .toUpperCase();
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter((w) => !/^(mrs|mr|ms|dr)\.?$/i.test(w))
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "•"
  );
}

function balanceOf(o: OutstandingPayment): number {
  return o.balanceDue ?? o.balance ?? 0;
}

/** Eased count-up that honours prefers-reduced-motion. */
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
    <>{currency ? naira.format(display) : display.toLocaleString("en-US")}</>
  );
}

/* ---------------------------------- icons ---------------------------------- */

/* SF-Symbols-style glyphs, drawn inline (stroke, currentColor). */
function IconHouse() {
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
      <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19Z" />
      <path d="M9.5 20.5v-5.5h5v5.5" />
    </svg>
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
function IconCustomers() {
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
      <circle cx="9" cy="7.5" r="3.5" />
      <path d="M3 20.5v-1a6 6 0 0 1 12 0v1" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.5" />
      <path d="M17.5 14.6a6 6 0 0 1 3.5 5.4v.5" />
    </svg>
  );
}
function IconReports() {
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
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="M8 17v-4" />
      <path d="M13 17V7" />
      <path d="M18 17v-7" />
    </svg>
  );
}

/* ---------------------------------- atoms ---------------------------------- */

/* iOS grouped-list card: white surface on the gray screen bg, no border/shadow. */
const cardClass = "rounded-[20px] bg-[var(--hig-card)]";

/**
 * iOS grouped-list section header: 13px semibold uppercase secondary label,
 * with an optional trailing link. 32px of air above (8pt grid).
 */
function GroupHeader({
  title,
  link,
  className = "",
  delay = 0,
}: {
  title: string;
  link?: string;
  className?: string;
  delay?: number;
}) {
  return (
    <div
      className={`hig-rise mb-2 flex items-baseline justify-between ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--hig-label-secondary)]">
        {title}
      </h2>
      {link && (
        <span className="text-[13px] font-medium text-[var(--hig-accent)]">
          {link}
        </span>
      )}
    </div>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-[12px] bg-[var(--hig-separator)] ${className}`}
    />
  );
}

/* ------------------------------- revenue chart ------------------------------- */

function RevenueChart({ data }: { data: MonthlyRevenue[] }) {
  const W = 340;
  const H = 140;
  const padX = 10;
  const padTop = 34;
  const bottom = 112;
  const max = Math.max(...data.map((m) => m.revenue), 1);

  // Single-month data pins the point to the horizontal centre of the card.
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

  // Catmull-Rom → cubic Bézier smoothing for the seam-curve line.
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
        {/* faint horizontal gridlines + a baseline that grounds a single point */}
        <line x1="10" y1="34" x2="330" y2="34" stroke="var(--hig-grid)" />
        <line x1="10" y1="66" x2="330" y2="66" stroke="var(--hig-grid)" />
        <line x1="10" y1="98" x2="330" y2="98" stroke="var(--hig-grid)" />
        <line x1="10" y1="112" x2="330" y2="112" stroke="var(--hig-grid)" />
        {/* flat area wash under the line (no gradient) */}
        {pts.length >= 2 && (
          <path
            d={`${lineD} L ${pts[pts.length - 1]!.x} ${bottom} L ${pts[0]!.x} ${bottom} Z`}
            fill="var(--hig-accent-tint)"
          />
        )}
        {/* the line — system Blue, crisp, no glow */}
        {pts.length >= 2 && (
          <path
            d={lineD}
            stroke="var(--hig-accent)"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {/* data dots; the latest one gets a soft halo + pulse to mark "now" */}
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
                ? "font-semibold text-[var(--hig-accent)]"
                : "text-[var(--hig-label-tertiary)]"
            }`}
          >
            {shortMonth(m.monthKey)}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------- page ---------------------------------- */

export default function DashboardPage() {
  const [newJobOpen, setNewJobOpen] = useState(false);
  const revenueQ = useQuery({
    queryKey: ["reports", "monthly-revenue"],
    queryFn: getMonthlyRevenue,
  });
  const outstandingQ = useQuery({
    queryKey: ["reports", "outstanding-payments"],
    queryFn: getOutstandingPayments,
  });
  const jobsQ = useQuery({
    queryKey: ["jobs"],
    queryFn: () => listJobs({ limit: 100 }),
  });

  const months = revenueQ.data?.data ?? [];
  const outstanding = outstandingQ.data?.data ?? [];
  const jobs = jobsQ.data?.data ?? [];

  const thisMonth = months.at(-1);
  const prevMonth = months.at(-2);
  const deltaPct =
    thisMonth && prevMonth && prevMonth.revenue > 0
      ? ((thisMonth.revenue - prevMonth.revenue) / prevMonth.revenue) * 100
      : null;

  const totalOutstanding = outstanding.reduce(
    (sum, o) => sum + balanceOf(o),
    0,
  );
  const largestDue = outstanding.reduce((m, o) => Math.max(m, balanceOf(o)), 0);
  const pendingCount = jobs.filter((j) => j.status === "pending").length;
  const readyCount = jobs.filter(
    (j) => j.status === "completed" && !j.deliveredAt,
  ).length;

  const anyError = [revenueQ, outstandingQ, jobsQ].some((q) => q.isError);
  const loading = [revenueQ, outstandingQ, jobsQ].some((q) => q.isPending);
  const retryAll = () => {
    revenueQ.refetch();
    outstandingQ.refetch();
    jobsQ.refetch();
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
  const monthName = new Date().toLocaleDateString("en-US", { month: "long" });

  return (
    <main className="hig min-h-dvh bg-[var(--hig-grouped)] pb-40 text-[var(--hig-label)] transition-colors duration-300">
      {/* Mobile-only: the whole app keeps a fixed phone width, centred on larger screens.
          Full-bleed — no side padding; only cards pad their own content. */}
      <div className="relative mx-auto w-full max-w-[430px]">        {/* ---------- header ---------- */}
        <header className="hig-rise mb-8 pt-3" style={{ animationDelay: "0ms" }}>
          <div className="flex items-center justify-between">
            <div className="text-[20px] font-medium tracking-[-0.02em]">HollySeams</div>
            {/* Dark/light toggle — persists in localStorage; see theme-toggle.tsx */}
            <ThemeToggle />
          </div>

          {/* Greeting card — the page hero: accent-tinted surface, live studio
              pulse by the date, stitched seam at the foot (the tailoring motif). */}
          <div className="relative mt-3 rounded-[24px] bg-[var(--hig-accent-tint)] px-5 pb-3.5 pt-4">
            <div className="flex items-center gap-2">
              {/* live studio pulse — soft expanding halo + core dot */}
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="hig-ping absolute inset-0 rounded-full bg-[var(--hig-accent)]" />
                <span className="relative h-2 w-2 rounded-full bg-[var(--hig-accent)]" />
              </span>
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--hig-label-secondary)]">
                {new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </p>
            </div>
            <h1 className="mt-2 text-[34px] font-medium leading-[41px] tracking-[-0.02em]">
              {greeting}, Wunmi —{" "}
              {/* Personality line in the accent, like the original Midnight greeting.
                  Name is hardcoded — the backend user table has no endpoint exposing it yet. */}
              <span className="text-[var(--hig-accent)]">{monthName} is flying.</span>
            </h1>
            {/* Creative studio line — scissors glyph + rhythmic tailor copy;
                adjectives in the label colour so the phrase reads with a beat. */}
            <p className="mt-1.5 flex items-center gap-1.5 text-[14px] font-medium text-[var(--hig-label-secondary)]">
              <span className="h-[14px] w-[14px] text-[var(--hig-accent)]" aria-hidden="true">
                <IconScissors />
              </span>
              Needles <span className="text-[var(--hig-label)]">busy</span>. Threads{" "}
              <span className="text-[var(--hig-label)]">tight</span>.
            </p>
            {/* stitched seam — dashed accent hairline, the sewing signature */}
            <div
              className="mt-3.5 border-t border-dashed border-[var(--hig-accent-line)]"
              aria-hidden="true"
            />
          </div>
        </header>

        {/* ---------- error banner ---------- */}
        {anyError && (
          <div className="mb-4 flex items-center justify-between rounded-[16px] bg-[var(--hig-danger-tint)] px-4 py-3">
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

        {/* ---------- revenue card ---------- */}
        <section
          className={`${cardClass} hig-rise mb-3 px-4 pb-4 pt-4`}
          style={{ animationDelay: "60ms" }}
        >
          <div className="flex items-center justify-between">            <div className="text-[17px] font-medium leading-[22px]">Revenue</div>
            {deltaPct !== null && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[11px] font-medium ${
                  deltaPct >= 0
                    ? "bg-[var(--hig-success-tint)] text-[var(--hig-success)]"
                    : "bg-[var(--hig-danger-tint)] text-[var(--hig-danger)]"
                }`}
              >
                {deltaPct >= 0 ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(0)}%
              </span>
            )}
          </div>

          {/* skeleton mirrors the real card: amount, caption, chart block */}
          {loading ? (
            <div className="py-2">
              <Skeleton className="h-9 w-36" />
              <Skeleton className="mt-2 h-3 w-32" />
              <Skeleton className="mt-3 h-[183px] w-full" />
            </div>
          ) : (
            <>
              <div className="mt-2 text-[34px] font-medium leading-[41px] tracking-[-0.02em] [font-variant-numeric:tabular-nums]">
                <small className="mr-0.5 text-[19px] font-medium text-[var(--hig-label-secondary)]">
                  ₦
                </small>
                <CountUp value={thisMonth?.revenue ?? 0} />
              </div>
              <p className="text-[13px] text-[var(--hig-label-secondary)]">
                {thisMonth
                  ? `${monthName} to date${months.length > 1 ? ` · ${months.length}-month trend` : ""}`
                  : "No revenue yet — payments will appear here."}
              </p>
              <RevenueChart data={months} />
            </>
          )}
        </section>

        {/* ---------- mini stats ---------- */}
        <section
          className="hig-rise mb-3 grid grid-cols-2 gap-3"
          style={{ animationDelay: "120ms" }}
        >
          <div className={`${cardClass} px-4 py-3`}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-medium text-[var(--hig-label-secondary)]">
                To collect
              </span>
              <span className="h-2 w-2 rounded-full bg-[var(--hig-warning)] shadow-[0_0_10px_rgba(255,149,0,0.55)]" aria-hidden="true" />
            </div>
            <div className="text-[22px] font-medium leading-[28px] tracking-[-0.01em] [font-variant-numeric:tabular-nums]">
              {loading ? (
                <>
                  <Skeleton className="h-7 w-20" />
                  <Skeleton className="mt-2 h-3 w-24" />
                </>
              ) : (
                <>
                  <small className="mr-0.5 text-[13px] font-medium text-[var(--hig-label-secondary)]">
                    ₦
                  </small>
                  <CountUp value={totalOutstanding} />
                </>
              )}
            </div>            {/* One-line footer (12px) so both cards stay visually even */}
            <p className="mt-2 truncate text-[12px] leading-[16px] text-[var(--hig-label-secondary)]">
              {outstanding.length > 0 ? (
                <>
                  <b className="font-medium text-[var(--hig-label)]">{outstanding.length} garment{outstanding.length === 1 ? "" : "s"}</b>
                  {largestDue > 0 && <> · largest {naira.format(largestDue)}</>}
                </>
              ) : (
                "all settled"
              )}
            </p>
          </div>
          <div className={`${cardClass} px-4 py-3`}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-medium text-[var(--hig-label-secondary)]">
                On the bench
              </span>
              <span className="h-2 w-2 rounded-full bg-[var(--hig-accent)] shadow-[0_0_10px_rgba(10,132,255,0.55)]" aria-hidden="true" />
            </div>
            <div className="text-[22px] font-medium leading-[28px] tracking-[-0.01em] [font-variant-numeric:tabular-nums]">
              {loading ? (
                <>
                  <Skeleton className="h-7 w-10" />
                  <Skeleton className="mt-2 h-3 w-16" />
                </>
              ) : (
                <CountUp value={pendingCount} />
              )}
            </div>
            {/* One-line footer (12px) — the headline already says the total on the bench */}
            <p className="mt-2 truncate text-[12px] leading-[16px] text-[var(--hig-label-secondary)]">
              <b className="font-medium text-[var(--hig-label)]">{readyCount} ready</b> to pick up
            </p>
          </div>
        </section>

        {/* ---------- latest work ---------- */}
        <GroupHeader title="Latest Work" link="View all" className="mt-8" delay={180} />
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[72px] w-full" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <p
            className={`${cardClass} px-4 py-4 text-[15px] text-[var(--hig-label-secondary)]`}
          >
            No jobs yet — add your first garment from the Jobs tab.
          </p>
        ) : (          <div
            className={`${cardClass} hig-rise overflow-hidden divide-y divide-[var(--hig-separator)]`}
            style={{ animationDelay: "200ms" }}
          >
            {jobs.slice(0, 5).map((j) => (
              <JobRow key={j.id} job={j} />
            ))}
          </div>
        )}

        {/* ---------- balances to collect ---------- */}
        <GroupHeader
          title="Balances to Collect"
          link={
            outstanding.length > 0 ? `${outstanding.length} open` : undefined
          }
          className="mt-8"
          delay={240}
        />
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[76px] w-full" />
            ))}
          </div>
        ) : outstanding.length === 0 ? (
          <p
            className={`${cardClass} px-4 py-4 text-[15px] text-[var(--hig-label-secondary)]`}
          >
            All balances settled — nothing due right now.
          </p>
        ) : (          <div
            className={`${cardClass} hig-rise overflow-hidden divide-y divide-[var(--hig-separator)]`}
            style={{ animationDelay: "260ms" }}
          >
            {outstanding.slice(0, 4).map((o) => {
              const balance = balanceOf(o);
              const pct =
                o.agreedPrice > 0
                  ? Math.min(
                      100,
                      Math.round((o.totalPaid / o.agreedPrice) * 100),
                    )
                  : 0;
              const overdue =
                !!o.dueDate &&
                new Date(o.dueDate + "T00:00:00").getTime() <
                  new Date(new Date().toDateString()).getTime();
              // Self subjects carry the customer's own name in the DB — show
              // "Self" instead of repeating the name next to it.
              const customerName = o.customer?.name ?? o.customerName ?? "";
              const isSelf =
                !!o.subjectName &&
                o.subjectName.trim().toLowerCase() ===
                  customerName.trim().toLowerCase();
              return (
                <div
                  key={o.jobId}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  {/* initials avatar — tinted from the customer's name so each
                      client keeps one colour across every screen (avatarColor) */}
                  <div
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] text-[13px] font-semibold"
                    style={{
                      backgroundColor: avatarTint(customerName),
                      color: avatarColor(customerName),
                    }}
                  >
                    {initials(customerName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[15px] font-medium leading-[20px]">
                        {customerName || "Client"}
                      </span>
                      {/* subject chip — "Self" instead of repeating the customer name */}
                      {o.subjectName && (
                        <span className="shrink-0 rounded-full bg-[var(--hig-accent-tint)] px-2 py-[3px] text-[10px] font-medium text-[var(--hig-accent)]">
                          {isSelf ? "Self" : o.subjectName}
                        </span>
                      )}
                    </div>
                    {/* agreed/paid line — amounts pop: agreed in label, paid in green */}
                    <div className="mt-1 text-[12px] leading-[16px] text-[var(--hig-label-secondary)] [font-variant-numeric:tabular-nums]">
                      <b className="font-medium text-[var(--hig-label)]">
                        {naira.format(o.agreedPrice)}
                      </b>{" "}
                      agreed ·{" "}
                      <b
                        className={`font-medium ${
                          o.totalPaid > 0
                            ? "text-[var(--hig-success)]"
                            : "text-[var(--hig-label)]"
                        }`}
                      >
                        {naira.format(o.totalPaid)}
                      </b>{" "}
                      paid
                    </div>
                    {/* paid progress — gray track, blue fill */}
                    <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-[var(--hig-separator)]">
                      <div
                        className="h-full rounded-full bg-[var(--hig-accent)] transition-[width] duration-600 ease-out"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className="text-[17px] font-medium leading-[22px] tracking-[-0.01em] [font-variant-numeric:tabular-nums]">
                      <small className="mr-0.5 text-[11px] font-medium text-[var(--hig-label-secondary)]">
                        ₦
                      </small>
                      {balance.toLocaleString("en-US")}
                    </div>
                    <div
                      className={`mt-0.5 text-[12px] ${
                        overdue
                          ? "font-medium text-[var(--hig-danger)]"
                          : "text-[var(--hig-label-secondary)]"
                      }`}
                    >
                      {overdue ? "overdue" : "due"}{" "}
                      {formatDueDate(o.dueDate) || "—"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ---------- FAB + tab bar (anchored to the phone-width column, full-bleed) ---------- */}
      <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-10">
        <div className="relative mx-auto w-full max-w-[430px]">
          {/* New job — the one primary action, system Blue */}
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
          {/* Material tab bar, full-bleed, rounded top — translucent + blurred */}
          <div className="pointer-events-auto flex h-16 items-center rounded-t-[24px] bg-[var(--hig-bar)] px-2 shadow-[var(--hig-bar-shadow)] backdrop-blur-[20px] backdrop-saturate-150">
            {[
              { label: "Overview", icon: <IconHouse />, active: true },
              { label: "Jobs", icon: <IconScissors /> },
              { label: "Customers", icon: <IconCustomers /> },
              { label: "Reports", icon: <IconReports /> },
            ].map((tab) => (
              <button
                key={tab.label}
                type="button"
                aria-label={tab.label}
                aria-current={tab.active ? "page" : undefined}
                className={`flex h-full flex-1 flex-col items-center justify-center gap-0.5 rounded-[16px] transition-all duration-200 active:scale-95 ${
                  tab.active
                    ? "bg-[var(--hig-accent-tint)] text-[var(--hig-accent)]"
                    : "text-[var(--hig-label-tertiary)]"
                }`}
              >
                <span className="h-[22px] w-[22px]">{tab.icon}</span>
                <span
                  className={`text-[10px] ${tab.active ? "font-semibold" : "font-medium"}`}
                >
                  {tab.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* The Cutting Table — new job sheet (Concept 2, wired to the API) */}
      <NewJobModal open={newJobOpen} onClose={() => setNewJobOpen(false)} />
    </main>
  );
}

/* ------------------------------- job row ------------------------------- */

/**
 * Status → HIG semantic colors (green = ready, orange = in progress,
 * gray = neutral/canceled/delivered). Dots are static — no blinking.
 */
/* Status pills carry the meaning; the dots are purely decorative. Each job's
   dot is hashed from the SUBJECT's name (avatarColor), so it matches the
   subject's avatar hue everywhere in the app. */
const statusMeta: Record<Job["status"], { chip: string }> = {
  pending: {
    chip: "bg-[var(--hig-warning-tint)] text-[var(--hig-warning)]",
  },
  completed: {
    chip: "bg-[var(--hig-success-tint)] text-[var(--hig-success)]",
  },
  canceled: {
    chip: "bg-[var(--hig-separator)] text-[var(--hig-label-secondary)]",
  },
};



function JobRow({ job }: { job: Job }) {
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
        ? `collected ${formatDueDate(job.deliveredAt)}`
        : "ready for pickup"
      : job.dueDate
        ? `due ${formatDueDate(job.dueDate)}`
        : "no due date";

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {/* decorative glowing dot — keyed to the SUBJECT's name (avatarColor),
          so a job's dot always matches that subject's avatar hue; self
          subjects carry the customer's name, matching their avatar too */}
      <span
        className="h-[9px] w-[9px] flex-shrink-0 rounded-full"
        style={{
          backgroundColor: avatarColor(job.subjectName ?? ""),
          boxShadow: `0 0 10px ${avatarColor(job.subjectName ?? "")}80`,
        }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium leading-[20px]">
          {job.description || "Garment"}
        </div>
        <div className="mt-0.5 truncate text-[13px] text-[var(--hig-label-secondary)]">
          <span className="text-[var(--hig-label)]">{job.subjectName}</span> ·{" "}
          {note}
        </div>
      </div>
      <div className="flex-shrink-0 text-right">
        <div className="text-[15px] font-medium leading-[20px] tracking-[-0.01em] [font-variant-numeric:tabular-nums]">
          <small className="mr-0.5 text-[11px] font-medium text-[var(--hig-label-secondary)]">
            ₦
          </small>
          {job.agreedPrice.toLocaleString("en-US")}
        </div>        <span className={`mt-1.5 inline-block rounded-full px-2 py-[3px] text-[10px] font-medium ${meta.chip}`}>
          {label}
        </span>
      </div>
    </div>
  );
}
