"use client";

/**
 * Overview — Midnight Indigo (Concept 3, flat). Mobile-only.
 *
 * Every number here comes from the live backend:
 *   - /reports/monthly-revenue     → revenue card + seam chart
 *   - /reports/outstanding-payments→ balances to collect
 *   - /jobs                        → latest work + bench counts
 *
 * Jobs are fetched with limit 100 so the "on the bench" counts reflect the
 * whole studio rather than just the visible rows; a single tailor's list is
 * small, and the pagination cap is 100.
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import NewJobModal from "@/components/new-job-modal";
import {
  getMonthlyRevenue,
  getOutstandingPayments,
  listJobs,
  type Job,
  type MonthlyRevenue,
  type OutstandingPayment,
} from "@/lib/api-client";

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
function CountUp({ value, currency = false }: { value: number; currency?: boolean }) {
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
      setDisplay(Math.round(fromRef.current + (value - fromRef.current) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <>{currency ? naira.format(display) : display.toLocaleString("en-US")}</>;
}

/* ---------------------------------- icons ---------------------------------- */

function IconHouse() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19Z" />
      <path d="M9.5 20.5v-5.5h5v5.5" />
    </svg>
  );
}
function IconScissors() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="7.5" r="3.5" />
      <path d="M3 20.5v-1a6 6 0 0 1 12 0v1" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.5" />
      <path d="M17.5 14.6a6 6 0 0 1 3.5 5.4v.5" />
    </svg>
  );
}
function IconReports() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="M8 17v-4" />
      <path d="M13 17V7" />
      <path d="M18 17v-7" />
    </svg>
  );
}

/* ---------------------------------- atoms ---------------------------------- */

const cardClass =
  "rounded-[20px] border border-white/10 bg-white/[0.045] backdrop-blur-[14px]";

