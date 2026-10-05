import type { ReactNode } from "react";
import type { TabKey } from "./tab-bar";
import ThemeToggle from "./theme-toggle";
import {
  DossierCardSkeleton,
  FilmstripCardSkeleton,
  JobCardSkeleton,
  OutstandingRowsSkeleton,
  SkeletonBar,
  StatementRowsSkeleton,
  StatementSummarySkeleton,
  StatCardSkeleton,
} from "./skeletons";

/**
 * The shell a tab shows before it can draw itself.
 *
 * Why this exists: every page in `src/app` is a client component, so a navigation cannot paint
 * until that route's JavaScript has arrived *and run*. The skeletons inside each page cannot
 * help during that window — they ship with the very JavaScript that is still loading. Measured
 * in dev, with the API answering in 5–60ms: ~300–500ms for a compiled tab and ~1.9s for a route
 * Turbopack had not compiled yet, with the old screen frozen the whole time.
 *
 * Two callers, covering two different waits:
 *
 *  - `TabBar` paints it the instant a tab is tapped, from JavaScript that is already on screen.
 *    That is the tap-to-pixels path, and it is the one that matters on a phone.
 *  - each `app/<tab>/loading.tsx` streams it on a cold load, before that route's JavaScript
 *    exists in the browser at all.
 *
 * Each tab gets its *own* body below rather than one generic stack of bars, and every shape comes
 * from `./skeletons` — the same components the pages render. A shell that draws a different card
 * than the page it stands in for is worse than no shell: it reads as two skeletons in a row.
 *
 * The root is a `div`, not a `main`: when the tap shell layers over a live page, that page keeps
 * the only `main` landmark on the screen.
 *
 * The headline each tab shows, and the line under it:
 *
 * Static copy belongs to the page, but the shell has to show the same words or the title visibly
 * snaps into place after the page lands — so the two must agree. The subtitle is here for the
 * same reason and one more: it is a whole line of height, and when the shell hands over to the
 * page in a single commit, a line the shell did not reserve shows up as the content jumping.
 *
 * The dashboard has no chrome of its own — its date and greeting live inside the hero card, which
 * is already drawn from bars below — so it gets an empty entry and the chrome block is skipped
 * entirely rather than reserving space the page does not use. Its greeting also depends on the
 * clock, so it stays bars.
 */
const TAB_CHROME: Record<TabKey, { title?: ReactNode; subtitle?: ReactNode }> = {
  overview: {},
  jobs: {
    title: (
      <>
        Jobs, <span className="text-(--hig-accent)">on the rack.</span>
      </>
    ),
  },
  customers: {
    title: (
      <>
        The family <span className="text-(--hig-accent)">album.</span>
      </>
    ),
    subtitle: "Every client, and the people you sew for.",
  },
  reports: {
    title: (
      <>
        The <span className="text-(--hig-accent)">statement.</span>
      </>
    ),
    subtitle: "Three ruled statements — collected, outstanding, best clients.",
  },
};

/**
 * The jobs tab: the status row (its labels are static, so it can be shown for real), then the
 * card list the page would render.
 */
function JobsBody() {
  return (
    <>
      <div className="mt-6 flex rounded-[14px] bg-(--hig-card) p-0.75 shadow-(--hig-card-shadow)">
        {["All", "Pending", "Completed", "Delivered"].map((label) => (
          <div
            key={label}
            className="flex min-w-0 flex-1 flex-col items-center gap-px px-1 py-2 text-(--hig-label-secondary)"
          >
            <span className="text-[12.5px] font-semibold">{label}</span>
            <span className="text-[10.5px] font-semibold">…</span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-baseline justify-between text-[12px] text-(--hig-label-secondary)">
        <SkeletonBar className="h-3 w-20" />
        <SkeletonBar className="h-3 w-24" />
      </div>

      <div className="mt-4 space-y-4">
        {[0, 1, 2, 3].map((i) => (
          <JobCardSkeleton key={i} />
        ))}
      </div>
    </>
  );
}

/** The customers tab: counters, filmstrip, then the client dossier list. */
function CustomersBody() {
  return (
    <>
      <div className="mt-5 grid grid-cols-3 gap-2.5">
        <StatCardSkeleton label="To collect" />
        <StatCardSkeleton label="Overdue" />
        <StatCardSkeleton label="Households" />
      </div>

      {/* The search field and status chips the live page now renders */}
      <div className="mt-4 h-10 rounded-xl bg-(--hig-separator) animate-pulse" />
      <div className="mt-2.5 flex gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-8 w-24 shrink-0 rounded-full bg-(--hig-separator) animate-pulse"
          />
        ))}
      </div>

      <div className="mt-4 flex items-baseline justify-between">
        <span className="text-[13px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-secondary)">
          Top clients
        </span>
        <span className="text-[12px] text-(--hig-label-tertiary)">
          by amount paid
        </span>
      </div>
      <div className="mt-2 flex gap-2.5 overflow-hidden pb-2">
        <FilmstripCardSkeleton />
        <FilmstripCardSkeleton />
      </div>

      {/* "7 clients · A→Z" — the count is the page's, so the shell reserves the line only. */}
      <div className="mt-5 flex items-baseline justify-between text-[12px] text-(--hig-label-tertiary)">
        <SkeletonBar className="h-3 w-24" />
      </div>

      <div className="mt-3 space-y-3">
        {[0, 1, 2].map((i) => (
          <DossierCardSkeleton key={i} />
        ))}
      </div>
    </>
  );
}

