"use client";

import { ErrorFallback } from "@/components/ui/error-fallback";
import { ApiError } from "@/lib/api/transport";

/**
 * The route-level crash boundary.
 *
 * Data-fetching failures never reach this file — React Query catches them and every screen
 * renders its own inline error card. What *does* land here is a render crash: a component that
 * threw while drawing (bad shape from a schema change, a typo shipped to prod, a browser quirk).
 * The distinction decides the copy: an `ApiError` carries a human sentence from the backend and
 * may be shown; anything else is an unknown programming fault whose text could name internals,
 * so the fallback shows a plain recovery line instead. `reset()` remounts the route — the same
 * try-again contract as the inline cards.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const message =
    error instanceof ApiError && !error.isNetworkError
      ? error.message
      : "Something broke while drawing this screen — not your fault, and nothing was lost.";

  return (
    <ErrorFallback
      title="This screen hit a snag."
      detail={message}
      reset={reset}
    />
  );
}