function Section({
  title,
  link,
  delay = 0,
  className = "",
  children,
}: {
  title: string;
  link?: string;
  delay?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`animate-rise ${className}`} style={{ animationDelay: `${delay}ms` }}>
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold tracking-[-0.005em] text-ink">
          <span className="h-3 w-[3px] rounded-full bg-teal shadow-[0_0_12px_rgba(91,124,250,0.7)]" aria-hidden="true" />
          {title}
        </h2>
        {link && (
          <span className="rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-teal-light">
            {link}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-[16px] bg-white/5 ${className}`} />;
}

/* ------------------------------- revenue chart ------------------------------- */

function RevenueChart({ data }: { data: MonthlyRevenue[] }) {
  const W = 340;
  const H = 140;
  const padX = 10;
  const padTop = 34;
  const bottom = 112;
  const max = Math.max(...data.map((m) => m.revenue), 1);

  const pts = useMemo(() => {
    if (data.length === 1) {
      return [{ x: W / 2, y: bottom - (data[0]!.revenue / max) * (bottom - padTop), m: data[0]! }];
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
      d += ` C ${(p1.x + (p2.x - p0.x) / 6).toFixed(1)} ${(p1.y + (p2.y - p0.y) / 6).toFixed(1)}, ` +
           `${(p2.x - (p3.x - p1.x) / 6).toFixed(1)} ${(p2.y - (p3.y - p1.y) / 6).toFixed(1)}, ` +
           `${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  }, [pts]);

  if (data.length === 0) return null;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 block w-full" fill="none" aria-hidden="true">
        <defs>
          <filter id="lineGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* grid */}
        <line x1="10" y1="34" x2="330" y2="34" stroke="rgba(255,255,255,0.05)" />
        <line x1="10" y1="66" x2="330" y2="66" stroke="rgba(255,255,255,0.05)" />
        <line x1="10" y1="98" x2="330" y2="98" stroke="rgba(255,255,255,0.05)" />
        {/* solid area wash (flat, no gradient) */}
        {pts.length >= 2 && (
          <path
            d={`${lineD} L ${pts[pts.length - 1]!.x} ${bottom} L ${pts[0]!.x} ${bottom} Z`}
            fill="rgba(91, 124, 250, 0.16)"
          />
        )}
        {/* the line */}
        {pts.length >= 2 && (
          <path
            d={lineD}
            stroke="#5B7CFA"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#lineGlow)"
          />
        )}
        {/* data dots */}
        {pts.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={i === pts.length - 1 ? 3.4 : 2.2}
            fill={i === pts.length - 1 ? "#A78BFA" : "#5B7CFA"}
            className={i === pts.length - 1 ? "animate-dot-pulse" : ""}
            style={i === pts.length - 1 ? { transformBox: "fill-box", transformOrigin: "center" } : undefined}
          />
        ))}
      </svg>
      <div className="mt-1 flex justify-between px-1.5">
        {data.map((m, i) => (
          <span
            key={m.monthKey}
            className={`text-[8px] font-medium uppercase tracking-[0.12em] ${
              i === data.length - 1 ? "text-teal-light" : "text-stone"
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
  const revenueQ = useQuery({ queryKey: ["reports", "monthly-revenue"], queryFn: getMonthlyRevenue });
  const outstandingQ = useQuery({ queryKey: ["reports", "outstanding-payments"], queryFn: getOutstandingPayments });
  const jobsQ = useQuery({ queryKey: ["jobs"], queryFn: () => listJobs({ limit: 100 }) });

  const months = revenueQ.data?.data ?? [];
  const outstanding = outstandingQ.data?.data ?? [];
  const jobs = jobsQ.data?.data ?? [];

  const thisMonth = months.at(-1);
  const prevMonth = months.at(-2);
  const deltaPct =
    thisMonth && prevMonth && prevMonth.revenue > 0
      ? ((thisMonth.revenue - prevMonth.revenue) / prevMonth.revenue) * 100
      : null;

  const totalOutstanding = outstanding.reduce((sum, o) => sum + balanceOf(o), 0);
  const largestDue = outstanding.reduce((m, o) => Math.max(m, balanceOf(o)), 0);
  const pendingCount = jobs.filter((j) => j.status === "pending").length;
  const readyCount = jobs.filter((j) => j.status === "completed" && !j.deliveredAt).length;

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
    <main className="min-h-dvh bg-surface pb-40 text-ink">
      {/* Mobile-only: the whole app keeps a fixed phone width, centred on larger screens. */}
      <div className="relative mx-auto w-full max-w-[430px]">
        {/* ---------- header ---------- */}
        <header className="mb-7 animate-rise">
          <div className="text-[22px] font-semibold leading-none tracking-[-0.01em] text-ink">
            Holly<span className="font-heading italic font-medium text-teal-light">seams</span>
          </div>
        </header>

        {/* ---------- greeting ---------- */}
        <section className="mb-5 animate-rise" style={{ animationDelay: "60ms" }}>
          <p className="mb-2 text-[9px] font-medium uppercase tracking-[0.24em] text-stone">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
          <h1 className="mb-2 text-[27px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">
            {greeting}, <em className="font-heading font-normal italic">Wunmi</em> —{" "}
            <span className="text-teal-light">{monthName} is flying.</span>
          </h1>
          <p className="text-[12px] font-light leading-[1.55] text-ink-soft">
            {thisMonth ? (
              <>
                <b className="font-medium text-ink">{naira.format(thisMonth.revenue)}</b> this month
                {deltaPct !== null && (
                  <>
                    {" "}
                    ·{" "}
                    <b className={`font-medium ${deltaPct >= 0 ? "text-mint" : "text-rose"}`}>
                      {deltaPct >= 0 ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(0)}%
                    </b>{" "}
                    over {shortMonth(prevMonth!.monthKey)}
                  </>
                )}
              </>
            ) : (
              "No revenue recorded yet"
            )}
            {outstanding.length > 0 && (
              <>
                {" "}
                · <b className="font-medium text-amber">{naira.format(totalOutstanding)}</b> out for
                collection
              </>
            )}
          </p>
        </section>

        {/* ---------- error banner ---------- */}
        {anyError && (
          <div className="mb-4 flex items-center justify-between rounded-2xl border border-rose/25 bg-rose/10 px-4 py-3 animate-rise">
            <p className="text-[12px] text-rose">
              Couldn&apos;t reach the studio. Check your connection.
            </p>
            <button
              type="button"
              onClick={retryAll}
              className="rounded-full border border-rose/30 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-rose transition-colors hover:bg-rose/15"
            >
              Retry
            </button>
          </div>
        )}

        {/* ---------- revenue card ---------- */}
        <section className={`${cardClass} relative mb-3 overflow-hidden px-4 pb-1.5 pt-4 animate-rise`} style={{ animationDelay: "120ms" }}>
          <div className="flex items-start justify-between">
            <div className="text-[9px] font-medium uppercase tracking-[0.22em] text-ink-soft">
              <i className="mr-2 inline-block h-1.5 w-1.5 rounded-[2px] bg-teal shadow-[0_0_10px_rgba(91,124,250,0.9)]" aria-hidden="true" />
              Revenue
            </div>
            {deltaPct !== null && (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[9.5px] font-semibold tracking-[0.06em] ${
                  deltaPct >= 0
                    ? "border-mint/20 bg-mint/10 text-mint"
                    : "border-rose/20 bg-rose/10 text-rose"
                }`}
              >
                {deltaPct >= 0 ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(0)}%
              </span>
            )}
          </div>

          {loading ? (
            <div className="py-2">
              <Skeleton className="h-9 w-36" />
              <Skeleton className="mt-3 h-24 w-full" />
            </div>
          ) : (
            <>
              <div className="text-[38px] font-bold leading-[1.1] tracking-[-0.03em] text-ink">
                <small className="mr-0.5 text-[19px] font-medium text-teal-light">₦</small>
                <CountUp value={thisMonth?.revenue ?? 0} />
              </div>
              <p className="text-[10.5px] text-stone">
                {thisMonth
                  ? `${new Date(thisMonth.monthKey + "-01").toLocaleDateString("en-US", { month: "long" })} to date${months.length > 1 ? ` · ${months.length}-month trend` : ""}`
                  : "No revenue yet — payments will appear here."}
              </p>
              <RevenueChart data={months} />
            </>
          )}
        </section>

        {/* ---------- mini stats ---------- */}
        <section className="mb-6 grid grid-cols-2 gap-2.5">
          <div className={`${cardClass} px-4 py-3.5 animate-rise`} style={{ animationDelay: "180ms" }}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[8.5px] font-medium uppercase tracking-[0.2em] text-ink-soft">
                To collect
              </span>
              <span className="h-[7px] w-[7px] rounded-full bg-amber shadow-[0_0_12px_rgba(245,184,91,0.9)] animate-blink" aria-hidden="true" />
            </div>
            <div className="text-[26px] font-bold leading-none tracking-[-0.02em] text-ink">
              {loading ? <Skeleton className="h-7 w-20" /> : (
                <>
                  <small className="mr-0.5 text-[15px] font-medium text-teal-light">₦</small>
                  <CountUp value={totalOutstanding} />
                </>
              )}
            </div>
            <p className="mt-2 text-[10px] text-stone">
              {outstanding.length > 0 ? (
                <>
                  <b className="font-medium text-amber">{outstanding.length} garment{outstanding.length === 1 ? "" : "s"}</b>
                  {largestDue > 0 && <> · largest {naira.format(largestDue)}</>}
                </>
              ) : (
                "all settled"
              )}
            </p>
          </div>
          <div className={`${cardClass} px-4 py-3.5 animate-rise`} style={{ animationDelay: "240ms" }}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[8.5px] font-medium uppercase tracking-[0.2em] text-ink-soft">
                On the bench
              </span>
              <span className="h-[7px] w-[7px] rounded-full bg-rose shadow-[0_0_12px_rgba(244,117,138,0.8)] animate-blink" aria-hidden="true" />
            </div>
            <div className="text-[26px] font-bold leading-none tracking-[-0.02em] text-ink">
              {loading ? <Skeleton className="h-7 w-10" /> : <CountUp value={pendingCount} />}
            </div>
            <p className="mt-2 text-[10px] text-stone">
              in progress · <b className="font-medium text-amber">{readyCount} ready</b> to pick up
            </p>
          </div>
        </section>

        {/* ---------- latest work ---------- */}
        <Section title="Latest work" link="View all" delay={300}>
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[58px] w-full" />)}
            </div>
          ) : jobs.length === 0 ? (
            <p className="rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-4 text-[12px] text-ink-soft">
              No jobs yet — add your first garment from the Jobs tab.
            </p>
          ) : (
            <div className="space-y-2">
              {jobs.slice(0, 5).map((j) => (
                <JobRow key={j.id} job={j} />
              ))}
            </div>
          )}
        </Section>

        {/* ---------- balances to collect ---------- */}
        <Section title="Balances to collect" link={outstanding.length > 0 ? `${outstanding.length} open` : undefined} className="mt-8" delay={360}>
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[68px] w-full" />)}
            </div>
          ) : outstanding.length === 0 ? (
            <p className="rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-4 text-[12px] text-ink-soft">
              All balances settled — nothing due right now.
            </p>
          ) : (
            <div className="space-y-2">
              {outstanding.slice(0, 4).map((o) => {
                const balance = balanceOf(o);
                const pct = o.agreedPrice > 0 ? Math.min(100, Math.round((o.totalPaid / o.agreedPrice) * 100)) : 0;
                return (
                  <div
                    key={o.jobId}
                    className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] px-3.5 py-3 transition-transform duration-200 hover:-translate-y-px"
                  >
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-teal/25 bg-teal-tint text-[11px] font-semibold text-teal-light">
                      {initials(o.customer?.name ?? o.customerName ?? "")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] font-medium text-ink">
                        {o.customer?.name ?? o.customerName ?? "Client"}{" "}
                        <span className="font-normal text-stone">· {o.subjectName}</span>
                      </div>
                      <div className="mt-0.5 text-[9.5px] text-stone">
                        {naira.format(o.agreedPrice)} agreed · {naira.format(o.totalPaid)} paid
                      </div>
                      <div className="mt-[7px] h-[3px] overflow-hidden rounded-[2px] bg-white/[0.07]">
                        <div
                          className="h-full rounded-[2px] bg-teal shadow-[0_0_8px_rgba(91,124,250,0.6)] transition-[width] duration-1000 ease-out"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <div className="text-[14.5px] font-bold leading-none tracking-[-0.01em] text-[#FFD9A0]">
                        <small className="mr-0.5 text-[9.5px] font-medium text-amber">₦</small>
                        {balance.toLocaleString("en-US")}
                      </div>
                      <div className="mt-1 text-[8px] font-medium uppercase tracking-[0.12em] text-stone">
                        due <b className="font-semibold text-rose">{formatDueDate(o.dueDate) || "—"}</b>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </div>

      {/* ---------- FAB + tab bar (anchored to the phone-width column, full-bleed) ---------- */}
      <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-10">
        <div className="relative mx-auto w-full max-w-[430px]">
          <button
            type="button"
            aria-label="New job"
            title="New job"
            onClick={() => setNewJobOpen(true)}
            className="pointer-events-auto absolute bottom-[86px] right-0 z-10 flex h-[54px] w-[54px] items-center justify-center rounded-full bg-teal text-white shadow-[0_14px_30px_-10px_rgba(91,124,250,0.75)] transition-transform duration-200 hover:bg-teal-deep active:scale-90"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
              <path d="M12 5.5v13" />
              <path d="M5.5 12h13" />
            </svg>
          </button>
          <div className="pointer-events-auto flex h-[74px] items-center gap-[3px] rounded-t-3xl border border-b-0 border-x-0 border-white/10 bg-[rgba(9,14,28,0.9)] px-2 shadow-[0_-24px_50px_-30px_rgba(0,0,0,0.8)] backdrop-blur-[20px]">
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
                className={`flex h-full flex-1 flex-col items-center justify-center gap-1 rounded-[17px] text-[8px] font-medium uppercase tracking-[0.1em] transition-colors duration-200 active:scale-95 ${
                  tab.active
                    ? "border border-teal/25 bg-teal/25 font-semibold text-ink shadow-[0_8px_24px_-8px_rgba(91,124,250,0.5),inset_0_1px_0_rgba(255,255,255,0.08)]"
                    : "text-stone"
                }`}
              >
                <span className={tab.active ? "h-[18px] w-[18px] text-teal-light" : "h-[18px] w-[18px]"}>
                  {tab.icon}
                </span>
                {tab.label}
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

const statusMeta: Record<Job["status"], { label: string; dot: string; chip: string }> = {
  pending: {
    label: "In progress",
    dot: "bg-amber shadow-[0_0_12px_rgba(245,184,91,0.8)]",
    chip: "bg-amber/10 text-amber",
  },
  completed: {
    label: "Ready",
    dot: "bg-mint shadow-[0_0_12px_rgba(62,213,152,0.7)]",
    chip: "bg-mint/10 text-mint",
  },
  canceled: {
    label: "Canceled",
    dot: "bg-stone",
    chip: "bg-white/5 text-stone",
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
      : meta.label;
  const note =
    job.status === "completed"
      ? delivered
        ? `collected ${formatDueDate(job.deliveredAt)}`
        : "ready for pickup"
      : job.dueDate
        ? `due ${formatDueDate(job.dueDate)}`
        : "no due date";

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] px-3.5 py-3 transition-transform duration-200 hover:-translate-y-px">
      <span className={`h-[9px] w-[9px] flex-shrink-0 rounded-full ${meta.dot}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-medium text-ink">
          {job.description || "Garment"}
        </div>
        <div className="mt-0.5 truncate text-[9.5px] text-stone">
          <span className="text-ink-soft">{job.subjectName}</span> · {note}
        </div>
      </div>
      <div className="flex-shrink-0 text-right">
        <div className="text-[13px] font-semibold tracking-[-0.01em] text-ink">
          <small className="mr-0.5 text-[9px] font-medium text-teal-light">₦</small>
          {job.agreedPrice.toLocaleString("en-US")}
        </div>
        <span className={`mt-1 inline-block rounded-full px-[7px] py-[3px] text-[7px] font-semibold uppercase tracking-[0.16em] ${meta.chip}`}>
          {label}
        </span>
      </div>
    </div>
  );
}