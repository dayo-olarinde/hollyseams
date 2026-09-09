"use client";

/**
 * Customers — "The Family Album" (Concept 3, wired to the live API).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SCREEN ANATOMY (top to bottom)
 * ─────────────────────────────────────────────────────────────────────────
 *   • Chrome    — wordmark + theme toggle (sticky).
 *   • Head      — date caption, Large Title "The family album.", sub line.
 *   • Stat strip — to collect / overdue / households, derived from the
 *                  outstanding-payments feed + one counts read.
 *   • Top clients — the filmstrip the user asked to keep from the early
 *                  overview concept: rank, hue avatar, name, jobs, total
 *                  paid. Fed by GET /reports/top-customers (totalPaid
 *                  DESC) — one read, no derivation.
 *   • Household cards — one per client, A→Z, deliberately clean: avatar,
 *                  name, phone, chevron. No subject chips (a customer can
 *                  have up to 10 subjects), NO balances/amounts (the user's
 *                  call — the money lives in the customer file). Tapping a
 *                  card opens /customers/:id which fetches subjects + jobs
 *                  on demand.
 *   • Show more — cursor pagination (limit 20, ASC name — the API's
 *                  alphabetical order, keyset cursor "NAME|id").
 *
 * DATA FLOW (four reads, all existing endpoints):
 *   ["customers","list"]     useInfiniteQuery → GET /customers (paginated)
 *   ["customers","counts"]   GET /customers?limit=100 — households stat +
 *                            search-less totals (same companion pattern as
 *                            the jobs screen's filter counts)
 *   ["reports","outstanding-payments"]  per-job balances → card chips,
 *                            stat strip sums, overdue flags
 *   ["reports","top-customers"]         the filmstrip
 *   The balances feed is keyed by customer id; a customer's balance is
 *   the SUM of their jobs' balanceDue. Job counts on cards come from this
 *   feed too (jobs with balances) — full job history lives in the file.
 *
 * Derived states match the app: overdue = pending + due date before today;
 * the API serializes date columns as ISO, so dates are parsed leniently.
 */
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import NewJobModal from "@/components/new-job-modal";
import TabBar from "@/components/tab-bar";
import ThemeToggle from "@/components/theme-toggle";
import {
  getOutstandingPayments,
  getTopCustomers,
  listCustomers,
  type Customer,
} from "@/lib/api-client";
import { avatarColor, avatarTint } from "@/lib/avatar-colors";

/* ---------------------------------- helpers ---------------------------------- */

const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

/** Pending + due before today — the app-wide overdue derivation (ISO-safe). */
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

/* ---------------------------------- card ---------------------------------- */

/** Household card — deliberately CLEAN (per the user's call): no balance
    pill, no amounts, no subject chips — the money and the family live in
    the customer file at /customers/:id, so the list is just who they are
    and a chevron into the file. */
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
      className="flex cursor-pointer items-center gap-3 rounded-[20px] bg-[var(--hig-card)] px-4 py-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-transform duration-200 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--hig-accent)]"
    >
      <span
        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border text-[14px] font-semibold"
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
        <p className="mt-0.5 truncate text-[12px] text-[var(--hig-label-secondary)]">
          {customer.phoneNumber ?? "no phone on file"}
        </p>
      </div>
      <span className="shrink-0 text-[17px] text-[var(--hig-label-tertiary)]" aria-hidden="true">
        ›
      </span>
    </article>
  );
}

/** Household card skeleton — mirrors the real card (44px avatar, name,
    phone line, chevron) so loading doesn't shift the list. */
function CardSkeleton() {
  const bar = "animate-pulse rounded bg-[var(--hig-separator)]";
  return (
    <div className="flex items-center gap-3 rounded-[20px] bg-[var(--hig-card)] px-4 py-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
      <div className={`h-11 w-11 flex-shrink-0 rounded-full ${bar}`} />
      <div className="flex-1">
        <div className={`h-4 w-32 ${bar}`} />
        <div className={`mt-0.5 h-3 w-40 ${bar}`} />
      </div>
      <div className={`h-[17px] w-2.5 ${bar}`} />
    </div>
  );
}

/** Filmstrip card skeleton — mirrors the real Top-clients card anatomy:
    rank, avatar, name, job count, amount, "paid" caption. */
function FilmstripCardSkeleton() {
  const bar = "animate-pulse rounded bg-[var(--hig-separator)]";
  return (
    <div className="w-[150px] flex-shrink-0 rounded-[18px] bg-[var(--hig-card)] px-3.5 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
      <div className={`h-3 w-8 ${bar}`} />
      <div className={`mt-2 h-9 w-9 rounded-full ${bar}`} />
      <div className={`mt-2 h-3.5 w-24 ${bar}`} />
      <div className={`mt-0.5 h-2.5 w-14 ${bar}`} />
      <div className={`mt-2 h-5 w-20 ${bar}`} />
      <div className={`mt-0.5 h-2.5 w-8 ${bar}`} />
    </div>
  );
}

