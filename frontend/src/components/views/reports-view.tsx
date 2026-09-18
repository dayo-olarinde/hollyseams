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
  naira,
  todayLine,
} from "@/lib/format";

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

  const studioBalance = collectedToDate - toCollect;

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

  return (
    <main className="hig content-safe min-h-dvh bg-(--hig-grouped) text-(--hig-label) transition-colors duration-300">
      <div className="relative mx-auto w-full max-w-107.5">
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

        {}
        <div className="hig-rise mx-5 mt-5 rounded-3xl bg-(--hig-card) px-5 pb-3 pt-4 shadow-[0_1px_3px_rgba(0,0,0,0.08)]" style={{ animationDelay: "80ms" }}>
          {loading ? (
            <StatementSummarySkeleton />
          ) : (
            <>
              <div className="flex items-baseline justify-between py-1.75">
                <span className="text-[12.5px] font-medium text-(--hig-label-secondary)">Collected to date</span>
                <span className="text-[17px] font-semibold text-(--hig-success) [font-variant-numeric:tabular-nums]">{naira(collectedToDate)}</span>
              </div>
              <div className="flex items-baseline justify-between border-t border-dashed border-(--hig-separator) py-1.75">
                <span className="text-[12.5px] font-medium text-(--hig-label-secondary)">To collect</span>
                <span className="text-[17px] font-semibold text-(--hig-warning) [font-variant-numeric:tabular-nums]">{naira(toCollect)}</span>
              </div>
              <div className="flex items-baseline justify-between border-t border-dashed border-(--hig-separator) py-1.75">
                <span className="text-[12.5px] font-medium text-(--hig-label-secondary)">Overdue</span>
                <span className="text-[17px] font-semibold text-(--hig-danger) [font-variant-numeric:tabular-nums]">{naira(overdueTotal)}</span>
              </div>
              <div className="flex items-baseline justify-between border-t border-dashed border-(--hig-separator) pt-3">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-tertiary)">Studio balance</span>
                <span className="text-[22px] font-medium tracking-[-0.01em] [font-variant-numeric:tabular-nums]">{naira(studioBalance)}</span>
              </div>
            </>
          )}
        </div>

        {}
        <section className="hig-rise mx-5 mt-6" style={{ animationDelay: "120ms" }}>
          <div className="mb-2.5 flex items-baseline justify-between px-1">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-secondary)">Statement · collected</h2>
            <span className="text-[12px] text-(--hig-label-tertiary) [font-variant-numeric:tabular-nums]">{months.length === 0 ? "monthly revenue" : `${months.length} ${months.length === 1 ? "month" : "months"}`}</span>
          </div>
          <div className="overflow-hidden rounded-[20px] bg-(--hig-card) shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            {}
            <div className="flex gap-2.5 px-4 pb-2 pt-3.5 text-[9.5px] font-semibold uppercase tracking-[0.07em] text-(--hig-label-tertiary)">
              <span className="flex-1">Month</span>
              <span className="w-21.5 shrink-0 text-right">Revenue</span>
              <span className="w-23 shrink-0 text-right">Running</span>
            </div>
            <div className="border-t border-dashed border-(--hig-separator)">
              {}
              {revenueQ.isPending ? (
                <StatementRowsSkeleton />
              ) : months.length === 0 ? (
                <p className="px-4 py-10 text-center text-[13px] leading-5 text-(--hig-label-secondary)">No revenue yet — payments will appear here, month by month.</p>
              ) : (
                <>
                  {}
                  {[...months].reverse().map((m, idx) => {
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
                  })}
                </>
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

        {}
        <section className="hig-rise mx-5 mt-6" style={{ animationDelay: "160ms" }}>
          <div className="mb-2.5 flex items-baseline justify-between px-1">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-secondary)">Statement · outstanding</h2>
            <span className="text-[12px] text-(--hig-label-tertiary) [font-variant-numeric:tabular-nums]">
              {outstanding.length === 0 ? "biggest balances first" : `${outstanding.length} ${outstanding.length === 1 ? "job" : "jobs"} · ${naira(outstandingTotal)}`}
            </span>
          </div>
          <div className="overflow-hidden rounded-[20px] bg-(--hig-card) shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <div className="border-t border-dashed border-(--hig-separator)">
              {}
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
                      {}
                      <p className="text-[14px] font-medium leading-snug wrap-anywhere">{title}</p>
                      {customerName ? (
                        <p className="mt-0.5 text-[12px] font-medium text-(--hig-label-secondary) wrap-anywhere">{customerName}</p>
                      ) : null}
                      {}
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
          {}
          <div className="mx-4 mt-0 border-t border-dashed border-(--hig-accent-line)" aria-hidden="true" />
        </section>

        {}
        <section className="hig-rise mx-5 mt-6" style={{ animationDelay: "200ms" }}>
          <div className="mb-2.5 flex items-baseline justify-between px-1">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-secondary)">Statement · best clients</h2>
            <span className="text-[12px] text-(--hig-label-tertiary)">by amount paid</span>
          </div>
          <div className="overflow-hidden rounded-[20px] bg-(--hig-card) shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <div className="flex gap-2.5 px-4 pb-2 pt-3.5 text-[9.5px] font-semibold uppercase tracking-[0.07em] text-(--hig-label-tertiary)">
              <span className="flex-1">Client</span>
              <span className="w-21.5 shrink-0 text-right">Jobs</span>
              <span className="w-23 shrink-0 text-right">Paid</span>
            </div>
            <div className="border-t border-dashed border-(--hig-separator)">
              {}
              {topQ.isPending ? (
                <StatementRowsSkeleton subLabel="w-14" />
              ) : topCustomers.length === 0 ? (
                <p className="px-4 py-10 text-center text-[13px] leading-5 text-(--hig-label-secondary)">No paying customers yet — the board will fill as payments land.</p>
              ) : (
                topCustomers.map((t, idx) => {
                  const rank = String(idx + 1).padStart(2, "0");
                  const name = t.name;
                  return (
                    <div key={t.id} className={`flex items-center gap-2.5 px-4 py-3 ${idx !== 0 ? "border-t border-dashed border-(--hig-separator)" : ""}`}>
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium">
                          <span className={`mr-1.5 text-[12.5px] font-semibold [font-variant-numeric:tabular-nums] ${idx === 0 ? "text-(--hig-accent)" : "text-(--hig-label-tertiary)"}`}>#{rank}</span>
                          {name}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-(--hig-label-tertiary) [font-variant-numeric:tabular-nums]">{t.jobCount} {t.jobCount === 1 ? "job" : "jobs"}</span>
                      </div>
                      <span className="w-21.5 shrink-0 text-right text-[13.5px] font-medium text-(--hig-label-secondary) [font-variant-numeric:tabular-nums]">{t.jobCount}</span>
                      <span className="w-23 shrink-0 text-right text-[14.5px] font-semibold [font-variant-numeric:tabular-nums]">{naira(t.totalPaid)}</span>
                    </div>
                  );
                })
              )}
            </div>
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

        {}
        <p className="mx-5 mt-6 text-center text-[11.5px] leading-relaxed text-(--hig-label-tertiary) [font-variant-numeric:tabular-nums]">
          {`Collected ${naira(collectedToDate)} · owing ${naira(outstandingTotal)} · the books balance.`}
        </p>
      </div>

      {}
      <TabBar active="reports" />
    </main>
  );
}
