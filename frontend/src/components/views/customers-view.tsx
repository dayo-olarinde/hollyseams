import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import NewJobModal from "@/components/jobs/new-job-modal";
import { ErrorBanner } from "@/components/ui/error-banner";
import TabBar from "@/components/ui/tab-bar";
// The card shape, shared with the tap shell so a tab never shows two different skeletons.
import {
  DossierCardSkeleton,
  FilmstripCardSkeleton,
} from "@/components/ui/skeletons";
import ThemeToggle from "@/components/ui/theme-toggle";
import {
  useCustomersList,
  usePrefetchCustomerFile,
} from "@/hooks/use-customers";
import { useOutstandingPayments, useTopCustomers } from "@/hooks/use-reports";
import { avatarColor, avatarTint } from "@/lib/avatar-colors";
import { hasWhatsApp, waMe } from "@/lib/contact";
import { formatDay, initials, isOverdue, naira, todayLine } from "@/lib/format";
import { scheduleIdle } from "@/lib/schedule-idle";
import {
  topCustomersOptions,
  outstandingPaymentsOptions,
} from "@/hooks/use-reports";
import type { Customer } from "@/types/customer";
import type { OutstandingPayment } from "@/types/report";

/**
 * How deep the lifetime-paid leaderboard goes. The endpoint ranks *payers* (its SQL joins on
 * payments) and caps at 100, so 100 covers every client who has ever paid at Hollyseams scale —
 * the filmstrip shows the first five, the dossiers use the rest.
 */
const LEADERBOARD_LIMIT = 100;

/* ------------------------------------------------------------------ */
/* The dossier — data                                                   */
/* ------------------------------------------------------------------ */

/**
 * What the app can honestly say about one client, assembled from two reports the page already
 * fetched. Stitch's dossier cards claim VIP tiers, addresses and fabric preferences; our schema
 * carries a name and a phone — so the premium surface is built from what is *true*: open work
 * from the outstanding statement, money history from the leaderboard, nothing invented.
 */
interface Dossier {
  customer: Customer;
  /** Sum of balances across the client's open jobs — zero when they're square. */
  debt: number;
  /** The one job to chase: overdue first, then nearest deadline, then biggest balance. */
  pressing: OutstandingPayment | null;
  /** How many of the client's jobs are still open. */
  openCount: number;
  /**
   * Money actually collected from this client across their lifetime. The leaderboard covers
   * every client who has ever paid (fetched at the cap, 100), so `null` means the reports
   * haven't spoken yet or the client truly has no payments — the card keeps quiet either way.
   */
  lifetime: number | null;
  lifetimeJobs: number | null;
  /** False while the reports that feed the well and the strip are still loading. */
  reportsReady: boolean;
}

/* ------------------------------------------------------------------ */
/* The dossier — card                                                   */
/* ------------------------------------------------------------------ */

