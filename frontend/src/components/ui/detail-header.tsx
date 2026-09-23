"use client";

import { useRouter } from "next/navigation";
import ThemeToggle from "./theme-toggle";
import type { ReactNode } from "react";

/**
 * The header for a pushed page (a job, a client).
 *
 * Shared by the page, its `loading.tsx` shell and — by construction — anything else pushed onto
 * the app, so the title and the back button cannot drift between "loading" and "loaded". That
 * drift is the same failure the tab shells were built to avoid: a placeholder that does not match
 * what replaces it reads as two separate screens arriving, not one.
 *
 * `actions` (optional) replaces the theme toggle in the right slot for pages with their own
 * verb — the order file's Edit sits here. The toggle stays the default so existing callers are
 * untouched.
 *
 * Back behaviour is a judgement call: `router.back()` restores the scroll position and reuses the
 * cache entry of the list the user came from, which is what they expect. But a page opened from a
 * notification, a bookmark or a shared link has nothing to go back to, and `window.history.length`
 * is the only signal the browser gives — hence the fallback to the list.
 */
export function DetailHeader({
  title,
  fallbackHref,
  actions,
}: {
  title: string;
  fallbackHref: string;
  actions?: ReactNode;
}) {
  const router = useRouter();

  return (
    <header className="safe-top sticky top-0 z-30 border-b border-(--hig-separator) bg-(--hig-bar)/80 backdrop-blur-[20px] backdrop-saturate-150">
      <div className="mx-auto flex w-full sm:max-w-107.5 items-center justify-between px-4 pb-1.5">
        <button
          type="button"
          aria-label={`Back to ${fallbackHref.replace("/", "")}`}
          onClick={() =>
            window.history.length > 1 ? router.back() : router.push(fallbackHref)
          }
          className="flex h-11 w-11 items-center justify-center rounded-full text-[20px] text-(--hig-accent) transition-transform duration-200 active:scale-90"
        >
          ‹
        </button>
        <h1 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h1>
        {actions ?? <ThemeToggle />}
      </div>
    </header>
  );
}
