import { useMemo } from "react";
import { ErrorBanner } from "@/components/ui/error-banner";
import TabBar from "@/components/ui/tab-bar";
import ThemeToggle from "@/components/ui/theme-toggle";
// The statement shapes, shared with the tap shell so a tab never shows two different skeletons.
import {
  OutstandingRowsSkeleton,
  StatementRowsSkeleton,
  StatementSummarySkeleton,
} from "@/components/ui/skeletons";
import {
  useMonthlyRevenue,
  useOutstandingPayments,
  useTopCustomers,
} from "@/hooks/use-reports";
import {
  formatDay,
  formatMonthKey,
  isOverdue,
  monthShort,
  naira,
  todayLine,
} from "@/lib/format";
import { avatarColor, avatarTint } from "@/lib/avatar-colors";
import { initials } from "@/lib/format";
import type { MonthlyRevenue } from "@/types/report";

/* ------------------------------------------------------------------ */
/* The revenue curve — resurrected from the v2 overview                 */
/* ------------------------------------------------------------------ */

/**
 * The monthly revenue curve, hand-rolled SVG.
 *
 * This chart lived on the v2 overview until that page's rebuild traded it for the bento; it was
 * good work then and it's the right centrepiece for the collected statement now. The curve is a
 * Catmull-Rom spline (the cubic-bezier control points take one sixth of each neighbour's span),
 * the area under it is the accent at its tint, and the last point carries the pulsing dot —
 * "you are here". Pure SVG, no chart library: the data is a handful of points, and a dependency
 * for this would outlive the chart.
 */
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
        {/* The ruled grid: four lines, same var the rest of the statement's rules use */}
        <line x1="10" y1="34" x2="330" y2="34" stroke="var(--hig-grid)" />
        <line x1="10" y1="66" x2="330" y2="66" stroke="var(--hig-grid)" />
        <line x1="10" y1="98" x2="330" y2="98" stroke="var(--hig-grid)" />
        <line x1="10" y1="112" x2="330" y2="112" stroke="var(--hig-grid)" />
        {/* Area under the curve */}
        {pts.length >= 2 && (
          <path
            d={`${lineD} L ${pts[pts.length - 1]!.x} ${bottom} L ${pts[0]!.x} ${bottom} Z`}
            fill="var(--hig-accent-tint)"
          />
        )}
        {/* The curve */}
        {pts.length >= 2 && (
          <path
            d={lineD}
            stroke="var(--hig-accent)"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {/* Points; the newest one pulses — the ledger's live edge */}
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

/* ------------------------------------------------------------------ */
/* The view                                                             */
/* ------------------------------------------------------------------ */

export function ReportsView() {

  const revenueQ = useMonthlyRevenue();
  const outstandingQ = useOutstandingPayments();
  const topQ = useTopCustomers(5);

  const months = revenueQ.data ?? [];
  const outstanding = outstandingQ.data ?? [];
  const topCustomers = topQ.data ?? [];

  const collectedToDate = useMemo(() => {
    if (months.length === 0) return 0;
    const last = months.at(-1);
    if (last?.runningTotal != null) return last.runningTotal;
    return months.reduce((s, m) => s + (m.revenue ?? 0), 0);
  }, [months]);

  const toCollect = useMemo(

    () => outstanding.reduce((s, o) => s + o.balanceDue, 0),
    [outstanding],
  );

  const overdueTotal = useMemo(
    () =>
      outstanding.reduce((sum, o) => (isOverdue(o) ? sum + o.balanceDue : sum), 0),
    [outstanding],
  );

  const failure = revenueQ.error ?? outstandingQ.error ?? topQ.error;
  /** The summary card is the one part that genuinely needs all three statements at once. */
  const loading = revenueQ.isPending || outstandingQ.isPending || topQ.isPending;
  const retryAll = () => {
    void revenueQ.refetch();
    void outstandingQ.refetch();
    void topQ.refetch();
  };

  const topPaidSum = useMemo(
    () => topCustomers.reduce((s, t) => s + (t.totalPaid ?? 0), 0),
    [topCustomers],
  );

  const outstandingTotal = toCollect;

  /**
   * The hero card's split bar: what share of everything billed has actually landed.
   * The chart's months are the source of truth for collected; the outstanding statement
   * for what hasn't. Zero-billed months (nothing yet) keep the bar at rest.
   */
  const billed = collectedToDate + toCollect;
  const collectedPct = billed > 0 ? Math.round((collectedToDate / billed) * 100) : 0;

  /** This month's revenue and the trend pill, exactly as the v2 overview computed them. */
  const thisMonth = months.at(-1) ?? null;
  const prevMonth = months.at(-2) ?? null;
  const momPct =
    thisMonth && prevMonth && prevMonth.revenue > 0
      ? Math.round(((thisMonth.revenue - prevMonth.revenue) / prevMonth.revenue) * 100)
      : null;

  /** Stitch's "Avg. Order" — honest average across every commission on the books. */
  const totalJobs = topCustomers.reduce((s, t) => s + t.jobCount, 0);
  const avgOrder =
    totalJobs > 0
      ? Math.round(topCustomers.reduce((s, t) => s + t.totalPaid, 0) / totalJobs)
      : 0;

  return (
    <main className="hig content-safe min-h-dvh bg-transparent text-(--hig-label) transition-colors duration-300">
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

        <div className="hig-rise px-5 pt-3" style={{ animationDelay: "40ms" }}>
          <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-secondary)">
            {todayLine()}
          </p>
          <h1 className="mt-1 text-[34px] font-medium leading-10.25 tracking-[-0.02em]">
            The <span className="text-(--hig-accent)">statement.</span>
          </h1>
          <p className="mt-1 text-[13px] text-(--hig-label-secondary)">
            Three ruled statements — collected, outstanding, best clients.
          </p>
        </div>

        {failure && (
          <ErrorBanner
            error={failure}
            offlineMessage="Couldn't reach the books. Check your connection."
            serverMessage="Something went wrong with the books. Try again."
            onRetry={retryAll}
            className="mx-5 mt-4"
          />
        )}

        {/* Hero ledger card — Stitch's accounts header: headline month, trend pill, split bar */}
        <div className="hig-rise mx-5 mt-5 rounded-3xl stitch-card px-5 pb-4 pt-4" style={{ animationDelay: "80ms" }}>
          {loading ? (
            <StatementSummarySkeleton />
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-(--hig-label-secondary)">
                  Collected · {thisMonth ? formatMonthKey(thisMonth.monthKey) : "all time"}
                </span>
                {momPct !== null && (
                  <span
                    className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                      momPct >= 0
                        ? "bg-(--hig-success-tint) text-(--hig-success)"
                        : "bg-(--hig-danger-tint) text-(--hig-danger)"
                    }`}
                  >
                    {momPct >= 0 ? "▲" : "▼"} {Math.abs(momPct)}% vs last month
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-[28px] font-semibold tracking-[-0.02em] [font-variant-numeric:tabular-nums]">
                  {naira(thisMonth?.revenue ?? collectedToDate)}
                </span>
                <span className="text-[10.5px] text-(--hig-label-tertiary)">NGN ledger</span>
              </div>

              {/* The split bar: collected vs outstanding, one strip of the studio's money */}
              <div className="mt-3.5 flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-(--hig-fill) p-0.5">
                {billed > 0 ? (
                  <>
                    <div
                      className="h-full rounded-full bg-(--hig-success) transition-all duration-500"
                      style={{ width: `${collectedPct}%` }}
                      title={`Collected: ${collectedPct}%`}
                    />
                    <div
                      className="h-full rounded-full bg-(--hig-warning) transition-all duration-500"
                      style={{ width: `${100 - collectedPct}%` }}
                      title={`Outstanding: ${100 - collectedPct}%`}
                    />
                  </>
                ) : (
                  <div className="h-full flex-1 rounded-full bg-(--hig-separator)" />
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-dashed border-(--hig-separator) pt-3">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-(--hig-success)" />
                  <div>
                    <p className="text-[10px] text-(--hig-label-secondary)">
                      Collected ({collectedPct}%)
                    </p>
                    <p className="text-[15px] font-semibold text-(--hig-success) [font-variant-numeric:tabular-nums]">
                      {naira(collectedToDate)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-(--hig-warning)" />
                  <div>
                    <p className="text-[10px] text-(--hig-label-secondary)">
                      Outstanding ({100 - collectedPct}%)
                    </p>
                    <p className="text-[15px] font-semibold text-(--hig-warning) [font-variant-numeric:tabular-nums]">
                      {naira(toCollect)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Stitch's throughput footer: the average order, from real sums */}
              {avgOrder > 0 && (
                <div className="mt-3 flex items-center gap-1.5 border-t border-dashed border-(--hig-separator) pt-3 text-[11.5px] text-(--hig-label-secondary)">
                  <span className="text-(--hig-label-tertiary)">Avg. commission</span>
                  <b className="font-semibold text-(--hig-label) [font-variant-numeric:tabular-nums]">
                    {naira(avgOrder)}
                  </b>
                  <span className="text-(--hig-label-tertiary)">
                    · {overdueTotal > 0 ? `${naira(overdueTotal)} of it overdue` : "nothing overdue"}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Statement · collected — the resurrected curve, then the ruled rows */}
        <section className="hig-rise mx-5 mt-6" style={{ animationDelay: "120ms" }}>
          <div className="mb-2.5 flex items-baseline justify-between px-1">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-secondary)">Statement · collected</h2>
            <span className="text-[12px] text-(--hig-label-tertiary) [font-variant-numeric:tabular-nums]">{months.length === 0 ? "monthly revenue" : `${months.length} ${months.length === 1 ? "month" : "months"}`}</span>
          </div>
          <div className="stitch-card overflow-hidden rounded-[20px]">
            {!revenueQ.isPending && months.length > 1 && (
              <div className="px-4 pt-2">
                <RevenueChart data={months} />
              </div>
            )}
            {/* The ruled rows */}
            <div className={months.length > 1 ? "mt-2 border-t border-dashed border-(--hig-separator)" : "border-t border-dashed border-(--hig-separator)"}>
              {revenueQ.isPending ? (
                <StatementRowsSkeleton />
              ) : months.length === 0 ? (
                <p className="px-4 py-10 text-center text-[13px] leading-5 text-(--hig-label-secondary)">No revenue yet — payments will appear here, month by month.</p>
              ) : (
                [...months].reverse().map((m, idx) => {
                  const isThisMonth = idx === 0;
                  return (
                    <div key={m.monthKey} className={`flex items-center gap-2.5 px-4 py-3 ${idx !== 0 ? "border-t border-dashed border-(--hig-separator)" : ""}`}>
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium">{formatMonthKey(m.monthKey)}</span>
                        <span className="mt-0.5 block text-[11px] text-(--hig-label-tertiary) [font-variant-numeric:tabular-nums]">
                          {isThisMonth ? "this month" : idx === months.length - 1 ? "first month on the books" : `month ${months.length - idx}`}
                        </span>
                      </div>
                      <span className="w-21.5 shrink-0 text-right text-[13.5px] font-medium text-(--hig-label-secondary) [font-variant-numeric:tabular-nums]">
                        {naira(m.revenue)}
                      </span>
                      <span className="w-23 shrink-0 text-right text-[14.5px] font-semibold [font-variant-numeric:tabular-nums]">
                        {naira(m.runningTotal ?? m.revenue)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
            {!revenueQ.isPending && months.length > 0 && (
              <div className="flex items-baseline justify-between border-t border-dashed border-(--hig-separator) px-4 py-3.5">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-tertiary)">Total collected</span>
                <span className="text-[17px] font-semibold [font-variant-numeric:tabular-nums]">{naira(collectedToDate)}</span>
              </div>
            )}
          </div>
        </section>

        {/* Statement · outstanding */}
        <section className="hig-rise mx-5 mt-6" style={{ animationDelay: "160ms" }}>
          <div className="mb-2.5 flex items-baseline justify-between px-1">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-secondary)">Statement · outstanding</h2>
            <span className="text-[12px] text-(--hig-label-tertiary) [font-variant-numeric:tabular-nums]">
              {outstanding.length === 0 ? "biggest balances first" : `${outstanding.length} ${outstanding.length === 1 ? "job" : "jobs"} · ${naira(outstandingTotal)}`}
            </span>
          </div>
          <div className="stitch-card overflow-hidden rounded-[20px]">
            <div className="border-t border-dashed border-(--hig-separator)">
              {outstandingQ.isPending ? (
                <OutstandingRowsSkeleton />
              ) : outstanding.length === 0 ? (
                <p className="px-4 py-10 text-center text-[13px] leading-5 text-(--hig-label-secondary)">All settled — no outstanding balances right now.</p>
              ) : (
                outstanding.map((o, idx) => {
                  const bal = o.balanceDue;                   const overdue = isOverdue(o);
                  const customerName = o.customer.name.trim();
                  const title = o.description.trim() || `Garment for ${o.subjectName}`;
                  const paid = o.totalPaid;
                  return (
                    <div key={o.jobId} className={`px-4 py-3.5 ${idx !== 0 ? "border-t border-dashed border-(--hig-separator)" : ""} ${overdue ? "bg-(--hig-danger-tint)" : ""}`}>
                      <p className="text-[14px] font-medium leading-snug wrap-anywhere">{title}</p>
                      {customerName ? (
                        <p className="mt-0.5 text-[12px] font-medium text-(--hig-label-secondary) wrap-anywhere">{customerName}</p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[11px] [font-variant-numeric:tabular-nums]">
                        <span className={overdue ? "font-semibold text-(--hig-danger)" : "text-(--hig-label-secondary)"}>
                          {overdue ? `overdue · due ${o.dueDate ? formatDay(String(o.dueDate)) : "—"}` : o.dueDate ? `due ${formatDay(String(o.dueDate))}` : "no due date"} · {naira(paid)} paid
                        </span>
                        <span className="ml-auto flex shrink-0 items-baseline gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-(--hig-label-tertiary)">{naira(o.agreedPrice)}</span>
                          <span className={`text-[15px] font-semibold ${overdue ? "text-(--hig-danger)" : "text-(--hig-warning)"}`}>{naira(bal)}</span>
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {!outstandingQ.isPending && outstanding.length > 0 && (
              <div className="flex items-baseline justify-between border-t border-dashed border-(--hig-separator) px-4 py-3.5">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-tertiary)">Total outstanding</span>
                <span className="text-[17px] font-semibold text-(--hig-warning) [font-variant-numeric:tabular-nums]">{naira(outstandingTotal)}</span>
              </div>
            )}
          </div>
        </section>

        {/* Statement · best clients — Stitch's patron circle */}
        <section className="hig-rise mx-5 mt-6" style={{ animationDelay: "200ms" }}>
          <div className="mb-2.5 flex items-baseline justify-between px-1">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-secondary)">Statement · best clients</h2>
            <span className="text-[12px] text-(--hig-label-tertiary)">by amount paid</span>
          </div>
          <div className="stitch-card overflow-hidden rounded-[20px]">
            {topQ.isPending ? (
              <div className="p-4">
                <StatementRowsSkeleton subLabel="w-14" />
              </div>
            ) : topCustomers.length === 0 ? (
              <p className="px-4 py-10 text-center text-[13px] leading-5 text-(--hig-label-secondary)">No paying customers yet — the board will fill as payments land.</p>
            ) : (
              topCustomers.map((t, idx) => {
                const name = t.name;
                const hue = avatarColor(name);
                return (
                  <div key={t.id} className={`flex items-center gap-3 p-3.5 ${idx !== 0 ? "border-t border-dashed border-(--hig-separator)" : ""}`}>
                    {/* The monogram; #1 wears the gold seal */}
                    <span className="relative shrink-0">
                      <span
                        className="flex h-10 w-10 items-center justify-center rounded-full border text-[13px] font-semibold"
                        style={{ backgroundColor: avatarTint(name), color: hue, borderColor: hue + "4D" }}
                      >
                        {initials(name)}
                      </span>
                      {idx === 0 && (
                        <span
                          className="absolute -bottom-0.5 -right-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-(--hig-warning) text-[8px] text-white"
                          title="Top client of the books"
                        >
                          ★
                        </span>
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="truncate text-[14px] font-semibold">{name}</h3>
                        <span className="shrink-0 text-[14px] font-bold [font-variant-numeric:tabular-nums]">
                          {naira(t.totalPaid)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-(--hig-label-tertiary) [font-variant-numeric:tabular-nums]">
                        {t.jobCount} {t.jobCount === 1 ? "commission" : "commissions"}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            {!topQ.isPending && topCustomers.length > 0 && (
              <div className="flex items-baseline justify-between border-t border-dashed border-(--hig-separator) px-4 py-3.5">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-tertiary)">
                  Paid by the top {topCustomers.length}
                </span>
                <span className="text-[17px] font-semibold [font-variant-numeric:tabular-nums]">{naira(topPaidSum)}</span>
              </div>
            )}
          </div>
        </section>

        <p className="mx-5 mt-6 text-center text-[11.5px] leading-relaxed text-(--hig-label-tertiary) [font-variant-numeric:tabular-nums]">
          {`Collected ${naira(collectedToDate)} · owing ${naira(outstandingTotal)} · the books balance.`}
        </p>
      </div>

      <TabBar active="reports" />
    </main>
  );
}