/** The reports tab: the studio-balance card, then the three statements. */
function ReportsBody() {
  const section = (title: string, meta: string, children: ReactNode) => (
    <>
      <div className="mb-2.5 flex items-baseline justify-between">
        <span className="text-[13px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-secondary)">
          {title}
        </span>
        <span className="text-[12px] text-(--hig-label-tertiary)">{meta}</span>
      </div>
      {children}
    </>
  );

  return (
    <>
      <div className="mt-5 rounded-3xl bg-(--hig-card) px-5 pb-3 pt-4 shadow-(--hig-card-shadow)">
        <StatementSummarySkeleton />
      </div>

      <div className="mt-6">
        {section(
          "Statement · collected",
          "monthly revenue",
          <div className="overflow-hidden rounded-[20px] bg-(--hig-card) shadow-(--hig-card-shadow)">
            <div className="flex gap-2.5 px-4 pb-2 pt-3.5 text-[9.5px] font-semibold uppercase tracking-[0.07em] text-(--hig-label-tertiary)">
              <span className="flex-1">Month</span>
              <span className="w-21.5 shrink-0 text-right">Revenue</span>
              <span className="w-23 shrink-0 text-right">Running</span>
            </div>
            <div className="border-t border-dashed border-(--hig-separator)">
              <StatementRowsSkeleton />
            </div>
            {/* The collected statement's running total, a row the other two statements do not have. */}
            <div className="flex items-baseline justify-between border-t border-dashed border-(--hig-separator) px-4 py-3.5">
              <SkeletonBar className="h-2.5 w-28" />
              <SkeletonBar className="h-5 w-20" />
            </div>
          </div>,
        )}
      </div>

      <div className="mt-6">
        {section(
          "Statement · outstanding",
          "biggest balances first",
          <div className="overflow-hidden rounded-[20px] bg-(--hig-card) shadow-(--hig-card-shadow)">
            <div className="border-t border-dashed border-(--hig-separator)">
              <OutstandingRowsSkeleton />
            </div>
          </div>,
        )}
      </div>

      <div className="mt-6">
        {section(
          "Statement · best clients",
          "by amount paid",
          <div className="overflow-hidden rounded-[20px] bg-(--hig-card) shadow-(--hig-card-shadow)">
            <div className="flex gap-2.5 px-4 pb-2 pt-3.5 text-[9.5px] font-semibold uppercase tracking-[0.07em] text-(--hig-label-tertiary)">
              <span className="flex-1">Client</span>
              <span className="w-21.5 shrink-0 text-right">Jobs</span>
              <span className="w-23 shrink-0 text-right">Paid</span>
            </div>
            <div className="border-t border-dashed border-(--hig-separator)">
              <StatementRowsSkeleton subLabel="w-14" />
            </div>
          </div>,
        )}
      </div>
    </>
  );
}

/**
 * The dashboard: the hero card (its greeting and month are computed from the clock, so they stay
 * bars), the revenue card, the two counters and the two grouped lists.
 */
