"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import NewJobModal from "@/components/jobs/new-job-modal";
import TabBar from "@/components/ui/tab-bar";
import ThemeToggle from "@/components/ui/theme-toggle";
import { useCustomersCounts, useCustomersList } from "@/hooks/use-customers";
import { useOutstandingPayments, useTopCustomers } from "@/hooks/use-reports";
import { avatarColor, avatarTint } from "@/lib/avatar-colors";
import type { Customer } from "@/types/customer";

const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

function parseDay(value: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return new Date(+m[1]!, +m[2]! - 1, +m[3]!).getTime();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return NaN;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
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

function HouseholdCard({ customer }: { customer: Customer }) {
  const router = useRouter();

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`Open ${customer.name}'s file`}
      onClick={() => router.push(`/customers/${customer.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(`/customers/${customer.id}`);
        }
      }}
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
    </article>
  );
}

function CardSkeleton() {
  const bar = "animate-pulse rounded bg-(--hig-separator)";
  return (
    <div className="flex items-center gap-3 rounded-[20px] bg-(--hig-card) px-4 py-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
      <div className={`h-11 w-11 shrink-0 rounded-full ${bar}`} />
      <div className="flex-1">
        <div className={`h-4 w-32 ${bar}`} />
        <div className={`mt-0.5 h-3 w-40 ${bar}`} />
      </div>
      <div className={`h-4.25 w-2.5 ${bar}`} />
    </div>
  );
}

function FilmstripCardSkeleton() {
  const bar = "animate-pulse rounded bg-(--hig-separator)";
  return (
    <div className="w-37.5 shrink-0 rounded-[18px] bg-(--hig-card) px-3.5 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
      <div className={`h-3 w-8 ${bar}`} />
      <div className={`mt-2 h-9 w-9 rounded-full ${bar}`} />
      <div className={`mt-2 h-3.5 w-24 ${bar}`} />
      <div className={`mt-0.5 h-2.5 w-14 ${bar}`} />
      <div className={`mt-2 h-5 w-20 ${bar}`} />
      <div className={`mt-0.5 h-2.5 w-8 ${bar}`} />
    </div>
  );
}

export default function CustomersPage() {
  const [newJobOpen, setNewJobOpen] = useState(false);

  const listQ = useCustomersList();
  const countsQ = useCustomersCounts();
  const outstandingQ = useOutstandingPayments();
  const topQ = useTopCustomers(5);

  const customers = listQ.data ?? [];

  const households = countsQ.data?.length ?? customers.length;
  const totals = useMemo(() => {
    let due = 0;
    let over = 0;
    for (const o of outstandingQ.data ?? []) {
      const bal = o.balanceDue;
      due += bal;
      const pastDue =
        o.status === "pending" &&
        !!o.dueDate &&
        Number.isFinite(parseDay(String(o.dueDate))) &&
        parseDay(String(o.dueDate)) < new Date(new Date().toDateString()).getTime();
      if (pastDue) over += bal;
    }
    return { due, over };
  }, [outstandingQ.data]);

  const loading = listQ.isPending;
  const anyError = listQ.isError || countsQ.isError || outstandingQ.isError || topQ.isError;
  const retryAll = () => {
    listQ.refetch();
    countsQ.refetch();
    outstandingQ.refetch();
    topQ.refetch();
  };

  return (
    <main className="hig min-h-dvh bg-(--hig-grouped) pb-40 text-(--hig-label) transition-colors duration-300">
      <div className="relative mx-auto w-full max-w-107.5">
        {}
        <header className="hig-rise sticky top-0 z-20 flex items-center justify-between bg-(--hig-bar)/80 px-5 py-2.5 backdrop-blur-[20px] backdrop-saturate-150" style={{ animationDelay: "0ms" }}>
          <p className="text-[20px] font-medium tracking-[-0.02em]">
            Holly<span className="text-(--hig-accent)">Seams</span>
          </p>
          <ThemeToggle />
        </header>

        {}
        <div className="hig-rise px-5 pt-3" style={{ animationDelay: "40ms" }}>
          <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-secondary)">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
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
              {naira.format(totals.due)}
            </p>
            <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-tertiary)">
              To collect
            </p>
          </div>
          <div className="rounded-[18px] bg-(--hig-card) py-3 text-center shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <p className="text-[17px] font-medium leading-tight text-(--hig-danger) [font-variant-numeric:tabular-nums]">
              {naira.format(totals.over)}
            </p>
            <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-tertiary)">
              Overdue
            </p>
          </div>
          <div className="rounded-[18px] bg-(--hig-card) py-3 text-center shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <p className="text-[17px] font-medium leading-tight [font-variant-numeric:tabular-nums]">
              {countsQ.isPending ? "…" : households}
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
                  {naira.format(t.totalPaid)}
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

        {}
        {anyError && (
          <div className="mx-5 mt-4 flex items-center justify-between rounded-2xl bg-(--hig-danger-tint) px-4 py-3">
            <p className="text-[15px] text-(--hig-danger)">
              Couldn&apos;t reach the studio. Check your connection.
            </p>
            <button
              type="button"
              onClick={retryAll}
              className="shrink-0 pl-3 text-[15px] font-semibold text-(--hig-accent)"
            >
              Retry
            </button>
          </div>
        )}

        {}
        {!anyError && (
          <div className="mt-5 flex items-baseline justify-between px-5 text-[12px] text-(--hig-label-tertiary) [font-variant-numeric:tabular-nums]">
            {}
            <span>
              <b className="font-medium text-(--hig-label-secondary)">
                {countsQ.data ? households : customers.length}
              </b>{" "}
              clients · A→Z
            </span>
          </div>
        )}

        {}
        {loading ? (
          <div className="mt-3 space-y-3 px-5">
            {[0, 1, 2].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : customers.length === 0 && !anyError ? (
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
            className="pointer-events-auto absolute bottom-21 right-5 z-10 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-(--hig-accent) text-white shadow-(--hig-bar-shadow) transition-transform duration-200 active:scale-90"
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