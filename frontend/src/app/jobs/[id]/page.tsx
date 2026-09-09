"use client";

/**
 * Job detail — "The Inspection Table" (Concept 3, wired to the live API).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SCREEN ANATOMY (top to bottom)
 * ─────────────────────────────────────────────────────────────────────────
 *   • Chrome     — back, screen title, theme toggle (sticky).
 *   • Header     — kicker + garment title, then the subject row (avatar,
 *                  name, phone, call) and a placed/due meta strip.
 *                  There is deliberately NO status pill here: the rail
 *                  below owns the status voice. (Message was dropped —
 *                  call only.)
 *   • Comparison — the style reference and the finished piece sit side by
 *                  side (the hook of Concept 3). Until the finished shots
 *                  land, that slot is a dashed "stitched" frame with a
 *                  waiting note so the layout never shifts.
 *   • The rail   — the job's life as milestones: placed → on the bench →
 *                  ready → delivered, all derived from the same fields the
 *                  list uses (createdAt, status, deliveredAt).
 *   • The tape   — measurements as the 2-column stitched grid from
 *                  Concept 1 (the user's explicit choice).
 *   • The money  — Concept 1's card: agreed / paid so far / balance,
 *                  a progress track, the payment history, and an inline
 *                  "+ Record a payment" that opens the payment sheet.
 *   • Action bar — one next step for the current status (mark ready →
 *                  mark delivered), hidden once the job is delivered or
 *                  canceled so there is never a dead button. The bar is
 *                  fixed at the bottom, which puts it right under the
 *                  scrolling thumb — so the first tap only RAISES an
 *                  inline confirmation ("…?" + Cancel / confirm); a
 *                  second, deliberate tap performs the mutation. The
 *                  label stays visible in both states.
 *
 * DATA + MUTATIONS
 *   GET  /jobs/:id                          → everything above
 *   POST /jobs/:jobId/payments              → the payment sheet
 *   PATCH /jobs/:id { status }              → mark ready to collect
 *   PATCH /jobs/:id { status, deliveredAt } → mark as delivered
 *   After each mutation the job query (["job", id]) and the shared
 *   ["jobs"] / ["reports"] keys are invalidated, so the list counts,
 *   balances and revenue refresh together — the same keys the dashboard
 *   and the New Job modal already use.
 *
 * Derived states match the rest of the app exactly: delivered = completed
 * + deliveredAt set; ready = completed + no deliveredAt; overdue = pending
 * with a due date before today.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ThemeToggle from "@/components/theme-toggle";
import { useToast } from "@/components/toast";
import {
  createPayment,
  getJob,
  updateJob,
  type Job,
} from "@/lib/api-client";
import { avatarColor, avatarTint } from "@/lib/avatar-colors";

/* ---------------------------------- helpers ---------------------------------- */

const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-09-24" (date column) → "24 Sep" — no timezone drift. */
function fmtDay(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  return `${+m[3]!} ${MONTHS[+m[2]! - 1]}`;
}

