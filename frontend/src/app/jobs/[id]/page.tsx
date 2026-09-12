"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ThemeToggle from "@/components/ui/theme-toggle";
import { useToast } from "@/components/ui/toast";
import { useCreatePayment, useJob, useUpdateJob } from "@/hooks/use-jobs";
import { avatarColor, avatarTint } from "@/lib/avatar-colors";
import type { Job } from "@/types/job";

const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function fmtDay(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  return `${+m[3]!} ${MONTHS[+m[2]! - 1]}`;
}

function fmtISO(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]!}`;
}

function parseDay(value: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return new Date(+m[1]!, +m[2]! - 1, +m[3]!).getTime();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return NaN;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

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

interface Milestone {
  label: string;
  sub: string;
  state: "done" | "now" | "future" | "over";
  tag?: string;
}

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

function Tape({ job }: { job: Job }) {
  const entries = Object.entries(job.measurements ?? {});
  if (entries.length === 0) {
    return (
      <div className="rounded-[20px] bg-(--hig-card) px-4 py-6 text-center text-[12.5px] text-(--hig-label-tertiary)">
        No measurements on file for this fitting.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 rounded-[20px] bg-(--hig-card) px-4 py-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
      {entries.map(([key, value], i) => (
        <div
          key={key}
          className={`px-3 py-3 ${
            i % 2 === 0 ? "border-r border-dashed border-(--hig-separator)" : ""
          } ${i >= 2 ? "border-t border-dashed border-(--hig-separator)" : ""}`}
        >
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.07em] text-(--hig-label-tertiary)">
            {key}
          </p>
          <p className="mt-1 text-[17px] font-medium tracking-[-0.01em] [font-variant-numeric:tabular-nums]">
            {value === null ? (
              <span className="text-[12px] font-light text-(--hig-label-tertiary)">
                not taken
              </span>
            ) : (
              <>
                {value}
                <em className="ml-1 text-[10px] font-medium not-italic text-(--hig-label-secondary)">
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

    <div className="rounded-[20px] bg-(--hig-card) px-4 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
      {}
      <div className="flex items-baseline justify-between">
        <p className="text-[12px] text-(--hig-label-secondary)">Agreed</p>
        <p className="text-[15px] font-medium [font-variant-numeric:tabular-nums]">
          {naira.format(job.agreedPrice)}
        </p>
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <p className="text-[12px] text-(--hig-label-secondary)">Paid so far</p>
        <p className="text-[15px] font-medium text-(--hig-success) [font-variant-numeric:tabular-nums]">
          {naira.format(paid)}
        </p>
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <p className="text-[12px] text-(--hig-label-secondary)">
          Balance to collect
        </p>
        <p
          className={`text-[15px] font-medium [font-variant-numeric:tabular-nums] ${
            balance > 0 ? "text-(--hig-warning)" : "text-(--hig-label)"
          }`}
        >
          {naira.format(balance)}
        </p>
      </div>

      {}
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-(--hig-fill)">
        <div
          className="h-full rounded-full bg-(--hig-accent) transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {}
      <div className="mt-2">
        {payments.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-2.5 border-t border-dashed border-(--hig-separator) py-2.5 first:border-t-0"
          >
            <span
              className="h-1.75 w-1.75 shrink-0 rounded-full bg-(--hig-success)"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium leading-tight">Payment</p>
              <p className="text-[10.5px] text-(--hig-label-secondary)">
                {fmtISO(p.paidAt)}
              </p>
            </div>
            <p className="text-[13.5px] font-medium [font-variant-numeric:tabular-nums]">
              {naira.format(p.amount)}
            </p>
          </div>
        ))}
        {payments.length === 0 && (
          <p className="border-t border-dashed border-(--hig-separator) py-3 text-center text-[11.5px] text-(--hig-label-tertiary)">
            Nothing recorded yet.
          </p>
        )}
      </div>

      {}
      <button
        type="button"
        onClick={onRecord}
        className="mt-3 w-full rounded-[13px] bg-(--hig-fill) py-3 text-[13.5px] font-semibold text-(--hig-label) transition-transform duration-200 active:scale-[0.98]"
      >
        + Record a payment
      </button>
    </div>
  );
}

function PaymentSheet({
  job,
  open,
  onClose,
}: {
  job: Job;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);

  const amountNum = Number(amount.replace(/[^\d.]/g, ""));
  const valid = amount.trim() !== "" && Number.isFinite(amountNum) && amountNum > 0;

  const pay = useCreatePayment();

  const submitPayment = () =>
    pay.mutate(
      {
        jobId: job.id,
        amount: amountNum,

        paidAt: date ? new Date(date + "T12:00:00").toISOString() : undefined,
      },
      {
        onSuccess: () => {
          toast.show({
            title: "Payment recorded.",
            detail: `${naira.format(amountNum)} on ${fmtDay(date)}`,
          });
          onClose();
        },
        onError: (err) =>
          setError(
            err instanceof Error ? err.message : "Could not record the payment.",
          ),
      },
    );

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
      <div className="hig absolute inset-x-0 bottom-0 mx-auto w-full max-w-107.5 animate-sheet-in rounded-t-[26px] border border-b-0 border-(--hig-separator) bg-(--hig-card) px-5 pb-[calc(18px+env(safe-area-inset-bottom))] pt-2 shadow-[0_-30px_80px_-20px_rgba(0,0,0,0.5)]">
        <div className="mx-auto h-1 w-9.5 rounded-full bg-(--hig-separator)" aria-hidden="true" />
        <div className="mt-3 flex items-center justify-between">
          <h2 className="text-[20px] font-medium tracking-[-0.005em]">
            Record a <span className="text-(--hig-accent)">payment</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-full text-(--hig-label-secondary) transition-colors hover:text-(--hig-label)"
          >
            <span className="flex h-7.5 w-7.5 items-center justify-center rounded-full border border-(--hig-separator) bg-(--hig-fill) text-[13px]">
              ✕
            </span>
          </button>
        </div>

        <p className="mt-1 text-[12px] text-(--hig-label-secondary)">
          Balance to collect ·{" "}
          <b className="font-semibold text-(--hig-warning) [font-variant-numeric:tabular-nums]">
            {naira.format(
              Math.max(0, job.agreedPrice - (job.payments ?? []).reduce((s, p) => s + p.amount, 0)),
            )}
          </b>
        </p>

        {}
        <div className="relative mt-4">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[17px] font-medium text-(--hig-accent)">
            ₦
          </span>
          <input
            className="w-full rounded-[13px] border border-(--hig-separator) bg-(--hig-fill) py-3.5 pl-9 pr-4 text-[19px] font-medium text-(--hig-label) outline-none transition-[border-color,box-shadow] placeholder:font-light placeholder:text-(--hig-label-tertiary) focus:border-(--hig-accent) focus:shadow-[0_0_0_3px_var(--hig-accent-soft)] [font-variant-numeric:tabular-nums]"
            placeholder="0"
            inputMode="numeric"
            autoFocus
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && valid) submitPayment();
            }}
          />
        </div>

        {}
        <div className="relative mt-3">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            className="pointer-events-none absolute left-4 top-1/2 h-3.75 w-3.75 -translate-y-1/2 text-(--hig-accent)"
            aria-hidden="true"
          >
            <rect x="3.5" y="5" width="17" height="16" rx="3" />
            <path d="M3.5 10h17" />
            <path d="M8 3v4" />
            <path d="M16 3v4" />
          </svg>
          <input
            type="date"
            className="w-full rounded-[13px] border border-(--hig-separator) bg-(--hig-fill) py-3.5 pl-11 pr-4 text-[13.5px] font-medium text-(--hig-label) outline-none transition-[border-color,box-shadow] focus:border-(--hig-accent) focus:shadow-[0_0_0_3px_var(--hig-accent-soft)]"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        {error && <p className="mt-3 text-[12px] text-(--hig-danger)">{error}</p>}

        <button
          type="button"
          disabled={!valid || pay.isPending}
          onClick={submitPayment}
          className="mt-4 w-full rounded-[15px] bg-(--hig-accent) py-4 text-[15px] font-semibold text-white transition-transform duration-200 active:scale-[0.98] disabled:opacity-50"
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

function ActionBar({ job }: { job: Job }) {
  const toast = useToast();

  const [confirming, setConfirming] = useState(false);
  useEffect(() => setConfirming(false), [job.id, job.status]);

  const ready = job.status === "completed" && !job.deliveredAt;

  const primary =
    job.status === "canceled" || job.deliveredAt
      ? null
      : ready
        ? { label: "Mark as delivered", done: { status: "completed" as const, deliveredAt: new Date().toISOString() } }
        : { label: "Mark ready to collect", done: { status: "completed" as const } };

  const act = useUpdateJob();

  const runAction = () =>
    act.mutate(
      { id: job.id, input: primary!.done },
      {
        onSuccess: () => {
          setConfirming(false);
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
      },
    );

  if (!primary) return null;

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-10">
      <div className="relative mx-auto w-full max-w-107.5">
        <div className="pointer-events-auto rounded-t-3xl border-t border-(--hig-separator) bg-(--hig-bar) px-5 pb-[calc(14px+env(safe-area-inset-bottom))] pt-3 shadow-(--hig-bar-shadow) backdrop-blur-[20px] backdrop-saturate-150">
          {confirming ? (

            <div
              role="alert"
              className="flex animate-fade-in items-center gap-2.5 rounded-[20px] bg-(--hig-accent-tint) px-4 py-2.5"
            >
              <p className="min-w-0 flex-1 text-[13.5px] font-medium leading-snug text-(--hig-label)">
                {primary.label}?
              </p>
              <button
                type="button"
                onClick={() => setConfirming(false)}

                className="shrink-0 rounded-xl bg-(--hig-card) px-4 py-3.5 text-[13.5px] font-semibold text-(--hig-label-secondary) shadow-(--hig-bar-shadow) transition-transform duration-200 active:scale-95"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runAction}
                disabled={act.isPending}
                className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-(--hig-accent) px-4 py-3.5 text-[13.5px] font-semibold text-white transition-transform duration-200 active:scale-95 disabled:opacity-60"
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

            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-(--hig-accent) py-4 text-[15px] font-semibold text-white transition-transform duration-200 active:scale-[0.98]"
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

function LoadablePhoto({
  src,
  alt,
  eager,
  onOpen,
}: {
  src: string;
  alt: string;
  eager?: boolean;
  onOpen: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`View ${alt} full screen`}
      className="group absolute inset-0 h-full w-full cursor-zoom-in"
    >
      {!loaded && (
        <span
          className="absolute inset-0 animate-pulse bg-(--hig-separator)"
          aria-hidden="true"
        />
      )}
      <img
        src={src}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
      {}
      <span
        className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5">
          <path d="M15 3h6v6" />
          <path d="M9 21H3v-6" />
          <path d="M21 3l-7 7" />
          <path d="M3 21l7-7" />
        </svg>
      </span>
    </button>
  );
}

function DetailSkeleton() {
  const bar = "animate-pulse rounded bg-(--hig-separator)";
  return (
    <div className="mx-auto w-full max-w-107.5 px-4">
      <div className={`mt-6 h-2.5 w-24 ${bar}`} />
      <div className={`mt-3 h-7 w-3/4 ${bar}`} />
      <div className="mt-4 flex items-center gap-2.5">
        <div className={`h-10 w-10 shrink-0 rounded-full ${bar}`} />
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
        <div className={`aspect-3/4 ${bar}`} />
        <div className={`aspect-3/4 ${bar}`} />
      </div>
      <div className={`mt-8 h-40 ${bar}`} />
      <div className={`mt-6 h-44 ${bar}`} />
    </div>
  );
}

export default function JobDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [payOpen, setPayOpen] = useState(false);

  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);

  const jobQ = useJob(id);

  const job = jobQ.data;
  const overdue = job ? isOverdue(job) : false;

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [lightbox]);

  const ref = job?.styleRef?.[0];
  const fin = job?.finishedJob?.[0];

  const shots = (job?.styleRef ?? []).length + (job?.finishedJob ?? []).length;

  const rails = useMemo(() => (job ? milestones(job) : []), [job]);
  const doneCount = rails.filter((m) => m.state === "done").length;

  return (
    <main className="hig min-h-dvh bg-(--hig-grouped) pb-44 text-(--hig-label) transition-colors duration-300">
      {}
      <header className="sticky top-0 z-30 border-b border-(--hig-separator) bg-(--hig-bar)/80 backdrop-blur-[20px] backdrop-saturate-150">
        <div className="mx-auto flex w-full max-w-107.5 items-center justify-between px-4 py-1.5">
          <button
            type="button"
            aria-label="Back to jobs"

            onClick={() => (window.history.length > 1 ? router.back() : router.push("/jobs"))}
            className="flex h-11 w-11 items-center justify-center rounded-full text-[20px] text-(--hig-accent) transition-transform duration-200 active:scale-90"
          >
            ‹
          </button>
          <h1 className="text-[15px] font-semibold tracking-[-0.01em]">Inspection</h1>
          <ThemeToggle />
        </div>
      </header>

      {jobQ.isError ? (

        <div className="mx-auto mt-24 w-full max-w-107.5 px-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-(--hig-danger-tint) text-(--hig-danger)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="h-6 w-6" aria-hidden="true">
              <path d="M12 8.5v5" />
              <path d="M12 17.2v.1" />
              <path d="M10.3 4.2 2.9 17a1.9 1.9 0 0 0 1.65 2.85h14.9A1.9 1.9 0 0 0 21.1 17L13.7 4.2a1.9 1.9 0 0 0-3.4 0Z" />
            </svg>
          </div>
          <p className="mt-4 text-[16px] font-medium">Couldn&apos;t open this job.</p>
          <p className="mt-1 text-[13px] text-(--hig-label-secondary)">
            {jobQ.error instanceof Error ? jobQ.error.message : "Check your connection and try again."}
          </p>
          <button
            type="button"
            onClick={() => jobQ.refetch()}
            className="mt-5 rounded-[13px] bg-(--hig-accent) px-6 py-3 text-[14px] font-semibold text-white transition-transform duration-200 active:scale-95"
          >
            Retry
          </button>
        </div>
      ) : !job ? (
        <DetailSkeleton />
      ) : (
        <>
          {}
          <div
            className="hig-rise mx-auto w-full max-w-107.5 px-4 pt-6"
            style={{ animationDelay: "0ms" }}
          >
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-(--hig-label-tertiary)">
              Order file · <span className="[font-variant-numeric:tabular-nums]">{job.id.slice(0, 8)}</span>
            </p>
            <h1 className="mt-2 text-[26px] font-medium leading-8 tracking-[-0.02em]">
              {job.description || "Garment"}
            </h1>

            {}
            <div className="mt-4 flex items-center gap-2.5">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-[13px] font-semibold"
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
                <p className="mt-0.5 truncate text-[12px] text-(--hig-label-secondary)">
                  {job.customerPhone ?? "no phone on file"}
                </p>
              </div>
              {job.customerPhone && (

                <a
                  href={`tel:${job.customerPhone.replace(/[^\d+]/g, "")}`}
                  aria-label={`Call ${job.customerPhone}`}
                  title={`Call ${job.customerPhone}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center text-(--hig-accent) transition-transform duration-200 active:scale-90"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-7 w-7"
                    aria-hidden="true"
                  >
                    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.4 2.1L8.1 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.6 2Z" />
                  </svg>
                </a>
              )}
            </div>

            {}
            <div className="mt-5 flex border-t border-dashed border-(--hig-separator) pt-3.5">
              <div className="flex-1">
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.07em] text-(--hig-label-tertiary)">
                  Placed
                </p>
                <p className="mt-1 text-[14px] font-medium [font-variant-numeric:tabular-nums]">
                  {fmtISO(job.createdAt)}
                </p>
              </div>
              <div className="border-l border-dashed border-(--hig-separator) pl-4">
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.07em] text-(--hig-label-tertiary)">
                  Due
                </p>
                <p
                  className={`mt-1 text-[14px] font-medium [font-variant-numeric:tabular-nums] ${
                    overdue
                      ? "text-(--hig-danger)"
                      : job.dueDate
                        ? "text-(--hig-accent)"
                        : "text-(--hig-label-tertiary)"
                  }`}
                >
                  {job.dueDate ? fmtDay(job.dueDate) : "—"}
                </p>
              </div>
            </div>
          </div>

          {}
          <section
            className="hig-rise mx-auto mt-6 w-full max-w-107.5 px-4"
            style={{ animationDelay: "40ms" }}
          >
            <div className="grid grid-cols-2 gap-3">
              {}
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-(--hig-label-tertiary)">
                  <span className="h-1.5 w-1.5 rounded-full bg-(--hig-label-tertiary)" aria-hidden="true" />
                  Reference
                </p>
                <div className="relative aspect-3/4 overflow-hidden rounded-[20px] bg-(--hig-fill) shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
                  {ref?.url ? (
                    <LoadablePhoto
                      src={ref.url}
                      alt={ref.alt || "Style reference"}
                      eager
                      onOpen={() => setLightbox({ src: ref.url!, alt: ref.alt || "Style reference" })}
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-(--hig-label-tertiary)">
                      <IconPhoto className="h-8 w-8" />
                      <span className="px-6 text-center text-[11px]">no reference on file</span>
                    </div>
                  )}
                </div>
                <p className="mt-1.5 truncate text-center text-[11px] text-(--hig-label-tertiary)">
                  {ref?.alt ?? "—"}
                </p>
              </div>

              {}
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-(--hig-label-secondary)">
                  <span className="h-1.5 w-1.5 rounded-full bg-(--hig-accent)" aria-hidden="true" />
                  Finished
                </p>
                {fin?.url ? (
                  <div className="relative aspect-3/4 overflow-hidden rounded-[20px] bg-(--hig-fill) shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
                    <LoadablePhoto
                      src={fin.url}
                      alt={fin.alt || "Finished piece"}
                      onOpen={() => setLightbox({ src: fin.url!, alt: fin.alt || "Finished piece" })}
                    />
                  </div>
                ) : (
                  <div className="flex aspect-3/4 flex-col items-center justify-center gap-2 rounded-[20px] border-[1.5px] border-dashed border-(--hig-separator) text-(--hig-label-tertiary)">
                    <IconPhoto className="h-8 w-8" />
                    <span className="px-6 text-center text-[11px] leading-relaxed">
                      Waiting for the finished shot
                    </span>
                  </div>
                )}
                <p className="mt-1.5 truncate text-center text-[11px] text-(--hig-label-tertiary)">
                  {fin?.alt ?? (shots > 0 ? "will appear here" : "—")}
                </p>
              </div>
            </div>
          </section>

          {}
          <section
            className="hig-rise mx-auto mt-7 w-full max-w-107.5 px-4"
            style={{ animationDelay: "80ms" }}
          >
            <div className="mb-2.5 flex items-baseline justify-between px-0.5">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-secondary)">
                The rail
              </h2>
              <span className="text-[11.5px] text-(--hig-label-tertiary) [font-variant-numeric:tabular-nums]">
                {doneCount} of 4
              </span>
            </div>
            <div className="rounded-[20px] bg-(--hig-card) px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
              {rails.map((m) => (
                <div key={m.label} className="relative flex gap-3 pb-4 last:pb-1.5">
                  {}
                  <span
                    className="absolute bottom-0 left-2.25 top-6 border-l-[1.5px] border-dashed border-(--hig-separator)"
                    aria-hidden="true"
                  />
                  <span
                    className={`relative z-10 mt-0.5 flex h-4.75 w-4.75 shrink-0 items-center justify-center rounded-full text-[10px] text-white ${
                      m.state === "done"
                        ? "bg-(--hig-success)"
                        : m.state === "now"
                          ? "bg-(--hig-accent) shadow-[0_0_0_4px_var(--hig-accent-tint)]"
                          : m.state === "over"
                            ? "bg-(--hig-danger)"
                            : "bg-(--hig-fill) shadow-[inset_0_0_0_1.5px_var(--hig-separator)]"
                    }`}
                    aria-hidden="true"
                  >
                    {m.state === "done" ? "✓" : ""}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-[14px] font-medium leading-tight ${
                        m.state === "now"
                          ? "text-(--hig-accent)"
                          : m.state === "over"
                            ? "text-(--hig-danger)"
                            : ""
                      }`}
                    >
                      {m.label}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-(--hig-label-tertiary)">{m.sub}</p>
                  </div>
                  {m.tag && (
                    <p
                      className={`pt-0.5 text-[11.5px] ${
                        m.state === "over"
                          ? "font-medium text-(--hig-danger)"
                          : "text-(--hig-label-tertiary)"
                      }`}
                    >
                      {m.tag}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>

          {}
          <section
            className="hig-rise mx-auto mt-7 w-full max-w-107.5 px-4"
            style={{ animationDelay: "120ms" }}
          >
            <div className="mb-2.5 flex items-baseline justify-between px-0.5">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-secondary)">
                The tape
              </h2>
              <span className="text-[11.5px] text-(--hig-label-tertiary) [font-variant-numeric:tabular-nums]">
                {Object.keys(job.measurements ?? {}).length} taken
              </span>
            </div>
            <Tape job={job} />
          </section>

          {}
          <section
            className="hig-rise mx-auto mt-7 w-full max-w-107.5 px-4"
            style={{ animationDelay: "160ms" }}
          >
            <div className="mb-2.5 flex items-baseline justify-between px-0.5">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-secondary)">
                The money
              </h2>
              <span className="text-[11.5px] text-(--hig-label-tertiary) [font-variant-numeric:tabular-nums]">
                {(job.payments ?? []).length} payments
              </span>
            </div>
            <Money job={job} onRecord={() => setPayOpen(true)} />
          </section>

          <p
            className="hig-rise mx-auto mt-6 w-full max-w-107.5 px-4 text-center text-[11.5px] leading-relaxed text-(--hig-label-tertiary)"
            style={{ animationDelay: "200ms" }}
          >
            Placed {fmtISO(job.createdAt)}
            {job.dueDate ? ` · due ${fmtDay(job.dueDate)}` : ""} · photos update when the
            finished piece lands.
          </p>
        </>
      )}

      {}
      {job && <ActionBar job={job} />}
      {job && (
        <PaymentSheet job={job} open={payOpen} onClose={() => setPayOpen(false)} />
      )}

      {}
      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.alt}
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/90 px-4"
        >
          <img
            src={lightbox.src}
            alt={lightbox.alt}
            className="max-h-[88dvh] w-auto max-w-full rounded-lg object-contain shadow-2xl"
          />
          <button
            type="button"
            aria-label="Close"
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            ✕
          </button>
        </div>
      )}
    </main>
  );
}