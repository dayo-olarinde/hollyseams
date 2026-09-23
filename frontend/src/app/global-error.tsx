"use client";

import { ErrorFallback } from "@/components/ui/error-fallback";

/**
 * The last-resort boundary — the one that catches a crash in the root layout itself.
 *
 * `app/error.tsx` renders *inside* the root layout, so a fault in that layout (the providers,
 * the theme bootstrapping) would unload this whole app and fall through to the browser's
 * default error page. `global-error` replaces the entire document instead, which is why it
 * must own `<html>` and `<body>` — and why it inlines the theme class itself: the normal
 * theme bootstrap script lives in the layout this file is replacing.
 *
 * Deliberately minimal: the providers are not re-mounted here (a crashed provider is the
 * suspect, not a fixture to reuse), and the copy names no internals.
 */
export default function GlobalErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  void error;
  return (
    <html lang="en" className="hig-light">
      <body>
        <ErrorFallback
          title="Hollyseams hit a snag."
          detail="The app could not start. Reloading usually fixes this — your data is safe on the server."
          reset={reset}
        />
      </body>
    </html>
  );
}