/** ISO timestamp → "24 Sep" (UTC parts — the DB stores UTC). */
function fmtISO(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]!}`;
}

/**
 * "YYYY-MM-DD" or an ISO date column ("2026-09-24T00:00:00.000Z" — how the
 * API serializes the pg `date` type) → local midnight in ms. Appending
 * "T00:00:00" to an ISO string yields Invalid Date, so this must parse
 * both shapes or overdue never fires on real API data.
 */
function parseDay(value: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return new Date(+m[1]!, +m[2]! - 1, +m[3]!).getTime();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return NaN;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Pending + due date before today — the app-wide overdue derivation. */
function isOverdue(j: Job): boolean {
  if (j.status !== "pending" || !j.dueDate) return false;
  const due = parseDay(j.dueDate);
  if (!Number.isFinite(due)) return false;
  return due < new Date(new Date().toDateString()).getTime();
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter((w) => !/^(mrs|mr|ms|dr)\.?$/i.test(w))
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "•"
  );
}

/* ---------------------------------- icons ---------------------------------- */

function IconPhoto({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m5.8 17.2 4.2-4.2 2.8 2.8 3.2-3.2 2.2 2.2" />
    </svg>
  );
}

/* ---------------------------------- the rail ---------------------------------- */

interface Milestone {
  label: string;
  sub: string;
  state: "done" | "now" | "future" | "over";
  tag?: string; // trailing hint ("now" / "past due" / "canceled")
}

/** Life of a job as milestones — derived from the same fields as the list. */
function milestones(j: Job): Milestone[] {
  const ready = j.status === "completed" && !j.deliveredAt;
  const delivered = !!j.deliveredAt;
  const over = isOverdue(j);
  const ms: Milestone[] = [
    { label: "Placed", sub: fmtISO(j.createdAt), state: "done" },
  ];
  if (j.status === "canceled") {
    ms.push({
      label: "On the bench",
      sub: "canceled before completion",
      state: "over",
      tag: "canceled",
    });
  } else if (delivered || ready) {
    ms.push({ label: "On the bench", sub: "in progress", state: "done" });
  } else if (over) {
    ms.push({ label: "On the bench", sub: "in progress", state: "over", tag: "past due" });
  } else {
    ms.push({ label: "On the bench", sub: "in progress", state: "now", tag: "now" });
  }
  ms.push({
    label: "Ready to collect",
    sub: delivered ? fmtISO(j.deliveredAt!) : "—",
    state: delivered ? "done" : ready ? "now" : "future",
    tag: ready ? "now" : undefined,
  });
  ms.push({
    label: "Delivered",
    sub: delivered ? fmtISO(j.deliveredAt!) : "—",
    state: delivered ? "done" : "future",
  });
  return ms;
}

/* ---------------------------------- the tape (Concept 1's stitched grid) ---------------------------------- */

/** Two-column stitched grid — the anatomy the user picked from Concept 1. */
function Tape({ job }: { job: Job }) {
  const entries = Object.entries(job.measurements ?? {});
  if (entries.length === 0) {
    return (
      <div className="rounded-[20px] bg-[var(--hig-card)] px-4 py-6 text-center text-[12.5px] text-[var(--hig-label-tertiary)]">
        No measurements on file for this fitting.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 rounded-[20px] bg-[var(--hig-card)] px-4 py-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
      {entries.map(([key, value], i) => (
        <div
          key={key}
          className={`px-3 py-3 ${
            // stitched seams: dashed right border on odd cells, dashed top
            // border from the second row on — the Concept 1 grid DNA
            i % 2 === 0 ? "border-r border-dashed border-[var(--hig-separator)]" : ""
          } ${i >= 2 ? "border-t border-dashed border-[var(--hig-separator)]" : ""}`}
        >
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.07em] text-[var(--hig-label-tertiary)]">
            {key}
          </p>
          <p className="mt-1 text-[17px] font-medium tracking-[-0.01em] [font-variant-numeric:tabular-nums]">
            {value === null ? (
              <span className="text-[12px] font-light text-[var(--hig-label-tertiary)]">
                not taken
              </span>
            ) : (
              <>
                {value}
                <em className="ml-1 text-[10px] font-medium not-italic text-[var(--hig-label-secondary)]">
                  cm
                </em>
              </>
            )}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------- the money (Concept 1's card) ---------------------------------- */

function Money({
  job,
  onRecord,
}: {
  job: Job;
  onRecord: () => void;
}) {
  const payments = job.payments ?? [];
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const balance = Math.max(0, job.agreedPrice - paid);
  const pct =
    job.agreedPrice > 0 ? Math.min(100, (paid / job.agreedPrice) * 100) : 0;

  return (
    /* 16px inner padding per the design system's card spec */
    <div className="rounded-[20px] bg-[var(--hig-card)] px-4 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
      {/* agreed / paid / balance — amounts at 500 (content type per HIG) */}
      <div className="flex items-baseline justify-between">
        <p className="text-[12px] text-[var(--hig-label-secondary)]">Agreed</p>
        <p className="text-[15px] font-medium [font-variant-numeric:tabular-nums]">
          {naira.format(job.agreedPrice)}
        </p>
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <p className="text-[12px] text-[var(--hig-label-secondary)]">Paid so far</p>
        <p className="text-[15px] font-medium text-[var(--hig-success)] [font-variant-numeric:tabular-nums]">
          {naira.format(paid)}
        </p>
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <p className="text-[12px] text-[var(--hig-label-secondary)]">
          Balance to collect
        </p>
        <p
          className={`text-[15px] font-medium [font-variant-numeric:tabular-nums] ${
            balance > 0 ? "text-[var(--hig-warning)]" : "text-[var(--hig-label)]"
          }`}
        >
          {naira.format(balance)}
        </p>
      </div>

      {/* progress — the collection story at a glance */}
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--hig-fill)]">
        <div
          className="h-full rounded-full bg-[var(--hig-accent)] transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* payment history, newest first (the API orders by paidAt desc) */}
      <div className="mt-2">
        {payments.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-2.5 border-t border-dashed border-[var(--hig-separator)] py-2.5 first:border-t-0"
          >
            <span
              className="h-[7px] w-[7px] flex-shrink-0 rounded-full bg-[var(--hig-success)]"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium leading-tight">Payment</p>
              <p className="text-[10.5px] text-[var(--hig-label-secondary)]">
                {fmtISO(p.paidAt)}
              </p>
            </div>
            <p className="text-[13.5px] font-medium [font-variant-numeric:tabular-nums]">
              {naira.format(p.amount)}
            </p>
          </div>
        ))}
        {payments.length === 0 && (
          <p className="border-t border-dashed border-[var(--hig-separator)] py-3 text-center text-[11.5px] text-[var(--hig-label-tertiary)]">
            Nothing recorded yet.
          </p>
        )}
      </div>

      {/* record a payment — Concept 1's inline action, now wired to the API */}
      <button
        type="button"
        onClick={onRecord}
        className="mt-3 w-full rounded-[13px] bg-[var(--hig-fill)] py-3 text-[13.5px] font-semibold text-[var(--hig-label)] transition-transform duration-200 active:scale-[0.98]"
      >
        + Record a payment
      </button>
    </div>
  );
}

/* ---------------------------------- payment sheet ---------------------------------- */

function PaymentSheet({
  job,
  open,
  onClose,
}: {
  job: Job;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);

  const amountNum = Number(amount.replace(/[^\d.]/g, ""));
  const valid = amount.trim() !== "" && Number.isFinite(amountNum) && amountNum > 0;

  const pay = useMutation({
    mutationFn: () =>
      createPayment(job.id, {
        amount: amountNum,
        // the backend z.coerce.date() accepts the "YYYY-MM-DD" from the picker
        paidAt: date ? new Date(date + "T12:00:00").toISOString() : undefined,
      }),
    onSuccess: () => {
      // Refresh the job (paid/balance/progress/payments) plus the shared
      // keys the dashboard's balances + revenue read.
      queryClient.invalidateQueries({ queryKey: ["job", job.id] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["reports", "outstanding-payments"] });
      queryClient.invalidateQueries({ queryKey: ["reports", "monthly-revenue"] });
      toast.show({
        title: "Payment recorded.",
        detail: `${naira.format(amountNum)} on ${fmtDay(date)}`,
      });
      onClose();
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "Could not record the payment."),
  });

  /* reset on open; Escape + scroll lock like the New Job sheet */
  const [wasOpen, setWasOpen] = useState(false);
  if (open && !wasOpen) {
    setWasOpen(true);
    setAmount("");
    setDate(new Date().toISOString().slice(0, 10));
    setError(null);
    document.body.style.overflow = "hidden";
  }
  if (!open && wasOpen) {
    setWasOpen(false);
    document.body.style.overflow = "";
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Record a payment">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 w-full animate-fade-in bg-black/50"
      />
      <div className="hig absolute inset-x-0 bottom-0 mx-auto w-full max-w-[430px] animate-sheet-in rounded-t-[26px] border border-b-0 border-[var(--hig-separator)] bg-[var(--hig-card)] px-5 pb-[calc(18px+env(safe-area-inset-bottom))] pt-2 shadow-[0_-30px_80px_-20px_rgba(0,0,0,0.5)]">
        <div className="mx-auto h-1 w-[38px] rounded-full bg-[var(--hig-separator)]" aria-hidden="true" />
        <div className="mt-3 flex items-center justify-between">
          <h2 className="text-[20px] font-medium tracking-[-0.005em]">
            Record a <span className="text-[var(--hig-accent)]">payment</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--hig-label-secondary)] transition-colors hover:text-[var(--hig-label)]"
          >
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full border border-[var(--hig-separator)] bg-[var(--hig-fill)] text-[13px]">
              ✕
            </span>
          </button>
        </div>

        <p className="mt-1 text-[12px] text-[var(--hig-label-secondary)]">
          Balance to collect ·{" "}
          <b className="font-semibold text-[var(--hig-warning)] [font-variant-numeric:tabular-nums]">
            {naira.format(
              Math.max(0, job.agreedPrice - (job.payments ?? []).reduce((s, p) => s + p.amount, 0)),
            )}
          </b>
        </p>

        {/* amount — naira-prefixed, numeric keypad */}
        <div className="relative mt-4">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[17px] font-medium text-[var(--hig-accent)]">
            ₦
          </span>
          <input
            className="w-full rounded-[13px] border border-[var(--hig-separator)] bg-[var(--hig-fill)] py-3.5 pl-9 pr-4 text-[19px] font-medium text-[var(--hig-label)] outline-none transition-[border-color,box-shadow] placeholder:font-light placeholder:text-[var(--hig-label-tertiary)] focus:border-[var(--hig-accent)] focus:shadow-[0_0_0_3px_var(--hig-accent-soft)] [font-variant-numeric:tabular-nums]"
            placeholder="0"
            inputMode="numeric"
            autoFocus
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && valid) pay.mutate();
            }}
          />
        </div>

        {/* date — defaults to today, the common case */}
        <div className="relative mt-3">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            className="pointer-events-none absolute left-4 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-[var(--hig-accent)]"
            aria-hidden="true"
          >
            <rect x="3.5" y="5" width="17" height="16" rx="3" />
            <path d="M3.5 10h17" />
            <path d="M8 3v4" />
            <path d="M16 3v4" />
          </svg>
          <input
            type="date"
            className="w-full rounded-[13px] border border-[var(--hig-separator)] bg-[var(--hig-fill)] py-3.5 pl-11 pr-4 text-[13.5px] font-medium text-[var(--hig-label)] outline-none transition-[border-color,box-shadow] focus:border-[var(--hig-accent)] focus:shadow-[0_0_0_3px_var(--hig-accent-soft)]"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        {error && <p className="mt-3 text-[12px] text-[var(--hig-danger)]">{error}</p>}

        <button
          type="button"
          disabled={!valid || pay.isPending}
          onClick={() => pay.mutate()}
          className="mt-4 w-full rounded-[15px] bg-[var(--hig-accent)] py-4 text-[15px] font-semibold text-white transition-transform duration-200 active:scale-[0.98] disabled:opacity-50"
        >
          {pay.isPending ? (
            <span className="mx-auto flex items-center justify-center gap-2">
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
                aria-hidden="true"
              />
              Recording…
            </span>
          ) : (
            `Record ${valid ? naira.format(amountNum) : "payment"}`
          )}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------- action bar ---------------------------------- */

function ActionBar({ job }: { job: Job }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  /* first tap arms the confirmation; a second tap (or Cancel) resolves it.
     Reset whenever the job or its status changes so a fresh screen always
     starts in the calm, single-button state. */
  const [confirming, setConfirming] = useState(false);
  useEffect(() => setConfirming(false), [job.id, job.status]);

  const ready = job.status === "completed" && !job.deliveredAt;
  /* one next step per status; delivered/canceled → no bar at all */
  const primary =
    job.status === "canceled" || job.deliveredAt
      ? null
      : ready
        ? { label: "Mark as delivered", done: { status: "completed" as const, deliveredAt: new Date().toISOString() } }
        : { label: "Mark ready to collect", done: { status: "completed" as const } };

  const act = useMutation({
    mutationFn: () => updateJob(job.id, primary!.done),
    onSuccess: () => {
      setConfirming(false);
      queryClient.invalidateQueries({ queryKey: ["job", job.id] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["reports", "outstanding-payments"] });
      queryClient.invalidateQueries({ queryKey: ["reports", "monthly-revenue"] });
      toast.show({
        title: ready ? "Job delivered." : "Marked ready to collect.",
        detail: ready
          ? `${job.subjectName ?? "Client"} can pick it up.`
          : `Waiting for ${job.subjectName ?? "the client"}.`,
      });
    },
    onError: (err) =>
      toast.show({
        title: "Couldn't update the job.",
        detail: err instanceof Error ? err.message : "Try again.",
      }),
  });

  if (!primary) return null;

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-10">
      <div className="relative mx-auto w-full max-w-[430px]">
        <div className="pointer-events-auto rounded-t-[24px] border-t border-[var(--hig-separator)] bg-[var(--hig-bar)] px-5 pb-[calc(14px+env(safe-area-inset-bottom))] pt-3 shadow-[var(--hig-bar-shadow)] backdrop-blur-[20px] backdrop-saturate-150">
          {confirming ? (
            /* ---------- step 2: the conscious action ----------
               The bar morphs in place: the same label, now phrased as a
               question, flanked by Cancel (returns to the calm state) and
               the confirming button. The accent-tint wash signals the
               mode switch at a glance. */
            <div
              role="alert"
              className="flex animate-fade-in items-center gap-2.5 rounded-[20px] bg-[var(--hig-accent-tint)] px-4 py-2.5"
            >
              <p className="min-w-0 flex-1 text-[13.5px] font-medium leading-snug text-[var(--hig-label)]">
                {primary.label}?
              </p>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                /* py-3.5 → ≥44px tall (HIG touch minimum) */
                className="flex-shrink-0 rounded-[12px] bg-[var(--hig-card)] px-4 py-3.5 text-[13.5px] font-semibold text-[var(--hig-label-secondary)] shadow-[var(--hig-bar-shadow)] transition-transform duration-200 active:scale-95"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => act.mutate()}
                disabled={act.isPending}
                className="flex flex-shrink-0 items-center justify-center gap-1.5 rounded-[12px] bg-[var(--hig-accent)] px-4 py-3.5 text-[13.5px] font-semibold text-white transition-transform duration-200 active:scale-95 disabled:opacity-60"
              >
                {act.isPending ? (
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
                    aria-hidden="true"
                  />
                ) : (
                  primary.label
                )}
              </button>
            </div>
          ) : (
            /* ---------- step 1: the calm, always-visible action ----------
               Tapping does NOT mutate — it arms the confirmation above.
               (The + payment shortcut was removed earlier — "Record a
               payment" lives in The money card.) */
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="flex w-full items-center justify-center gap-2 rounded-[16px] bg-[var(--hig-accent)] py-4 text-[15px] font-semibold text-white transition-transform duration-200 active:scale-[0.98]"
            >
              {primary.label}
              <span aria-hidden="true">→</span>
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

/* ---------------------------------- skeleton ---------------------------------- */

/** Bars mirror the real anatomy so loading never shifts the layout. */
function DetailSkeleton() {
  const bar = "animate-pulse rounded bg-[var(--hig-separator)]";
  return (
    <div className="mx-auto w-full max-w-[430px] px-4">
      <div className={`mt-6 h-2.5 w-24 ${bar}`} />
      <div className={`mt-3 h-7 w-3/4 ${bar}`} />
      <div className="mt-4 flex items-center gap-2.5">
        <div className={`h-10 w-10 flex-shrink-0 rounded-full ${bar}`} />
        <div className="flex-1">
          <div className={`h-3.5 w-28 ${bar}`} />
          <div className={`mt-1.5 h-2.5 w-40 ${bar}`} />
        </div>
      </div>
      <div className="mt-5 flex">
        <div className={`h-11 flex-1 ${bar}`} />
        <div className={`mx-4 h-11 w-px ${bar}`} />
        <div className={`h-11 flex-1 ${bar}`} />
      </div>
      <div className="mt-8 grid grid-cols-2 gap-3">
        <div className={`aspect-[3/4] ${bar}`} />
        <div className={`aspect-[3/4] ${bar}`} />
      </div>
      <div className={`mt-8 h-40 ${bar}`} />
      <div className={`mt-6 h-44 ${bar}`} />
    </div>
  );
}

/* ---------------------------------- page ---------------------------------- */

export default function JobDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [payOpen, setPayOpen] = useState(false);

  /* the single source of truth for this screen — GET /jobs/:id */
  const jobQ = useQuery({
    queryKey: ["job", id],
    queryFn: () => getJob(id),
    enabled: !!id,
  });

  const job = jobQ.data?.data;
  const overdue = job ? isOverdue(job) : false;

  /* comparison — reference wins the left slot, finished the right; the
     right slot stays dashed until the finished shots exist */
  const ref = job?.styleRef?.[0];
  const fin = job?.finishedJob?.[0];
  const shots = (job?.styleRef ?? []).length + (job?.finishedJob ?? []).length;

  const rails = useMemo(() => (job ? milestones(job) : []), [job]);
  const doneCount = rails.filter((m) => m.state === "done").length;

  return (
    <main className="hig min-h-dvh bg-[var(--hig-grouped)] pb-44 text-[var(--hig-label)] transition-colors duration-300">
      {/* ---------- chrome ---------- */}
      <header className="sticky top-0 z-30 border-b border-[var(--hig-separator)] bg-[var(--hig-bar)]/80 backdrop-blur-[20px] backdrop-saturate-150">
        <div className="mx-auto flex w-full max-w-[430px] items-center justify-between px-4 py-1.5">
          <button
            type="button"
            aria-label="Back to jobs"
            onClick={() => (window.history.length > 1 ? router.back() : router.push("/jobs"))}
            className="flex h-11 w-11 items-center justify-center rounded-full text-[20px] text-[var(--hig-accent)] transition-transform duration-200 active:scale-90"
          >
            ‹
          </button>
          <h1 className="text-[15px] font-semibold tracking-[-0.01em]">Inspection</h1>
          <ThemeToggle />
        </div>
      </header>

      {jobQ.isError ? (
        /* ---------- error state ---------- */
        <div className="mx-auto mt-24 w-full max-w-[430px] px-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--hig-danger-tint)] text-[var(--hig-danger)]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="h-6 w-6" aria-hidden="true">
              <path d="M12 8.5v5" />
              <path d="M12 17.2v.1" />
              <path d="M10.3 4.2 2.9 17a1.9 1.9 0 0 0 1.65 2.85h14.9A1.9 1.9 0 0 0 21.1 17L13.7 4.2a1.9 1.9 0 0 0-3.4 0Z" />
            </svg>
          </div>
          <p className="mt-4 text-[16px] font-medium">Couldn&apos;t open this job.</p>
          <p className="mt-1 text-[13px] text-[var(--hig-label-secondary)]">
            {jobQ.error instanceof Error ? jobQ.error.message : "Check your connection and try again."}
          </p>
          <button
            type="button"
            onClick={() => jobQ.refetch()}
            className="mt-5 rounded-[13px] bg-[var(--hig-accent)] px-6 py-3 text-[14px] font-semibold text-white transition-transform duration-200 active:scale-95"
          >
            Retry
          </button>
        </div>
      ) : !job ? (
        <DetailSkeleton />
      ) : (
        <>
          {/* ---------- header (entrance: hig-rise, 8pt-staggered) ---------- */}
          <div
            className="hig-rise mx-auto w-full max-w-[430px] px-4 pt-6"
            style={{ animationDelay: "0ms" }}
          >
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--hig-label-tertiary)]">
              Order file · <span className="[font-variant-numeric:tabular-nums]">{job.id.slice(0, 8)}</span>
            </p>
            <h1 className="mt-2 text-[26px] font-medium leading-[32px] tracking-[-0.02em]">
              {job.description || "Garment"}
            </h1>

            {/* subject row — avatar tinted from the name (same hue as the
                list + dashboard); call only (message was removed) */}
            <div className="mt-4 flex items-center gap-2.5">
              <span
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border text-[13px] font-semibold"
                style={{
                  backgroundColor: avatarTint(job.subjectName ?? ""),
                  color: avatarColor(job.subjectName ?? ""),
                  borderColor: avatarColor(job.subjectName ?? "") + "4D",
                }}
              >
                {initials(job.subjectName ?? "•")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium leading-tight">
                  for {job.subjectName ?? "the client"}
                </p>
                <p className="mt-0.5 truncate text-[12px] text-[var(--hig-label-secondary)]">
                  {job.customerPhone ?? "no phone on file"}
                </p>
              </div>
              {job.customerPhone && (
                /* tel: opens the native dialer with the number pre-filled —
                   strip everything but digits and an optional leading + so
                   spaces/dashes/braces can't break the URI */
                <a
                  href={`tel:${job.customerPhone.replace(/[^\d+]/g, "")}`}
                  aria-label={`Call ${job.customerPhone}`}
                  title={`Call ${job.customerPhone}`}
                  /* 44px — HIG touch minimum (the 40px avatar next to it is decorative) */
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[var(--hig-accent-tint)] text-[15px] text-[var(--hig-accent)] transition-transform duration-200 active:scale-90"
                >
                  ✆
                </a>
              )}
            </div>

            {/* placed / due meta strip — hairline-divided, like Concept 1 */}
            <div className="mt-5 flex border-t border-dashed border-[var(--hig-separator)] pt-3.5">
              <div className="flex-1">
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.07em] text-[var(--hig-label-tertiary)]">
                  Placed
                </p>
                <p className="mt-1 text-[14px] font-medium [font-variant-numeric:tabular-nums]">
                  {fmtISO(job.createdAt)}
                </p>
              </div>
              <div className="border-l border-dashed border-[var(--hig-separator)] pl-4">
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.07em] text-[var(--hig-label-tertiary)]">
                  Due
                </p>
                <p
                  className={`mt-1 text-[14px] font-medium [font-variant-numeric:tabular-nums] ${
                    overdue
                      ? "text-[var(--hig-danger)]"
                      : job.dueDate
                        ? "text-[var(--hig-accent)]"
                        : "text-[var(--hig-label-tertiary)]"
                  }`}
                >
                  {job.dueDate ? fmtDay(job.dueDate) : "—"}
                </p>
              </div>
            </div>
          </div>

          {/* ---------- the comparison ---------- */}
          <section
            className="hig-rise mx-auto mt-6 w-full max-w-[430px] px-4"
            style={{ animationDelay: "40ms" }}
          >
            <div className="grid grid-cols-2 gap-3">
              {/* reference — first style shot */}
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--hig-label-tertiary)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--hig-label-tertiary)]" aria-hidden="true" />
                  Reference
                </p>
                <div className="relative aspect-[3/4] overflow-hidden rounded-[20px] bg-[var(--hig-fill)] shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
                  {ref?.url ? (
                    <img
                      src={ref.url}
                      alt={ref.alt || "Style reference"}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[var(--hig-label-tertiary)]">
                      <IconPhoto className="h-8 w-8" />
                      <span className="px-6 text-center text-[11px]">no reference on file</span>
                    </div>
                  )}
                </div>
                <p className="mt-1.5 truncate text-center text-[11px] text-[var(--hig-label-tertiary)]">
                  {ref?.alt ?? "—"}
                </p>
              </div>

              {/* finished — dashed "stitched" slot until the shots land */}
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--hig-label-secondary)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--hig-accent)]" aria-hidden="true" />
                  Finished
                </p>
                {fin?.url ? (
                  <div className="relative aspect-[3/4] overflow-hidden rounded-[20px] bg-[var(--hig-fill)] shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
                    <img
                      src={fin.url}
                      alt={fin.alt || "Finished piece"}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-[20px] border-[1.5px] border-dashed border-[var(--hig-separator)] text-[var(--hig-label-tertiary)]">
                    <IconPhoto className="h-8 w-8" />
                    <span className="px-6 text-center text-[11px] leading-relaxed">
                      Waiting for the finished shot
                    </span>
                  </div>
                )}
                <p className="mt-1.5 truncate text-center text-[11px] text-[var(--hig-label-tertiary)]">
                  {fin?.alt ?? (shots > 0 ? "will appear here" : "—")}
                </p>
              </div>
            </div>
          </section>

          {/* ---------- the rail ---------- */}
          <section
            className="hig-rise mx-auto mt-7 w-full max-w-[430px] px-4"
            style={{ animationDelay: "80ms" }}
          >
            <div className="mb-2.5 flex items-baseline justify-between px-0.5">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--hig-label-secondary)]">
                The rail
              </h2>
              <span className="text-[11.5px] text-[var(--hig-label-tertiary)] [font-variant-numeric:tabular-nums]">
                {doneCount} of 4
              </span>
            </div>
            <div className="rounded-[20px] bg-[var(--hig-card)] px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
              {rails.map((m) => (
                <div key={m.label} className="relative flex gap-3 pb-4 last:pb-1.5">
                  {/* stitched spine between milestones */}
                  <span
                    className="absolute bottom-0 left-[9px] top-[24px] border-l-[1.5px] border-dashed border-[var(--hig-separator)]"
                    aria-hidden="true"
                  />
                  <span
                    className={`relative z-10 mt-0.5 flex h-[19px] w-[19px] flex-shrink-0 items-center justify-center rounded-full text-[10px] text-white ${
                      m.state === "done"
                        ? "bg-[var(--hig-success)]"
                        : m.state === "now"
                          ? "bg-[var(--hig-accent)] shadow-[0_0_0_4px_var(--hig-accent-tint)]"
                          : m.state === "over"
                            ? "bg-[var(--hig-danger)]"
                            : "bg-[var(--hig-fill)] shadow-[inset_0_0_0_1.5px_var(--hig-separator)]"
                    }`}
                    aria-hidden="true"
                  >
                    {m.state === "done" ? "✓" : ""}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-[14px] font-medium leading-tight ${
                        m.state === "now"
                          ? "text-[var(--hig-accent)]"
                          : m.state === "over"
                            ? "text-[var(--hig-danger)]"
                            : ""
                      }`}
                    >
                      {m.label}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-[var(--hig-label-tertiary)]">{m.sub}</p>
                  </div>
                  {m.tag && (
                    <p
                      className={`pt-0.5 text-[11.5px] ${
                        m.state === "over"
                          ? "font-medium text-[var(--hig-danger)]"
                          : "text-[var(--hig-label-tertiary)]"
                      }`}
                    >
                      {m.tag}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* ---------- the tape (Concept 1 grid) ---------- */}
          <section
            className="hig-rise mx-auto mt-7 w-full max-w-[430px] px-4"
            style={{ animationDelay: "120ms" }}
          >
            <div className="mb-2.5 flex items-baseline justify-between px-0.5">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--hig-label-secondary)]">
                The tape
              </h2>
              <span className="text-[11.5px] text-[var(--hig-label-tertiary)] [font-variant-numeric:tabular-nums]">
                {Object.keys(job.measurements ?? {}).length} taken
              </span>
            </div>
            <Tape job={job} />
          </section>

          {/* ---------- the money (Concept 1 card) ---------- */}
          <section
            className="hig-rise mx-auto mt-7 w-full max-w-[430px] px-4"
            style={{ animationDelay: "160ms" }}
          >
            <div className="mb-2.5 flex items-baseline justify-between px-0.5">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--hig-label-secondary)]">
                The money
              </h2>
              <span className="text-[11.5px] text-[var(--hig-label-tertiary)] [font-variant-numeric:tabular-nums]">
                {(job.payments ?? []).length} payments
              </span>
            </div>
            <Money job={job} onRecord={() => setPayOpen(true)} />
          </section>

          <p
            className="hig-rise mx-auto mt-6 w-full max-w-[430px] px-4 text-center text-[11.5px] leading-relaxed text-[var(--hig-label-tertiary)]"
            style={{ animationDelay: "200ms" }}
          >
            Placed {fmtISO(job.createdAt)}
            {job.dueDate ? ` · due ${fmtDay(job.dueDate)}` : ""} · photos update when the
            finished piece lands.
          </p>
        </>
      )}

      {/* ---------- action bar + payment sheet ---------- */}
      {job && <ActionBar job={job} />}
      {job && (
        <PaymentSheet job={job} open={payOpen} onClose={() => setPayOpen(false)} />
      )}
    </main>
  );
}