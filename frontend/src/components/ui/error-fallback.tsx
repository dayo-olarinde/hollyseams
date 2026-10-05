"use client";

import { useEffect, type ReactNode } from "react";

/**
 * The crash screen, in the app's own visual language.
 *
 * Shared by the route boundary (`app/error.tsx`), the root-layout boundary
 * (`app/global-error.tsx`) and the 404 page, so an unexpected failure reads as the same app
 * that worked a second ago — same danger tint, same Retry affordance the data screens use —
 * rather than a framework page.
 *
 * The detail line is the caller's honesty decision, not a prop-hole: a *data* error can name
 * the server's message because the server chose that message for humans; a *render crash* has
 * no such guarantee, so its default copy never repeats the exception text — stack traces and
 * internal class names are exactly what must not reach the screen (the console already has
 * them in dev).
 */
export function ErrorFallback({
  title,
  detail,
  reset,
  showRetry = true,
  action,
}: {
  title: string;
  detail: string;
  /** App Router hands `reset()` from `error.tsx`; absent on the 404 page, which has nothing to retry. */
  reset?: () => void;
  showRetry?: boolean;
  /** A navigation escape hatch (the 404's "go home") when retrying is meaningless. */
  action?: ReactNode;
}) {
  // The boundary swallows the error that unmounted the tree, so the surrounding layout's
  // scroll-lock (from an open sheet, say) can outlive it. Restore on entry, not just on exit.
  useEffect(() => {
    document.body.style.overflow = "";
  }, []);

  return (
    <main className="hig content-safe min-h-dvh bg-transparent text-(--hig-label)">
      <div className="mx-auto w-full sm:max-w-107.5 px-4">
        <div className="mt-24 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-(--hig-danger-tint) text-(--hig-danger)">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              className="h-6 w-6"
              aria-hidden="true"
            >
              <path d="M12 8.5v5" />
              <path d="M12 17.2v.1" />
              <path d="M10.3 4.2 2.9 17a1.9 1.9 0 0 0 1.65 2.85h14.9A1.9 1.9 0 0 0 21.1 17L13.7 4.2a1.9 1.9 0 0 0-3.4 0Z" />
            </svg>
          </div>
          <p className="mt-4 text-[16px] font-medium">{title}</p>
          <p className="mx-auto mt-1 max-w-[280px] text-[13px] leading-5 text-(--hig-label-secondary)">
            {detail}
          </p>
          {showRetry && reset && (
            <button
              type="button"
              onClick={reset}
              className="mt-5 rounded-[13px] bg-(--hig-accent) px-6 py-3 text-[14px] font-semibold text-white transition-transform duration-200 active:scale-95"
            >
              Try again
            </button>
          )}
          {action && <div className="mt-5">{action}</div>}
        </div>
      </div>
    </main>
  );
}
