import Link from "next/link";
import { ErrorFallback } from "@/components/ui/error-fallback";

/**
 * The unknown-address page, in the app's language rather than Next's default.
 *
 * No retry: there is nothing to re-fetch — the fix is navigation, so the action points home.
 */
export default function NotFound() {
  return (
    <ErrorFallback
      title="Nothing lives here."
      detail="That page doesn't exist — it may have been a mistyped link. Everything else is where you left it."
      showRetry={false}
      action={
        <Link
          href="/dashboard"
          className="inline-block rounded-[13px] bg-(--hig-accent) px-6 py-3 text-[14px] font-semibold text-white transition-transform duration-200 active:scale-95"
        >
          Back to the studio
        </Link>
      }
    />
  );
}
