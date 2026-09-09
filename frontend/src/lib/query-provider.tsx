"use client";

/**
 * QueryClientProvider is kept at the authenticated app boundary so every
 * dashboard tab reads the same cache instead of refetching identical records.
 * Retry is limited because this is a small studio app and repeated failed
 * requests make an offline state feel like an infinite loading loop.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
      mutations: { retry: 0 },
    },
  }));

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