/* ---------------------------------- page ---------------------------------- */

export default function CustomersPage() {
  const [newJobOpen, setNewJobOpen] = useState(false);

  /* 1 · the A→Z list — cursor-paginated (limit 20, ASC name) */
  const listQ = useInfiniteQuery({
    queryKey: ["customers", "list"],
    queryFn: ({ pageParam }) => listCustomers({ limit: 20, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });

  /* 2 · counts — one limit-100 read for the households stat (the cursor
     feed alone can't know totals; same pattern as the jobs screen) */
  const countsQ = useQuery({
    queryKey: ["customers", "counts"],
    queryFn: () => listCustomers({ limit: 100 }),
  });

  /* 3 · balances — the outstanding-payments feed the dashboard uses */
  const outstandingQ = useQuery({
    queryKey: ["reports", "outstanding-payments"],
    queryFn: getOutstandingPayments,
  });

  /* 4 · the Top clients filmstrip (kept from the early overview concept) */
  const topQ = useQuery({
    queryKey: ["reports", "top-customers"],
    queryFn: () => getTopCustomers({ limit: 5 }),
  });

  const customers = useMemo(
    () => listQ.data?.pages.flatMap((p) => p.data ?? []) ?? [],
    [listQ.data],
  );

  /* screen-level money — the outstanding feed sums the stat strip; the
     per-card amounts were removed per the user's call (they live in the
     customer file now) */
  const households = countsQ.data?.data?.length ?? customers.length;
  const totals = useMemo(() => {
    let due = 0;
    let over = 0;
    for (const o of outstandingQ.data?.data ?? []) {
      const bal = o.balanceDue ?? o.balance ?? 0;
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
    <main className="hig min-h-dvh bg-[var(--hig-grouped)] pb-40 text-[var(--hig-label)] transition-colors duration-300">
      <div className="relative mx-auto w-full max-w-[430px]">
        {/* ---------- chrome ---------- */}
        <header className="hig-rise sticky top-0 z-20 flex items-center justify-between bg-[var(--hig-bar)]/80 px-5 py-2.5 backdrop-blur-[20px] backdrop-saturate-150" style={{ animationDelay: "0ms" }}>
          <p className="text-[20px] font-medium tracking-[-0.02em]">
            Holly<span className="text-[var(--hig-accent)]">Seams</span>
          </p>
          <ThemeToggle />
        </header>

        {/* ---------- head ---------- */}
        <div className="hig-rise px-5 pt-3" style={{ animationDelay: "40ms" }}>
          <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--hig-label-secondary)]">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
          <h1 className="mt-1 text-[34px] font-medium leading-[41px] tracking-[-0.02em]">
            The family <span className="text-[var(--hig-accent)]">album.</span>
          </h1>
          <p className="mt-1 text-[13px] text-[var(--hig-label-secondary)]">
            Every client, and the people you sew for.
          </p>
        </div>

        {/* ---------- stat strip (from the outstanding feed) ---------- */}
        <div className="hig-rise mt-5 grid grid-cols-3 gap-2.5 px-5" style={{ animationDelay: "80ms" }}>
          <div className="rounded-[18px] bg-[var(--hig-card)] py-3 text-center shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <p className="text-[17px] font-medium leading-tight text-[var(--hig-warning)] [font-variant-numeric:tabular-nums]">
              {naira.format(totals.due)}
            </p>
            <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--hig-label-tertiary)]">
              To collect
            </p>
          </div>
          <div className="rounded-[18px] bg-[var(--hig-card)] py-3 text-center shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <p className="text-[17px] font-medium leading-tight text-[var(--hig-danger)] [font-variant-numeric:tabular-nums]">
              {naira.format(totals.over)}
            </p>
            <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--hig-label-tertiary)]">
              Overdue
            </p>
          </div>
          <div className="rounded-[18px] bg-[var(--hig-card)] py-3 text-center shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
            <p className="text-[17px] font-medium leading-tight [font-variant-numeric:tabular-nums]">
              {countsQ.isPending ? "…" : households}
            </p>
            <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--hig-label-tertiary)]">
              Households
            </p>
          </div>
        </div>

        {/* ---------- Top clients filmstrip (kept per the user's request) ---------- */}
        <div className="hig-rise mt-5" style={{ animationDelay: "120ms" }}>
          <div className="flex items-baseline justify-between px-5">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--hig-label-secondary)]">
              Top clients
            </h2>
            <span className="text-[12px] text-[var(--hig-label-tertiary)]">by amount paid</span>
          </div>
          <div
            className="mt-2 flex gap-2.5 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{
              maskImage:
                "linear-gradient(90deg, transparent 0, #000 20px, #000 calc(100% - 20px), transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(90deg, transparent 0, #000 20px, #000 calc(100% - 20px), transparent 100%)",
            }}
          >
            {(topQ.data?.data ?? []).map((t, i) => (
              <div
                key={t.customerId ?? t.id}
                className="w-[150px] flex-shrink-0 rounded-[18px] bg-[var(--hig-card)] px-3.5 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
              >
                <p className="text-[9px] font-semibold tracking-[0.14em] text-[var(--hig-label-tertiary)]">
                  #<b className="text-[var(--hig-accent)]">{String(i + 1).padStart(2, "0")}</b>
                </p>
                <span
                  className="mt-2 flex h-9 w-9 items-center justify-center rounded-full border text-[12px] font-semibold"
                  style={{
                    backgroundColor: avatarTint(t.customerName ?? t.name ?? ""),
                    color: avatarColor(t.customerName ?? t.name ?? ""),
                    borderColor: avatarColor(t.customerName ?? t.name ?? "") + "4D",
                  }}
                >
                  {initials(t.customerName ?? t.name ?? "•")}
                </span>
                <p className="mt-2 truncate text-[12.5px] font-medium">
                  {t.customerName ?? t.name}
                </p>
                <p className="mt-0.5 text-[9.5px] text-[var(--hig-label-tertiary)]">
                  {t.jobCount} {t.jobCount === 1 ? "job" : "jobs"}
                </p>
                <p className="mt-2 text-[16px] font-medium tracking-[-0.01em] [font-variant-numeric:tabular-nums]">
                  {naira.format(t.totalPaid)}
                </p>
                <p className="text-[9px] font-semibold uppercase tracking-[0.05em] text-[var(--hig-label-tertiary)]">
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

        {/* ---------- error banner ---------- */}
        {anyError && (
          <div className="mx-5 mt-4 flex items-center justify-between rounded-[16px] bg-[var(--hig-danger-tint)] px-4 py-3">
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

        {/* ---------- results line ---------- */}
        {!anyError && (
          <div className="mt-5 flex items-baseline justify-between px-5 text-[12px] text-[var(--hig-label-tertiary)] [font-variant-numeric:tabular-nums]">
            {/* stat strip above already surfaces to-collect — no need to repeat it here */}
            <span>
              <b className="font-medium text-[var(--hig-label-secondary)]">
                {countsQ.data ? households : customers.length}
              </b>{" "}
              clients · A→Z
            </span>
          </div>
        )}

        {/* ---------- household cards ---------- */}
        {loading ? (
          <div className="mt-3 space-y-3 px-5">
            {[0, 1, 2].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : customers.length === 0 && !anyError ? (
          <div className="mt-3 rounded-[20px] bg-[var(--hig-card)] px-6 py-10 text-center">
            <p className="text-[15px] font-semibold">No clients yet.</p>
            <p className="mt-1.5 text-[13px] leading-5 text-[var(--hig-label-secondary)]">
              New clients land here, A→Z, the moment a job is created.
            </p>
            <button
              type="button"
              onClick={() => setNewJobOpen(true)}
              className="mt-4 rounded-[13px] bg-[var(--hig-accent)] px-5 py-3 text-[14px] font-semibold text-white transition-transform duration-200 active:scale-95"
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
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-[16px] bg-[var(--hig-card)] py-3.5 text-[15px] font-medium text-[var(--hig-label)] transition-transform duration-200 active:scale-[0.98] disabled:opacity-60"
              >
                {listQ.isFetchingNextPage ? (
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--hig-accent-soft)] border-t-[var(--hig-accent)]"
                    aria-hidden="true"
                  />
                ) : (
                  <>
                    Show more clients
                    <span className="text-[var(--hig-accent)]">▾</span>
                  </>
                )}
              </button>
            )}
            {!listQ.hasNextPage && customers.length > 0 && (
              <p className="mt-4 text-center text-[11.5px] text-[var(--hig-label-tertiary)]">
                You&apos;re all caught up — every client is here.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ---------- FAB + tab bar (anchored to the phone-width column) ---------- */}
      <TabBar
        active="customers"
        fab={
          <button
            type="button"
            aria-label="New client"
            title="New client"
            onClick={() => setNewJobOpen(true)}
            className="pointer-events-auto absolute bottom-[84px] right-5 z-10 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-[var(--hig-accent)] text-white shadow-[var(--hig-bar-shadow)] transition-transform duration-200 active:scale-90"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
              <path d="M12 5.5v13" />
              <path d="M5.5 12h13" />
            </svg>
          </button>
        }
      />

      {/* New job sheet — the same modal as jobs/dashboard (new-client flow) */}
      <NewJobModal open={newJobOpen} onClose={() => setNewJobOpen(false)} />
    </main>
  );
}