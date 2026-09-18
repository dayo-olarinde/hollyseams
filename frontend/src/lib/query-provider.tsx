"use client";

import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ApiError } from "@/lib/api/transport";
import { keys } from "@/lib/query/keys";

/**
 * The two numbers that decide whether the app feels instant.
 *
 * `staleTime` — how long cached data is treated as good enough to draw without asking again.
 *   While data is fresh, a remount paints from cache with **no** request and no skeleton. Once it
 *   is stale, the same data still paints immediately but a background refetch runs behind it, so
 *   the user never watches a loading state for something they already had.
 *
 * `gcTime` — how long data survives with no screen using it. React Query's default is 5 minutes,
 *   and the original app hit exactly that wall: switch tabs, come back ten minutes later, and the
 *   tab was empty again because the cache had thrown the data away. Thirty minutes covers a
 *   working session on a phone, which is the longest gap a tailor is realistically staring at the
 *   same app.
 *
 * These are *defaults*, not policy. Anything whose freshness actually matters — money, for
 * instance — overrides `staleTime` down at its own hook, because that is where the reader can see
 * the reason.
 */
const DEFAULT_STALE_TIME_MS = 30_000;
const DEFAULT_GC_TIME_MS = 30 * 60_000;

/**
 * Retrying a request that cannot succeed is just a slower failure.
 *
 * A 400/401/403/404/409 is the server's final answer: the request will be identical next time, so
 * the UI should show the error now while the user is still looking at it. A dropped connection or
 * a 5xx is worth another try — phones lose signal in lifts, and a backend restarting should not
 * surface as "couldn't reach the studio" when one retry quietly fixes it.
 */
const shouldRetry = (failureCount: number, error: unknown): boolean => {
  if (error instanceof ApiError) {
    const finalAnswer =
      !error.isNetworkError && error.statusCode < 500 && error.statusCode !== 429;
    if (finalAnswer) return false;
  }
  return failureCount < 2;
};

function createQueryClient(): QueryClient {
  /**
   * An expired session must not look like a broken one.
   *
   * Sessions live server-side with a TTL, so they *do* expire mid-use — the tailor leaves the app
   * open overnight and the cookie is dead by morning. The old UI reported that as "Couldn't reach
   * the studio. Check your connection." with a Retry button that would 401 forever: the wrong
   * diagnosis and no way out. A 401 is not a network problem, and there is nothing to retry — the
   * fix is to send the user to the keypad, which `SessionWatcher` does as soon as the session
   * cache flips to "signed out".
   *
   * This is the single place that knows that rule, so no screen has to remember it.
   */
  const handleError = (error: unknown) => {
    if (error instanceof ApiError && error.statusCode === 401) {
      client.setQueryData(keys.session, null);
    }
  };

  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: handleError }),
    mutationCache: new MutationCache({ onError: handleError }),
    defaultOptions: {
      queries: {
        staleTime: DEFAULT_STALE_TIME_MS,
        gcTime: DEFAULT_GC_TIME_MS,
        retry: shouldRetry,
        // Background refetch on focus would fight the tailor's own edits while they are mid-task.
        refetchOnWindowFocus: false,
        // `true` by default, but it is the one that matters on a phone: mobile networks drop and
        // come back constantly, and React Query recovering on its own is invisible work.
        refetchOnReconnect: true,
      },
      mutations: {
        // A write is not idempotent from the user's point of view — never repeat it silently.
        retry: 0,
      },
    },
  });

  return client;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  // Created once per browser session, not per render: a new client would mean an empty cache and
  // every screen re-fetching.
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