function DossierCard({ d }: { d: Dossier }) {
  const prefetchFile = usePrefetchCustomerFile();
  const c = d.customer;

  /** The due line inside the work well — one phrase per state, same voices as the job cards. */
  const due = (() => {
    if (!d.pressing) return null;
    if (isOverdue(d.pressing))
      return {
        text: `Past due — was ${formatDay(d.pressing.dueDate)}`,
        tone: "text-(--hig-danger)",
      };
    if (d.pressing.dueDate)
      return { text: `Due ${formatDay(d.pressing.dueDate)}`, tone: "text-(--hig-warning)" };
    return { text: "In the workshop — no deadline set", tone: "text-(--hig-label-secondary)" };
  })();

  return (
    <div className="stitch-card relative isolate rounded-[20px] px-4 py-4 transition-transform duration-200 active:scale-[0.98]">
      {/* Stretched link: a tap anywhere opens the dossier, while the contact buttons ride
          above it (z-20) — the same pattern as the job card's status switcher. */}
      <Link
        href={`/customers/${c.id}`}
        onPointerDown={() => prefetchFile(c.id)}
        aria-label={`Open ${c.name}'s dossier`}
        className="absolute inset-0 z-10 rounded-[20px]"
      />

      {/* Identity row: avatar, name, phone, and the quick-contact pair */}
      <div className="flex items-start gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-[14px] font-semibold"
          style={{
            backgroundColor: avatarTint(c.name),
            color: avatarColor(c.name),
            borderColor: avatarColor(c.name) + "4D",
          }}
        >
          {initials(c.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-medium tracking-[-0.01em]">{c.name}</p>
          <p className="mt-0.5 truncate text-[12.5px] text-(--hig-label-secondary)">
            {c.phoneNumber ?? "no phone on file"}
          </p>
        </div>
        {c.phoneNumber && <ContactButtons phone={c.phoneNumber} name={c.name} />}
      </div>

      {/* The work well — Stitch's active-piece box, on our one honest open job */}
      <div className="mt-3 rounded-xl bg-(--hig-fill) px-3 py-2.5">
        {d.pressing ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[12.5px] font-medium">
                {d.pressing.description || "Commission in the workshop"}
              </p>
              {d.openCount > 1 && (
                <span className="shrink-0 rounded-full bg-(--hig-card) px-2 py-0.5 text-[10px] font-semibold text-(--hig-label-secondary)">
                  {d.openCount} open
                </span>
              )}
            </div>
            {due && <p className={`mt-0.5 text-[11.5px] ${due.tone}`}>{due.text}</p>}
          </>
        ) : d.reportsReady ? (
          d.lifetime !== null ? (
            <p className="text-[12px] text-(--hig-label-secondary)">
              No open work — nothing to chase.
            </p>
          ) : (
            <p className="text-[12px] text-(--hig-label-tertiary)">
              No jobs yet — the first commission starts the file.
            </p>
          )
        ) : (
          <p className="text-[12px] text-(--hig-label-tertiary)">Reading the books…</p>
        )}
      </div>

      {/* Ledger strip: outstanding while money moves; once they're square, their lifetime
          figures — which exist only for clients the leaderboard has seen. Nothing renders
          until the reports have spoken, so a loading card never flashes a wrong story. */}
      <div className="mt-3 flex items-baseline justify-between gap-2">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-(--hig-label-tertiary)">
          {d.debt > 0 ? "Outstanding" : d.lifetime !== null ? "Lifetime paid" : ""}
        </span>
        {d.debt > 0 ? (
          <span className="text-[14px] font-semibold text-(--hig-warning) [font-variant-numeric:tabular-nums]">
            {naira(d.debt)}
          </span>
        ) : d.lifetime !== null ? (
          <span className="text-[13px] font-medium text-(--hig-label-secondary) [font-variant-numeric:tabular-nums]">
            {naira(d.lifetime)} · {d.lifetimeJobs} {d.lifetimeJobs === 1 ? "job" : "jobs"}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Call and WhatsApp circles. `tel:` takes the raw number; WhatsApp gets the 234 form. */
function ContactButtons({ phone, name }: { phone: string; name: string }) {
  const circle =
    "flex h-8 w-8 items-center justify-center rounded-full bg-(--hig-fill) text-(--hig-label-secondary) transition-transform duration-150 active:scale-90";
  return (
    <div className="relative z-20 flex shrink-0 items-center gap-1.5">
      <a href={`tel:${phone}`} aria-label={`Call ${name}`} className={circle}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
      </a>
      {hasWhatsApp(phone) && (
        <a
          href={waMe(phone)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Message ${name} on WhatsApp`}
          className={circle}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        </a>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Filters                                                              */
/* ------------------------------------------------------------------ */

/**
 * Three buckets, each one a fact: everything, money owed, work in flight. Stitch's "VIP Circle"
 * and "Measurement Due" pills describe data we don't have — a filter that silently shows the
 * wrong list is worse than no filter, so they stay out.
 */
type ClientFilter = "all" | "owing" | "open";

const FILTERS: Array<{ key: ClientFilter; label: string }> = [
  { key: "all", label: "All clients" },
  { key: "owing", label: "Owes money" },
  { key: "open", label: "Open orders" },
];

/* ------------------------------------------------------------------ */
/* The view                                                             */
/* ------------------------------------------------------------------ */

export function CustomersView() {
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ClientFilter>("all");

  const listQ = useCustomersList();
  const outstandingQ = useOutstandingPayments();
  const topQ = useTopCustomers(LEADERBOARD_LIMIT);

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

  /** Lifetime figures keyed by client — the leaderboard is the only source of "paid to date". */
  const topById = useMemo(
    () => new Map((topQ.data ?? []).map((t) => [t.id, t])),
    [topQ.data],
  );

  /**
   * Warm the reports the tab below is about to ask for, once the phone is otherwise idle.
   *
   * Same pattern as the jobs tab's filter prefetch: skipped by React Query when fresh, so it
   * costs nothing once warm — and the difference is the tab painting its dossiers from cache
   * instead of from the network.
   */
  const queryClient = useQueryClient();
  useEffect(
    () =>
      scheduleIdle(() => {
        void queryClient.prefetchQuery(outstandingPaymentsOptions());
        void queryClient.prefetchQuery(topCustomersOptions(LEADERBOARD_LIMIT));
      }),
    [queryClient],
  );

  /**
   * Every dossier, assembled once per render of the underlying data: for each client, their open
   * jobs come out of the outstanding statement (which is studio-wide, so the buckets and counts
   * below are true even past the list's current page), sorted to find the one job to chase.
   */
  const dossiers = useMemo<Dossier[]>(() => {
    return customers.map((c) => {
      const opens = (outstandingQ.data ?? []).filter((o) => o.customer.id === c.id);
      const pressing =
        [...opens].sort((a, b) => {
          const oa = isOverdue(a) ? 0 : 1;
          const ob = isOverdue(b) ? 0 : 1;
          if (oa !== ob) return oa - ob;
          const da = a.dueDate ? Date.parse(a.dueDate) : Infinity;
          const db = b.dueDate ? Date.parse(b.dueDate) : Infinity;
          if (da !== db) return da - db;
          return b.balanceDue - a.balanceDue;
        })[0] ?? null;
      const t = topById.get(c.id);
      return {
        customer: c,
        debt: opens.reduce((s, o) => s + o.balanceDue, 0),
        pressing,
        openCount: opens.length,
        lifetime: t ? t.totalPaid : null,
        lifetimeJobs: t ? t.jobCount : null,
        reportsReady: !outstandingQ.isPending && !topQ.isPending,
      };
    });
  }, [customers, outstandingQ.data, topById]);

  /** Studio-wide bucket counts — from the full statement, so they hold past the loaded page. */
  const buckets = useMemo(() => {
    const rows = (outstandingQ.data ?? []).filter((o) => o.balanceDue > 0);
    return {
      debtors: new Set(rows.map((o) => o.customer.id)).size,
      openJobs: rows.length,
    };
  }, [outstandingQ.data]);

  /** Search matches name, raw phone, or digits — "0801" and "801" find the same person. */
  const q = query.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, "");
  const matches = (d: Dossier): boolean => {
    if (!q) return true;
    const c = d.customer;
    const phone = c.phoneNumber ?? "";
    return (
      c.name.toLowerCase().includes(q) ||
      phone.toLowerCase().includes(q) ||
      (qDigits.length > 0 && phone.replace(/\D/g, "").includes(qDigits))
    );
  };

  const visible = dossiers.filter((d) => {
    const passes =
      filter === "all" || (filter === "owing" ? d.debt > 0 : d.openCount > 0);
    return passes && matches(d);
  });
  const narrowed = q.length > 0 || filter !== "all";

  const loading = listQ.isPending;
  const failure = listQ.error ?? outstandingQ.error ?? topQ.error;
  const retryAll = () => {
    void listQ.refetch();
    void outstandingQ.refetch();
    void topQ.refetch();
  };

  return (
    <main className="hig content-safe min-h-dvh bg-transparent text-(--hig-label) transition-colors duration-300">
      <div className="relative mx-auto w-full sm:max-w-107.5">
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

        {/* The three counters: real money from the statement, real headcount from the list meta */}
        <div className="hig-rise mt-5 grid grid-cols-3 gap-2.5 px-5" style={{ animationDelay: "80ms" }}>
          <div className="rounded-[18px] bg-(--hig-card) py-3 text-center shadow-(--hig-card-shadow)">
            <p className="text-[17px] font-medium leading-tight text-(--hig-warning) [font-variant-numeric:tabular-nums]">
              {naira(totals.due)}
            </p>
            <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-tertiary)">
              To collect
            </p>
          </div>
          <div className="rounded-[18px] bg-(--hig-card) py-3 text-center shadow-(--hig-card-shadow)">
            <p className="text-[17px] font-medium leading-tight text-(--hig-danger) [font-variant-numeric:tabular-nums]">
              {naira(totals.over)}
            </p>
            <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-tertiary)">
              Overdue
            </p>
          </div>
          <div className="rounded-[18px] bg-(--hig-card) py-3 text-center shadow-(--hig-card-shadow)">
            <p className="text-[17px] font-medium leading-tight [font-variant-numeric:tabular-nums]">
              {listQ.isPending ? "…" : households}
            </p>
            <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-tertiary)">
              {households === 1 ? "Household" : "Households"}
            </p>
          </div>
        </div>

        {/* Search — client-side over the loaded list; the number matcher forgives the leading 0 */}
        <div className="hig-rise mt-4 px-5" style={{ animationDelay: "100ms" }}>
          <div className="relative">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--hig-label-tertiary)"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or phone…"
              aria-label="Search clients by name or phone"
              className="input-field w-full rounded-xl py-2.5 pl-9.5 pr-9 text-[14px] text-(--hig-label) outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-(--hig-separator) text-[12px] text-(--hig-label-secondary)"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Status chips — counts come from the statement, not the page of rows on screen */}
        <div
          className="hig-rise mt-2.5 flex gap-2 overflow-x-auto px-5 pb-1 scrollbar-none [&::-webkit-scrollbar]:hidden"
          style={{ animationDelay: "110ms" }}
        >
          {FILTERS.map((f) => {
            const ready = !outstandingQ.isPending;
            const count =
              f.key === "all" ? households : f.key === "owing" ? buckets.debtors : buckets.openJobs;
            const showCount = f.key === "all" || ready;
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={active}
                className={
                  active
                    ? "shrink-0 rounded-full bg-(--hig-accent) px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-[0_1px_3px_rgba(0,0,0,0.10)] transition-transform duration-150 active:scale-95"
                    : "shrink-0 rounded-full border border-(--hig-separator) bg-(--hig-card) px-3.5 py-1.5 text-[12px] font-medium text-(--hig-label-secondary) transition-transform duration-150 active:scale-95"
                }
              >
                {f.label}
                {showCount && count > 0 ? ` (${count})` : ""}
              </button>
            );
          })}
        </div>

        {/* Top clients filmstrip — the leaderboard, kept */}
        <div className="hig-rise mt-4" style={{ animationDelay: "130ms" }}>
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
            {(topQ.data ?? []).slice(0, 5).map((t, i) => (
              <div
                key={t.id}
                className="w-37.5 shrink-0 rounded-[18px] bg-(--hig-card) px-3.5 py-3 shadow-(--hig-card-shadow)"
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
              {listQ.isPending ? (
                "Loading the client list…"
              ) : narrowed ? (
                <>
                  <b className="font-medium text-(--hig-label-secondary)">{visible.length}</b>{" "}
                  shown
                </>
              ) : (
                <>
                  <b className="font-medium text-(--hig-label-secondary)">{households}</b>{" "}
                  {households === 1 ? "client" : "clients"} · A→Z
                </>
              )}
            </span>
          </div>
        )}

        {/* The dossier list */}
        {loading ? (
          <div className="mt-3 space-y-3 px-5">
            {[0, 1, 2].map((i) => (
              <DossierCardSkeleton key={i} />
            ))}
          </div>
        ) : !failure && narrowed && visible.length === 0 ? (
          <div className="stitch-card mx-5 mt-3 rounded-[20px] px-6 py-10 text-center">
            <p className="text-[15px] font-semibold">Nothing matches.</p>
            <p className="mt-1.5 text-[13px] leading-5 text-(--hig-label-secondary)">
              {q
                ? `No client's name or number matches “${query.trim()}”.`
                : "No client sits in this bucket right now."}
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setFilter("all");
              }}
              className="mt-4 rounded-[13px] bg-(--hig-accent) px-5 py-3 text-[14px] font-semibold text-white transition-transform duration-200 active:scale-95"
            >
              Clear filters
            </button>
          </div>
        ) : customers.length === 0 && !failure ? (
          <div className="stitch-card mx-5 mt-3 rounded-[20px] px-6 py-10 text-center">
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
            {visible.map((d) => (
              <DossierCard key={d.customer.id} d={d} />
            ))}

            {!narrowed && listQ.hasNextPage && (
              <button
                type="button"
                onClick={() => listQ.fetchNextPage()}
                disabled={listQ.isFetchingNextPage}
                className="stitch-card mt-1 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-medium text-(--hig-label) transition-transform duration-200 active:scale-[0.98] disabled:opacity-60"
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
            {!narrowed && !listQ.hasNextPage && customers.length > 0 && (
              <p className="mt-4 text-center text-[11.5px] text-(--hig-label-tertiary)">
                You&apos;re all caught up — every client is here.
              </p>
            )}
          </div>
        )}
      </div>

      {/* The floating new-client action and the tab shell */}
      <TabBar
        active="customers"
        fab={
          <button
            type="button"
            aria-label="New client"
            title="New client"
            onClick={() => setNewJobOpen(true)}
            className="fab-safe pointer-events-auto absolute right-5 z-10 flex h-16 w-16 cursor-pointer items-center justify-center rounded-full bg-(--hig-accent) text-white shadow-(--hig-bar-shadow) transition-transform duration-200 active:scale-90"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
              <path d="M12 5.5v13" />
              <path d="M5.5 12h13" />
            </svg>
          </button>
        }
      />

      {/* The new-job modal doubles as the new-client flow: its first step creates the client */}
      <NewJobModal open={newJobOpen} onClose={() => setNewJobOpen(false)} />
    </main>
  );
}
