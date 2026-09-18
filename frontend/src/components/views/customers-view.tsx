import Link from "next/link";
import { useMemo, useState } from "react";
import NewJobModal from "@/components/jobs/new-job-modal";
import { ErrorBanner } from "@/components/ui/error-banner";
import TabBar from "@/components/ui/tab-bar";
// The row shapes, shared with the tap shell so a tab never shows two different skeletons.
import {
  FilmstripCardSkeleton,
  HouseholdCardSkeleton,
} from "@/components/ui/skeletons";
import ThemeToggle from "@/components/ui/theme-toggle";
import {
  useCustomersList,
  usePrefetchCustomerFile,
} from "@/hooks/use-customers";
import { useOutstandingPayments, useTopCustomers } from "@/hooks/use-reports";
import { avatarColor, avatarTint } from "@/lib/avatar-colors";
import { initials, isOverdue, naira, todayLine } from "@/lib/format";
import type { Customer } from "@/types/customer";

function HouseholdCard({ customer }: { customer: Customer }) {
  const prefetchFile = usePrefetchCustomerFile();

  return (
    /* A real link: the route is prefetched while the row is on screen, and the client's file starts
       loading on `pointerdown` instead of when the page mounts. */
    <Link
      href={`/customers/${customer.id}`}
      onPointerDown={() => prefetchFile(customer.id)}
      aria-label={`Open ${customer.name}'s file`}
      className="flex cursor-pointer items-center gap-3 rounded-[20px] bg-(--hig-card) px-4 py-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-transform duration-200 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-(--hig-accent)"
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-[14px] font-semibold"
        style={{
          backgroundColor: avatarTint(customer.name),
          color: avatarColor(customer.name),
          borderColor: avatarColor(customer.name) + "4D",
        }}
      >
        {initials(customer.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[16px] font-medium tracking-[-0.01em]">
          {customer.name}
        </p>
        <p className="mt-0.5 truncate text-[12px] text-(--hig-label-secondary)">
          {customer.phoneNumber ?? "no phone on file"}
        </p>
      </div>
      <span className="shrink-0 text-[17px] text-(--hig-label-tertiary)" aria-hidden="true">
        ›
      </span>
    </Link>
  );
}

export function CustomersView() {
  const [newJobOpen, setNewJobOpen] = useState(false);

  const listQ = useCustomersList();
  const outstandingQ = useOutstandingPayments();
  const topQ = useTopCustomers(5);

  /**
   * One request now covers the rows *and* the household count.
   *
   * The count used to be a second, separate query that fetched up to 100 customers and reported
   * `.length` — the same list, over the network, twice, to learn a number the first response could
   * have carried. `GET /customers` returns `meta.totalCount`, so it does.
   */
  const customers = listQ.data?.rows ?? [];
  const households = listQ.data?.totalCount ?? 0;

  const totals = useMemo(() => {
    let due = 0;
    let over = 0;
    for (const o of outstandingQ.data ?? []) {
      const bal = o.balanceDue;
      due += bal;
      if (isOverdue(o)) over += bal;
    }
    return { due, over };
  }, [outstandingQ.data]);

  const loading = listQ.isPending;
  const failure =
    listQ.error ?? outstandingQ.error ?? topQ.error;
  const retryAll = () => {
    void listQ.refetch();
    void outstandingQ.refetch();
    void topQ.refetch();
  };

  return (
    <main className="hig content-safe min-h-dvh bg-(--hig-grouped) text-(--hig-label) transition-colors duration-300">
      <div className="relative mx-auto w-full max-w-107.5">
        <header className="hig-rise safe-top sticky top-0 z-20 flex items-center justify-between bg-(--hig-bar)/80 px-5 pb-2.5 backdrop-blur-[20px] backdrop-saturate-150" style={{ animationDelay: "0ms" }}>
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
            The family <span className="text-(--hig-accent)">album.</span>
          </h1>
          <p className="mt-1 text-[13px] text-(--hig-label-secondary)">
            Every client, and the people you sew for.
          </p>
        </div>

        {}
        <div className="hig-rise mt-5 grid grid-cols-3 gap-2.5 px-5" style={{ animationDelay: "80ms" }}>
          <div className="rounded-[18px] bg-(--hig-card) py-3 text-center shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <p className="text-[17px] font-medium leading-tight text-(--hig-warning) [font-variant-numeric:tabular-nums]">
              {naira(totals.due)}
            </p>
            <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-tertiary)">
              To collect
            </p>
          </div>
          <div className="rounded-[18px] bg-(--hig-card) py-3 text-center shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <p className="text-[17px] font-medium leading-tight text-(--hig-danger) [font-variant-numeric:tabular-nums]">
              {naira(totals.over)}
            </p>
            <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-tertiary)">
              Overdue
            </p>
          </div>
          <div className="rounded-[18px] bg-(--hig-card) py-3 text-center shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <p className="text-[17px] font-medium leading-tight [font-variant-numeric:tabular-nums]">
              {listQ.isPending ? "…" : households}
            </p>
            <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-tertiary)">
              Households
            </p>
          </div>
        </div>

        {}
        <div className="hig-rise mt-5" style={{ animationDelay: "120ms" }}>
          <div className="flex items-baseline justify-between px-5">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-secondary)">
              Top clients
            </h2>
            <span className="text-[12px] text-(--hig-label-tertiary)">by amount paid</span>
          </div>
          <div
            className="mt-2 flex gap-2.5 overflow-x-auto px-5 pb-2 scrollbar-none [&::-webkit-scrollbar]:hidden"
            style={{
              maskImage:
                "linear-gradient(90deg, transparent 0, #000 20px, #000 calc(100% - 20px), transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(90deg, transparent 0, #000 20px, #000 calc(100% - 20px), transparent 100%)",
            }}
          >
            {(topQ.data ?? []).map((t, i) => (
              <div
                key={t.id}
                className="w-37.5 shrink-0 rounded-[18px] bg-(--hig-card) px-3.5 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
              >
                <p className="text-[9px] font-semibold tracking-[0.14em] text-(--hig-label-tertiary)">
                  #<b className="text-(--hig-accent)">{String(i + 1).padStart(2, "0")}</b>
                </p>
                <span
                  className="mt-2 flex h-9 w-9 items-center justify-center rounded-full border text-[12px] font-semibold"
                  style={{
                    backgroundColor: avatarTint(t.name),
                    color: avatarColor(t.name),
                    borderColor: avatarColor(t.name) + "4D",
                  }}
                >
                  {initials(t.name ?? "•")}
                </span>
                <p className="mt-2 truncate text-[12.5px] font-medium">
                  {t.name}
                </p>
                <p className="mt-0.5 text-[9.5px] text-(--hig-label-tertiary)">
                  {t.jobCount} {t.jobCount === 1 ? "job" : "jobs"}
                </p>
                <p className="mt-2 text-[16px] font-medium tracking-[-0.01em] [font-variant-numeric:tabular-nums]">
                  {naira(t.totalPaid)}
                </p>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-(--hig-label-tertiary)">
                  paid
                </p>
              </div>
            ))}
            {topQ.isPending && (
              <>
                <FilmstripCardSkeleton />
                <FilmstripCardSkeleton />
              </>
            )}
          </div>
        </div>

        {failure && (
          <ErrorBanner
            error={failure}
            offlineMessage="Couldn't reach the studio. Check your connection."
            onRetry={retryAll}
            className="mx-5 mt-4"
          />
        )}

        {!failure && (
          <div className="mt-5 flex items-baseline justify-between px-5 text-[12px] text-(--hig-label-tertiary) [font-variant-numeric:tabular-nums]">
            <span>
              <b className="font-medium text-(--hig-label-secondary)">
                {listQ.isPending ? customers.length : households}
              </b>{" "}
              clients · A→Z
            </span>
          </div>
        )}

        {}
        {loading ? (
          <div className="mt-3 space-y-3 px-5">
            {[0, 1, 2].map((i) => (
              <HouseholdCardSkeleton key={i} />
            ))}
          </div>
        ) : customers.length === 0 && !failure ? (
          <div className="mt-3 rounded-[20px] bg-(--hig-card) px-6 py-10 text-center">
            <p className="text-[15px] font-semibold">No clients yet.</p>
            <p className="mt-1.5 text-[13px] leading-5 text-(--hig-label-secondary)">
              New clients land here, A→Z, the moment a job is created.
            </p>
            <button
              type="button"
              onClick={() => setNewJobOpen(true)}
              className="mt-4 rounded-[13px] bg-(--hig-accent) px-5 py-3 text-[14px] font-semibold text-white transition-transform duration-200 active:scale-95"
            >
              + New client
            </button>
          </div>
        ) : (
          <div className="mt-3 space-y-3 px-5">
            {customers.map((c) => (
              <HouseholdCard key={c.id} customer={c} />
            ))}

            {listQ.hasNextPage && (
              <button
                type="button"
                onClick={() => listQ.fetchNextPage()}
                disabled={listQ.isFetchingNextPage}
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-2xl bg-(--hig-card) py-3.5 text-[15px] font-medium text-(--hig-label) transition-transform duration-200 active:scale-[0.98] disabled:opacity-60"
              >
                {listQ.isFetchingNextPage ? (
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-(--hig-accent-soft) border-t-(--hig-accent)"
                    aria-hidden="true"
                  />
                ) : (
                  <>
                    Show more clients
                    <span className="text-(--hig-accent)">▾</span>
                  </>
                )}
              </button>
            )}
            {!listQ.hasNextPage && customers.length > 0 && (
              <p className="mt-4 text-center text-[11.5px] text-(--hig-label-tertiary)">
                You&apos;re all caught up — every client is here.
              </p>
            )}
          </div>
        )}
      </div>

      {}
      <TabBar
        active="customers"
        fab={
          <button
            type="button"
            aria-label="New client"
            title="New client"
            onClick={() => setNewJobOpen(true)}
            className="fab-safe pointer-events-auto absolute right-5 z-10 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-(--hig-accent) text-white shadow-(--hig-bar-shadow) transition-transform duration-200 active:scale-90"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
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