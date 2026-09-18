"use client";

import { ApiError } from "@/lib/api/transport";

/**
 * The one error row, shared by every screen.
 *
 * Its markup was already identical in four pages, but the *message* was the real problem: every
 * failure — a dropped connection, a 500, a 401 from an expired session — was reported as
 * "Couldn't reach the studio. Check your connection." A tailor on perfect wifi being told to check
 * their connection has been given the wrong instruction, and the one thing they will do about it
 * (toggle wifi) cannot possibly help.
 *
 * So the two cases the user can actually act on are separated:
 *   - **Offline** (no response at all): check the connection. Retry once the signal returns.
 *   - **Server** (a response, but a failure): nothing to do but try again. Saying "check your
 *     connection" here is a lie that costs the user a minute of debugging their phone.
 *
 * A 401 never reaches this component: the client writes it to the session cache instead, and
 * `SessionWatcher` sends the user to the keypad. Retrying a dead session is not a real option.
 */
export function ErrorBanner({
  error,
  offlineMessage,
  serverMessage = "Something went wrong at the studio. Try again.",
  onRetry,
  className = "",
}: {
  error: unknown;
  /** Page-specific phrasing for the offline case, e.g. "Couldn't reach the books." */
  offlineMessage: string;
  serverMessage?: string;
  onRetry: () => void;
  className?: string;
}) {
  const offline = error instanceof ApiError && error.isNetworkError;

  return (
    <div
      role="alert"
      className={`flex items-center justify-between rounded-2xl bg-(--hig-danger-tint) px-4 py-3 ${className}`}
    >
      <p className="text-[15px] text-(--hig-danger)">
        {offline ? offlineMessage : serverMessage}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 pl-3 text-[15px] font-semibold text-(--hig-accent)"
      >
        Retry
      </button>
    </div>
  );
}