function DashboardBody() {
  return (
    <>
      <div className="mb-8 pt-3">
        <div className="mt-3 rounded-3xl bg-(--hig-accent-tint) px-5 pb-3.5 pt-4">
          <SkeletonBar className="h-3 w-44" />
          {/* The greeting wraps to two lines at phone widths ("Afternoon, Wunmi — September is
              flying."), so the shell reserves two rather than letting the hero grow at the
              handoff and push everything below it down. */}
          <SkeletonBar className="mt-2.5 h-9 w-full" />
          <SkeletonBar className="mt-1.5 h-9 w-2/3" />
          <SkeletonBar className="mt-2 h-4 w-52" />
          <div
            className="mt-3.5 border-t border-dashed border-(--hig-accent-line)"
            aria-hidden="true"
          />
        </div>
      </div>

      <section className="mb-3 rounded-[20px] bg-(--hig-card) px-4 pb-4 pt-4 shadow-(--hig-card-shadow)">
        <div className="flex items-center justify-between">
          <span className="text-[17px] font-medium leading-5.5">Revenue</span>
        </div>
        <div className="py-2">
          <SkeletonBar className="h-9 w-36" />
          <SkeletonBar className="mt-2 h-3 w-32" />
          <SkeletonBar className="mt-3 h-45.75 w-full" />
        </div>
      </section>

      <section className="mb-3 grid grid-cols-2 gap-3">
        {["To collect", "On the bench"].map((label) => (
          <div key={label} className="rounded-[20px] bg-(--hig-card) px-4 py-3 shadow-(--hig-card-shadow)">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-medium text-(--hig-label-secondary)">
                {label}
              </span>
            </div>
            <SkeletonBar className="h-7 w-20" />
            <SkeletonBar className="mt-2 h-3 w-24" />
          </div>
        ))}
      </section>

      <div className="mt-8 mb-2">
        <span className="text-[13px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-secondary)">
          Latest Work
        </span>
      </div>
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <SkeletonBar key={i} className="h-18 w-full" />
        ))}
      </div>

      <div className="mt-8 mb-2">
        <span className="text-[13px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-secondary)">
          Balances to Collect
        </span>
      </div>
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <SkeletonBar key={i} className="h-19 w-full" />
        ))}
      </div>
    </>
  );
}

const TAB_BODIES: Record<TabKey, () => ReactNode> = {
  overview: DashboardBody,
  jobs: JobsBody,
  customers: CustomersBody,
  reports: ReportsBody,
};

export default function PageSkeleton({
  active,
  tabBar,
}: {
  active: TabKey;
  /** The real bar, so a cold load still shows one. Omitted when layering over a live page. */
  tabBar?: ReactNode;
}) {
  const chrome = TAB_CHROME[active];
  const Body = TAB_BODIES[active];

  return (
    <div
      // Not decoration: a screen reader is told the view is still loading, and it is what the
      // navigation test asserts on to prove the shell painted before the page could.
      aria-busy="true"
      className="hig content-safe min-h-dvh bg-transparent text-(--hig-label) transition-colors duration-300"
    >
      <div className="relative mx-auto w-full sm:max-w-107.5">
        {/* Same header geometry as the pages it stands in for, insets included. */}
        <header className="hig-rise safe-top sticky top-0 z-20 flex items-center justify-between bg-(--hig-bar)/80 px-5 pb-2.5 backdrop-blur-[20px] backdrop-saturate-150">
          <p className="text-[20px] font-medium tracking-[-0.02em]">
            Holly<span className="text-(--hig-accent)">Seams</span>
          </p>
          {/* The real toggle, not a placeholder: a circle that pops into a button at the handoff
              is the one piece of chrome the shell could not fake convincingly. */}
          <ThemeToggle />
        </header>

        {chrome.title && (
          <div className="hig-rise px-5 pt-3" style={{ animationDelay: "40ms" }}>
            <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-secondary)">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
            <h1 className="mt-1 text-[34px] font-medium leading-10.25 tracking-[-0.02em]">
              {chrome.title}
            </h1>
            {chrome.subtitle && (
              <p className="mt-1 text-[13px] text-(--hig-label-secondary)">
                {chrome.subtitle}
              </p>
            )}
          </div>
        )}

        <div className="hig-rise px-5" style={{ animationDelay: "80ms" }}>
          <Body />
        </div>
      </div>

      {tabBar}
    </div>
  );
}
