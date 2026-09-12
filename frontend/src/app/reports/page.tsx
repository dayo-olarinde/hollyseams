"use client";

import { useMemo } from "react";
import TabBar from "@/components/ui/tab-bar";
import ThemeToggle from "@/components/ui/theme-toggle";
import {
  useMonthlyRevenue,
  useOutstandingPayments,
  useTopCustomers,
} from "@/hooks/use-reports";

const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtDay(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return `${+m[3]!} ${MONTHS[+m[2]! - 1]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]!}`;
}

/** "2026-09" → "September 2026" — monthKey fallback when the API's `month` is missing. */
function fmtMonth(monthKey: string, fallback?: string): string {
  if (fallback) return fallback;
  const m = /^(\d{4})-(\d{2})/.exec(monthKey);
  if (!m) return monthKey;
  return `${MONTHS[+m[2]! - 1]} ${m[1]}`;
}

/** "2026-09-24T00:00:00.000Z" → local midnight ms — the app-wide date parser (overdue-safe). */
function parseDay(value: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return new Date(+m[1]!, +m[2]! - 1, +m[3]!).getTime();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return NaN;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/* ---------------------------------- atoms ---------------------------------- */

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-(--hig-separator) ${className}`} />;
}

/* ---------------------------------- page ---------------------------------- */

export default function ReportsPage() {
  /* The keys live in use-reports.ts, so the payment sheet and the create-job
     wizard can invalidate these three without retyping their key strings. */
  const revenueQ = useMonthlyRevenue();
  const outstandingQ = useOutstandingPayments();
  const topQ = useTopCustomers(5);

  /* `select` in the hooks has already unwrapped the API envelope — `data` is
     the array itself, not `{ success, data, meta }`. */
  const months = revenueQ.data ?? [];
  const outstanding = outstandingQ.data ?? [];
  const topCustomers = topQ.data ?? [];

  /* cover — collected / to collect / overdue / studio balance */
  const collectedToDate = useMemo(() => {
    if (months.length === 0) return 0;
    const last = months.at(-1);
    if (last?.runningTotal != null) return last.runningTotal;
    return months.reduce((s, m) => s + (m.revenue ?? 0), 0);
  }, [months]);

  const toCollect = useMemo(
    // balanceDue is always present on the feed — see types/report.ts
    () => outstanding.reduce((s, o) => s + o.balanceDue, 0),
    [outstanding],
  );

  const overdueTotal = useMemo(() => {
    let sum = 0;
    const today = new Date(new Date().toDateString()).getTime();
    for (const o of outstanding) {
      const bal = o.balanceDue; // always present on the feed — see types/report.ts
      const overdue =
        o.status === "pending" &&
        !!o.dueDate &&
        Number.isFinite(parseDay(String(o.dueDate))) &&
        parseDay(String(o.dueDate)) < today;
      if (overdue) sum += bal;
    }
    return sum;
  }, [outstanding]);

  const studioBalance = collectedToDate - toCollect;

  const anyError = revenueQ.isError || outstandingQ.isError || topQ.isError;
  const loading = revenueQ.isPending || outstandingQ.isPending || topQ.isPending;
  const retryAll = () => {
    revenueQ.refetch();
    outstandingQ.refetch();
    topQ.refetch();
  };

  /* best clients footer — sum of the displayed rows */
  const topPaidSum = useMemo(
    () => topCustomers.reduce((s, t) => s + (t.totalPaid ?? 0), 0),
    [topCustomers],
  );

  const outstandingTotal = toCollect;

  return (
    <main className="hig min-h-dvh bg-(--hig-grouped) pb-40 text-(--hig-label) transition-colors duration-300">
      <div className="relative mx-auto w-full max-w-107.5">
        {/* ---------- chrome ---------- */}
        <header
          className="hig-rise sticky top-0 z-20 flex items-center justify-between bg-(--hig-bar)/80 px-5 py-2.5 backdrop-blur-[20px] backdrop-saturate-150"
          style={{ animationDelay: "0ms" }}
        >
          <p className="text-[20px] font-medium tracking-[-0.02em]">
            Holly<span className="text-(--hig-accent)">Seams</span>
          </p>
          <ThemeToggle />
        </header>

        {/* ---------- head ---------- */}
        <div className="hig-rise px-5 pt-3" style={{ animationDelay: "40ms" }}>
          <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-secondary)">
            {new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <h1 className="mt-1 text-[34px] font-medium leading-10.25 tracking-[-0.02em]">
            The <span className="text-(--hig-accent)">statement.</span>
          </h1>
          <p className="mt-1 text-[13px] text-(--hig-label-secondary)">
            Three ruled statements — collected, outstanding, best clients.
          </p>
        </div>

        {/* ---------- error banner ---------- */}
        {anyError && (
          <div className="mx-5 mt-4 flex items-center justify-between rounded-2xl bg-(--hig-danger-tint) px-4 py-3">
            <p className="text-[15px] text-(--hig-danger)">Couldn&apos;t reach the books. Check your connection.</p>
            <button type="button" onClick={retryAll} className="shrink-0 pl-3 text-[15px] font-semibold text-(--hig-accent)">
              Retry
            </button>
          </div>
        )}

        {/* ---------- the cover: balance summary ---------- */}
        <div className="hig-rise mx-5 mt-5 rounded-3xl bg-(--hig-card) px-5 pb-3 pt-4 shadow-[0_1px_3px_rgba(0,0,0,0.08)]" style={{ animationDelay: "80ms" }}>
          {loading ? (
            /* four ruled rows — same py/separators as the real cover */
            <div className="py-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className={`flex items-center justify-between py-1.75 ${i !== 0 ? "border-t border-dashed border-(--hig-separator)" : ""}`}>
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-5.75 w-24" />
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-dashed border-(--hig-separator) pb-1 pt-3">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-7 w-28" />
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-between py-1.75">
                <span className="text-[12.5px] font-medium text-(--hig-label-secondary)">Collected to date</span>
                <span className="text-[17px] font-semibold text-(--hig-success) [font-variant-numeric:tabular-nums]">{naira.format(collectedToDate)}</span>
              </div>
              <div className="flex items-baseline justify-between border-t border-dashed border-(--hig-separator) py-1.75">
                <span className="text-[12.5px] font-medium text-(--hig-label-secondary)">To collect</span>
                <span className="text-[17px] font-semibold text-(--hig-warning) [font-variant-numeric:tabular-nums]">{naira.format(toCollect)}</span>
              </div>
              <div className="flex items-baseline justify-between border-t border-dashed border-(--hig-separator) py-1.75">
                <span className="text-[12.5px] font-medium text-(--hig-label-secondary)">Overdue</span>
                <span className="text-[17px] font-semibold text-(--hig-danger) [font-variant-numeric:tabular-nums]">{naira.format(overdueTotal)}</span>
              </div>
              <div className="flex items-baseline justify-between border-t border-dashed border-(--hig-separator) pt-3">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-tertiary)">Studio balance</span>
                <span className="text-[22px] font-medium tracking-[-0.01em] [font-variant-numeric:tabular-nums]">{naira.format(studioBalance)}</span>
              </div>
            </>
          )}
        </div>

        {/* ---------- Statement · collected ---------- */}
        <section className="hig-rise mx-5 mt-6" style={{ animationDelay: "120ms" }}>
          <div className="mb-2.5 flex items-baseline justify-between px-1">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-secondary)">Statement · collected</h2>
            <span className="text-[12px] text-(--hig-label-tertiary) [font-variant-numeric:tabular-nums]">{months.length === 0 ? "monthly revenue" : `${months.length} ${months.length === 1 ? "month" : "months"}`}</span>
          </div>
          <div className="overflow-hidden rounded-[20px] bg-(--hig-card) shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            {/* column header — the ruled line that makes it a statement */}
            <div className="flex gap-2.5 px-4 pb-2 pt-3.5 text-[9.5px] font-semibold uppercase tracking-[0.07em] text-(--hig-label-tertiary)">
              <span className="flex-1">Month</span>
              <span className="w-21.5 shrink-0 text-right">Revenue</span>
              <span className="w-23 shrink-0 text-right">Running</span>
            </div>
            <div className="border-t border-dashed border-(--hig-separator)">
              {/* skeleton mirrors the two-line month row (title + caption,
                  tabular amounts) so loading doesn't shift the layout */}
              {revenueQ.isPending ? (
                <div className="p-2">
                  {[0,1,2].map((i)=>(
                    <div key={i} className="flex items-center gap-2.5 px-4 py-3">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                      <Skeleton className="h-4 w-21.5 shrink-0" />
                      <Skeleton className="h-4 w-23 shrink-0" />
                    </div>
                  ))}
                </div>
              ) : months.length === 0 ? (
                <p className="px-4 py-10 text-center text-[13px] leading-5 text-(--hig-label-secondary)">No revenue yet — payments will appear here, month by month.</p>
              ) : (
                <>
                  {/* newest month first — like a statement (the API is asc) */}
                  {[...months].reverse().map((m, idx) => {
                    const isThisMonth = idx === 0;
                    return (
                      <div key={m.monthKey} className={`flex items-center gap-2.5 px-4 py-3 ${idx !== 0 ? "border-t border-dashed border-(--hig-separator)" : ""}`}>
                        <div className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-medium">{fmtMonth(m.monthKey, (m as {month?:string}).month)}</span>
                          <span className="mt-0.5 block text-[11px] text-(--hig-label-tertiary) [font-variant-numeric:tabular-nums]">
                            {isThisMonth ? "this month" : idx === months.length - 1 ? "first month on the books" : `month ${months.length - idx}`}
                          </span>
                        </div>
                        <span className="w-21.5 shrink-0 text-right text-[13.5px] font-medium text-(--hig-label-secondary) [font-variant-numeric:tabular-nums]">
                          {naira.format(m.revenue)}
                        </span>
                        <span className="w-23 shrink-0 text-right text-[14.5px] font-semibold [font-variant-numeric:tabular-nums]">
                          {naira.format(m.runningTotal ?? m.revenue)}
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
                <span className="text-[17px] font-semibold [font-variant-numeric:tabular-nums]">{naira.format(collectedToDate)}</span>
              </div>
            )}
          </div>
        </section>

        {/* ---------- Statement · outstanding ---------- */}
        <section className="hig-rise mx-5 mt-6" style={{ animationDelay: "160ms" }}>
          <div className="mb-2.5 flex items-baseline justify-between px-1">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-secondary)">Statement · outstanding</h2>
            <span className="text-[12px] text-(--hig-label-tertiary) [font-variant-numeric:tabular-nums]">
              {outstanding.length === 0 ? "biggest balances first" : `${outstanding.length} ${outstanding.length === 1 ? "job" : "jobs"} · ${naira.format(outstandingTotal)}`}
            </span>
          </div>
          <div className="overflow-hidden rounded-[20px] bg-(--hig-card) shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <div className="border-t border-dashed border-(--hig-separator)">
              {/* skeleton mirrors the three-line outstanding row (title,
                  customer, money row) — the real row is ~92px tall */}
              {outstandingQ.isPending ? (
                <div className="p-2">
                  {[0,1,2].map((i)=>(
                    <div key={i} className="px-4 py-3.5">
                      <Skeleton className="h-5 w-3/4" />
                      <Skeleton className="mt-0.5 h-3.5 w-1/2" />
                      <div className="mt-2 flex items-center justify-between">
                        <Skeleton className="h-3.5 w-28" />
                        <Skeleton className="h-5 w-20" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : outstanding.length === 0 ? (
                <p className="px-4 py-10 text-center text-[13px] leading-5 text-(--hig-label-secondary)">All settled — no outstanding balances right now.</p>
              ) : (
                outstanding.map((o, idx) => {
                  const bal = o.balanceDue; // always present — see types/report.ts
                  const today = new Date(new Date().toDateString()).getTime();
                  const overdue =
                    o.status === "pending" &&
                    !!o.dueDate &&
                    Number.isFinite(parseDay(String(o.dueDate))) &&
                    parseDay(String(o.dueDate)) < today;
                  const customerName = o.customer.name.trim();
                  const title = o.description.trim() || `Garment for ${o.subjectName}`;
                  const paid = o.totalPaid;
                  return (
                    <div key={o.jobId} className={`px-4 py-3.5 ${idx !== 0 ? "border-t border-dashed border-(--hig-separator)" : ""} ${overdue ? "bg-(--hig-danger-tint)" : ""}`}>
                      {/* title row — full description, wraps; customer on its own line so neither truncates the other */}
                      <p className="text-[14px] font-medium leading-snug wrap-anywhere">{title}</p>
                      {customerName ? (
                        <p className="mt-0.5 text-[12px] font-medium text-(--hig-label-secondary) wrap-anywhere">{customerName}</p>
                      ) : null}
                      {/* money row — tabular numerals, overdue-aware */}
                      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[11px] [font-variant-numeric:tabular-nums]">
                        <span className={overdue ? "font-semibold text-(--hig-danger)" : "text-(--hig-label-secondary)"}>
                          {overdue ? `overdue · due ${o.dueDate ? fmtDay(String(o.dueDate)) : "—"}` : o.dueDate ? `due ${fmtDay(String(o.dueDate))}` : "no due date"} · {naira.format(paid)} paid
                        </span>
                        <span className="ml-auto flex shrink-0 items-baseline gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-(--hig-label-tertiary)">{naira.format(o.agreedPrice)}</span>
                          <span className={`text-[15px] font-semibold ${overdue ? "text-(--hig-danger)" : "text-(--hig-warning)"}`}>{naira.format(bal)}</span>
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
                <span className="text-[17px] font-semibold text-(--hig-warning) [font-variant-numeric:tabular-nums]">{naira.format(outstandingTotal)}</span>
              </div>
            )}
          </div>
          {/* stitched seam under the outstanding statement — the receipt edge from the concept */}
          <div className="mx-4 mt-0 border-t border-dashed border-(--hig-accent-line)" aria-hidden="true" />
        </section>

        {/* ---------- Statement · best clients ---------- */}
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
              {/* skeleton mirrors the two-line client row (rank + name,
                  job count) with the Jobs/Paid columns */}
              {topQ.isPending ? (
                <div className="p-2">
                  {[0,1,2].map((i)=>(
                    <div key={i} className="flex items-center gap-2.5 px-4 py-3">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-14" />
                      </div>
                      <Skeleton className="h-4 w-21.5 shrink-0" />
                      <Skeleton className="h-4 w-23 shrink-0" />
                    </div>
                  ))}
                </div>
              ) : topCustomers.length === 0 ? (
                <p className="px-4 py-10 text-center text-[13px] leading-5 text-(--hig-label-secondary)">No paying customers yet — the board will fill as payments land.</p>
              ) : (
                topCustomers.map((t, idx) => {
                  const rank = String(idx + 1).padStart(2, "0");
                  const name = t.name; // always present — see types/report.ts
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
                      <span className="w-23 shrink-0 text-right text-[14.5px] font-semibold [font-variant-numeric:tabular-nums]">{naira.format(t.totalPaid)}</span>
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
                <span className="text-[17px] font-semibold [font-variant-numeric:tabular-nums]">{naira.format(topPaidSum)}</span>
              </div>
            )}
          </div>
        </section>

        {/* closing line — like the html's balance footer */}
        <p className="mx-5 mt-6 text-center text-[11.5px] leading-relaxed text-(--hig-label-tertiary) [font-variant-numeric:tabular-nums]">
          {`Collected ${naira.format(collectedToDate)} · owing ${naira.format(outstandingTotal)} · the books balance.`}
        </p>
      </div>

      {/* ---------- tab bar ---------- */}
      <TabBar active="reports" />
    </main>
  );
}
