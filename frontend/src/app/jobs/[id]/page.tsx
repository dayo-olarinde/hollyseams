"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { EditJobSheet } from "@/components/jobs/edit-job-sheet";
import { PaymentSheet } from "@/components/jobs/payment-sheet";
import { DetailHeader } from "@/components/ui/detail-header";
import { useToast } from "@/components/ui/toast";
import { JobDetailSkeleton } from "@/components/ui/skeletons";
import { useDeleteJob, useJob } from "@/hooks/use-jobs";
import { ApiError } from "@/lib/api/transport";
import { formatMeasurement } from "@/lib/measurement-input";
import {
  cmOf,
  formatDay,
  formatStampDay,
  isOverdue,
  naira,
} from "@/lib/format";
// The list card and this file render the same state from one source of truth.
import { dueCountdown, jobStage } from "@/lib/job-stage";
import { waMe } from "@/lib/contact";
import { useDismiss } from "@/lib/use-dismiss";
import type { Job } from "@/types/job";

interface Milestone {
  label: string;
  sub: string;
  state: "done" | "now" | "future" | "over";
  tag?: string;
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

/**
 * The four production stages, in the order the garment actually moves.
 *
 * The hero card draws these as Stitch's horizontal pipeline; the states are the same
 * `done | now | future | over` vocabulary the old vertical rail used — computed once here, so
 * the stepper, the callout row and the stage chip can never tell three different stories.
 */
function milestones(j: Job): Milestone[] {
  const ready = j.status === "completed" && !j.deliveredAt;
  const delivered = !!j.deliveredAt;
  const over = isOverdue(j);
  const ms: Milestone[] = [
    { label: "Placed", sub: formatStampDay(j.createdAt), state: "done" },
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
    ms.push({
      label: "On the bench",
      sub: "in progress",
      state: "over",
      tag: "past due",
    });
  } else {
    ms.push({
      label: "On the bench",
      sub: "in progress",
      state: "now",
      tag: "now",
    });
  }

  ms.push({
    label: "Ready to collect",
    sub: delivered ? formatStampDay(j.deliveredAt!) : "—",
    state: delivered ? "done" : ready ? "now" : "future",
    tag: ready ? "now" : undefined,
  });
  ms.push({
    label: "Delivered",
    sub: delivered ? formatStampDay(j.deliveredAt!) : "—",
    state: delivered ? "done" : "future",
  });
  return ms;
}

function Tape({ job }: { job: Job }) {
  const entries = Object.entries(job.measurements ?? {});
  if (entries.length === 0) {
    return (
      <div className="stitch-card rounded-[20px] px-4 py-6 text-center text-[12.5px] text-(--hig-label-tertiary)">
        No measurements on file for this fitting.
      </div>
    );
  }
  return (
    <div className="stitch-card grid grid-cols-2 rounded-[20px] px-4 py-1.5">
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
                {formatMeasurement(value)}
                <em className="ml-0.5 text-[13px] font-medium not-italic text-(--hig-label-secondary)">″</em>
                {typeof value === "number" && (
                  <em className="ml-1.5 text-[9.5px] font-medium not-italic text-(--hig-label-tertiary) [font-variant-numeric:tabular-nums]">
                    ({cmOf(value)} cm)
                  </em>
                )}
              </>
            )}
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * The payment status chip, derived the way the money actually is.
 *
 * "Partial deposit" in the design maps to a real question with three real answers — nothing
 * recorded yet, some recorded, or settled — computed from the payment rows, never guessed.
 */
function paymentChip(paid: number, agreed: number) {
  if (agreed > 0 && paid >= agreed) {
    return {
      chip: "bg-(--hig-success-tint) text-(--hig-success)",
      label: "Paid in full",
    };
  }
  if (paid > 0) {
    return {
      chip: "bg-(--hig-accent-tint) text-(--hig-accent)",
      label: "Part payment",
    };
  }
  return {
    chip: "bg-(--hig-warning-tint) text-(--hig-warning)",
    label: "Nothing recorded",
  };
}

/**
 * The Garment Ledger — Stitch's financial summary card, on our real payment rows.
 *
 * Two figures in wells (agreed / collected), the balance in the highlight strip, and the
 * itemised history underneath — every number from the same source (`job.payments`), so the
 * strip, the bar and the rows can never disagree with each other.
 */
function Money({ job, onRecord }: { job: Job; onRecord: () => void }) {
  const payments = job.payments ?? [];
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const balance = Math.max(0, job.agreedPrice - paid);
  const pct =
    job.agreedPrice > 0 ? Math.min(100, (paid / job.agreedPrice) * 100) : 0;
  const status = paymentChip(paid, job.agreedPrice);

  return (
    <div className="stitch-card rounded-[20px] px-4 py-4">
      {/* Card head: what this ledger is, and where it stands */}
      <div className="flex items-center justify-between border-b border-(--hig-separator) pb-3">
        <div>
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-(--hig-label-tertiary)">
            Garment ledger
          </p>
          <h3 className="mt-0.5 text-[15px] font-semibold">Payment status</h3>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.chip}`}
        >
          {status.label}
        </span>
      </div>

      {/* The two figures, in Stitch's inset wells */}
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <div className="rounded-xl bg-(--hig-fill) p-3">
          <p className="text-[10.5px] font-medium text-(--hig-label-secondary)">
            Total fee
          </p>
          <p className="mt-0.5 text-[19px] font-semibold tracking-[-0.02em] [font-variant-numeric:tabular-nums]">
            {naira(job.agreedPrice)}
          </p>
          <p className="mt-0.5 text-[10px] text-(--hig-label-tertiary)">
            Agreed at intake
          </p>
        </div>
        <div className="rounded-xl bg-(--hig-fill) p-3">
          <p className="text-[10.5px] font-medium text-(--hig-success)">
            Collected
          </p>
          <p className="mt-0.5 text-[19px] font-semibold tracking-[-0.02em] text-(--hig-success) [font-variant-numeric:tabular-nums]">
            {naira(paid)}
          </p>
          <p className="mt-0.5 text-[10px] text-(--hig-label-tertiary)">
            {payments.length} payment{payments.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {/* Balance strip */}
      <div className="mt-3 flex items-center justify-between rounded-xl bg-(--hig-filter-well) p-3">
        <div>
          <p className="text-[11.5px] font-medium text-(--hig-label-secondary)">
            Remaining balance
          </p>
          <p className="text-[10.5px] text-(--hig-label-tertiary)">
            {balance > 0 ? "Collect on delivery or before" : "Nothing outstanding"}
          </p>
        </div>
        <div className="text-right">
          <span
            className={`text-[20px] font-semibold [font-variant-numeric:tabular-nums] ${
              balance > 0 ? "text-(--hig-warning)" : "text-(--hig-success)"
            }`}
          >
            {naira(balance)}
          </span>
          <span className="block text-[10px] font-medium text-(--hig-label-tertiary)">
            {balance > 0 ? "Outstanding" : "Settled"}
          </span>
        </div>
      </div>

      {/* Progress: the same numbers, drawn */}
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-(--hig-fill)">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${
            balance > 0 ? "bg-(--hig-accent)" : "bg-(--hig-success)"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* The itemised history */}
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
                {formatStampDay(p.paidAt)}
              </p>
            </div>
            <p className="text-[13.5px] font-medium [font-variant-numeric:tabular-nums]">
              {naira(p.amount)}
            </p>
          </div>
        ))}
        {payments.length === 0 && (
          <p className="border-t border-dashed border-(--hig-separator) py-3 text-center text-[11.5px] text-(--hig-label-tertiary)">
            Nothing recorded yet.
          </p>
        )}
      </div>

      {/* The record action only exists while money is still owed — once the ledger
          reads "Paid in full" there is nothing to record, so the button leaves and
          the card closes on the history. Same `balance` the strip above uses, so the
          button and the strip can never disagree. */}
      {balance > 0 && (
        <button
          type="button"
          onClick={onRecord}
          className="mt-3 w-full rounded-[13px] bg-(--hig-accent-tint) py-3 text-[13.5px] font-semibold text-(--hig-accent) transition-transform duration-200 active:scale-[0.98]"
        >
          + Record a payment
        </button>
      )}
    </div>
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
      <span
        className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="h-3.5 w-3.5"
        >
          <path d="M15 3h6v6" />
          <path d="M9 21H3v-6" />
          <path d="M21 3l-7 7" />
          <path d="M3 21l7-7" />
        </svg>
      </span>
    </button>
  );
}

/**
 * The production pipeline, Stitch-style: four horizontal segments under the hero.
 *
 * Done stages fill solid with a check; the active one carries the pulsing dot; future ones
 * stay empty. The old vertical rail said exactly this with a taller layout — the horizontal
 * form is the design's, and it leaves room for the ledger below the fold to be seen sooner.
 */
function Pipeline({ rails, phrase }: { rails: Milestone[]; phrase: string }) {
  return (
    <div className="mt-4 border-t border-(--hig-separator) pt-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-(--hig-label-tertiary)">
          Production pipeline
        </span>
        <span className="text-[10px] font-medium text-(--hig-accent) [font-variant-numeric:tabular-nums]">
          {rails.filter((m) => m.state === "done").length} of {rails.length}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {rails.map((m) => {
          const done = m.state === "done";
          const now = m.state === "now";
          const over = m.state === "over";
          return (
            <div key={m.label} className="flex flex-col items-center gap-1">
              <div
                className={`relative h-1.5 w-full rounded-full ${
                  done
                    ? over
                      ? "bg-(--hig-danger)"
                      : "bg-(--hig-accent)"
                    : now
                      ? "bg-(--hig-accent)/40"
                      : "bg-(--hig-separator)"
                }`}
              >
                {now && (
                  <span className="hig-ping absolute -top-1 left-1/2 h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-(--hig-card) bg-(--hig-accent)" />
                )}
              </div>
              <span
                className={`flex items-center gap-0.5 text-[9.5px] font-medium ${
                  now
                    ? "text-(--hig-accent)"
                    : over
                      ? "text-(--hig-danger)"
                      : done
                        ? "text-(--hig-label-secondary)"
                        : "text-(--hig-label-tertiary)"
                }`}
              >
                {done && !over ? "✓ " : ""}
                {m.label.replace("On the bench", "Bench").replace("Ready to collect", "Ready")}
              </span>
            </div>
          );
        })}
      </div>
      {/* Active-stage callout: the phrase the list card uses — one vocabulary everywhere. */}
      <div className="mt-3 flex items-center justify-between rounded-xl border border-(--hig-separator) bg-(--hig-fill) px-3 py-2">
        <span className="text-[12px] text-(--hig-label)">{phrase}</span>
      </div>
    </div>
  );
}

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [payOpen, setPayOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(
    null,
  );

  const jobQ = useJob(id);

  const job = jobQ.data;

  const router = useRouter();
  const toast = useToast();
  const deleteJob = useDeleteJob();

  function handleDelete() {
    if (!job) return;
    deleteJob.mutate(job.id, {
      onSuccess: () => {
        toast.show({
          title: "Order torn up.",
          detail: `${job.description || "The order"} was deleted — nothing was paid against it.`,
        });
        router.replace("/dashboard?tab=jobs");
      },
      onError: (err) => {
        setConfirmDelete(false);
        toast.show({
          title: "Could not delete",
          detail: err instanceof Error ? err.message : "Something went wrong. Try again.",
        });
      },
    });
  }

  // The photo lightbox is a modal surface: Escape closes it, the page behind it stays locked.
  useDismiss(() => setLightbox(null), lightbox !== null);

  // The delete confirm is a modal alertdialog: Escape means "keep it", like every other sheet.
  useDismiss(() => setConfirmDelete(false), confirmDelete);

  // Every reference the job carries, not just the first: the slot holds up to two, and a
  // reference the studio bothered to attach should be on the file.
  const refs = job?.styleRef ?? [];
  const fin = job?.finishedJob?.[0];

  const shots = (job?.styleRef ?? []).length + (job?.finishedJob ?? []).length;

  const rails = useMemo(() => (job ? milestones(job) : []), [job]);
  const stage = job ? jobStage(job) : null;
  const countdown = job ? dueCountdown(job) : null;

  return (
    <main className="hig content-safe min-h-dvh bg-transparent text-(--hig-label) transition-colors duration-300">
      <DetailHeader
        title="Order file"
        fallbackHref="/dashboard?tab=jobs"
        actions={
          job && (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="flex h-9 items-center gap-1 rounded-full bg-(--hig-accent-tint) px-3.5 text-[13px] font-semibold text-(--hig-accent) transition-transform duration-200 active:scale-95"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
                aria-hidden="true"
              >
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
              Edit
            </button>
          )
        }
      />

      {jobQ.isError ? (
        <div className="mx-auto mt-24 w-full sm:max-w-107.5 px-4 text-center">
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
          <p className="mt-4 text-[16px] font-medium">
            Couldn&apos;t open this job.
          </p>
          <p className="mt-1 text-[13px] text-(--hig-label-secondary)">
            {jobQ.error instanceof ApiError && !jobQ.error.isNetworkError
              ? jobQ.error.message
              : "No connection — check your network and try again."}
          </p>
          <button
            type="button"
            onClick={() => void jobQ.refetch()}
            className="mt-5 rounded-[13px] bg-(--hig-accent) px-6 py-3 text-[14px] font-semibold text-white transition-transform duration-200 active:scale-95"
          >
            Retry
          </button>
        </div>
      ) : !job ? (
        <JobDetailSkeleton />
      ) : (
        <>
          {/* Hero card — Stitch's garment bento: chip + countdown, swatch + title + client, pipeline */}
          <div
            className="hig-rise mx-auto mt-4 w-full sm:max-w-107.5 px-4"
            style={{ animationDelay: "0ms" }}
          >
            <section className="stitch-card rounded-[20px] p-4">
              {/* Chip row: where the garment stands + the live countdown */}
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${stage!.chip}`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {stage!.label}
                </span>
                {countdown && (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      countdown.late
                        ? "bg-(--hig-danger-tint) text-(--hig-danger)"
                        : "bg-(--hig-accent-tint) text-(--hig-accent)"
                    }`}
                  >
                    {countdown.text}
                  </span>
                )}
              </div>

              {/* Title block: garment, client, deadline.
                  No swatch here — the gallery below owns photos at full size, and the list's
                  thumbnail (server-side `coverUrl`, which prefers the finished shot) is where a
                  small image earns its keep. Duplicating it in the hero bought nothing. */}
              <div className="mt-1 flex items-start gap-3.5">
                <div className="min-w-0 flex-1">
                  <h1 className="text-[19px] font-semibold leading-6 tracking-[-0.01em]">
                    {job.description || "Garment"}
                  </h1>
                  <p className="mt-1 flex items-center gap-1 text-[13px] font-medium text-(--hig-label-secondary)">
                    {job.subjectName ?? "Client"}
                    <span className="text-(--hig-label-tertiary)">·</span>
                    <span className="truncate text-[12px]">
                      {job.customerPhone ?? "no phone on file"}
                    </span>
                  </p>
                  <p
                    className={`mt-1 flex items-center gap-1 text-[12px] font-medium ${stage!.dueTone}`}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      className="h-3.5 w-3.5"
                      aria-hidden="true"
                    >
                      <rect x="3.5" y="5" width="17" height="16" rx="3" />
                      <path d="M3.5 10h17" />
                      <path d="M8 3v4" />
                      <path d="M16 3v4" />
                    </svg>
                    {stage!.due === "—"
                      ? `Placed ${formatStampDay(job.createdAt)}`
                      : stage!.due}
                  </p>
                </div>
              </div>

              <Pipeline rails={rails} phrase={stage!.phrase} />

              {/* Client actions: real phone, real WhatsApp deep link */}
              {job.customerPhone && (
                <div className="mt-3 flex items-center gap-2">
                  <a
                    href={`tel:${job.customerPhone.replace(/[^\d+]/g, "")}`}
                    className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-(--hig-separator) bg-(--hig-fill) text-[13px] font-semibold text-(--hig-label) transition-transform duration-200 active:scale-[0.97]"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4 text-(--hig-accent)"
                      aria-hidden="true"
                    >
                      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.4 2.1L8.1 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.6 2Z" />
                    </svg>
                    Call
                  </a>
                  <a
                    href={waMe(job.customerPhone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-(--hig-separator) bg-(--hig-fill) text-[13px] font-semibold text-(--hig-label) transition-transform duration-200 active:scale-[0.97]"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4 text-(--hig-success)"
                      aria-hidden="true"
                    >
                      <path d="M12 3.5a8.5 8.5 0 0 0-7.3 12.8L3.5 20.5l4.3-1.1A8.5 8.5 0 1 0 12 3.5Z" />
                      <path d="M9 8.5c.5 2.5 3 5 6.5 6.5l1-1.8-2-1.2-1 .7c-.8-.5-1.7-1.4-2.2-2.2l.7-1-1.2-2-1.8 1Z" />
                    </svg>
                    WhatsApp
                  </a>
                </div>
              )}
            </section>
          </div>

          {/* Photos — the intake reference beside the finished piece */}
          <section
            className="hig-rise mx-auto mt-5 w-full sm:max-w-107.5 px-4"
            style={{ animationDelay: "40ms" }}
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-(--hig-label-tertiary)">
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-(--hig-label-tertiary)"
                    aria-hidden="true"
                  />
                  Reference
                </p>
                <div className="relative aspect-3/4 overflow-hidden rounded-[20px] bg-(--hig-fill) shadow-(--hig-card-shadow)">
                  {refs.length > 0 ? (
                    // Two references share the frame as two rows with a hairline between them —
                    // the client's two angles, without the column growing taller than the
                    // finished shot beside it.
                    <div
                      className={`absolute inset-0 grid gap-px bg-(--hig-separator) ${
                        refs.length > 1 ? "grid-rows-2" : "grid-rows-1"
                      }`}
                    >
                      {refs.map((photo) => (
                        <div
                          key={photo.publicId ?? photo.url}
                          className="relative overflow-hidden"
                        >
                          <LoadablePhoto
                            src={photo.url}
                            alt={photo.alt || "Style reference"}
                            eager
                            onOpen={() =>
                              setLightbox({
                                src: photo.url,
                                alt: photo.alt || "Style reference",
                              })
                            }
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-(--hig-label-tertiary)">
                      <IconPhoto className="h-8 w-8" />
                      <span className="px-6 text-center text-[11px]">
                        no reference on file
                      </span>
                    </div>
                  )}
                </div>
                <p className="mt-1.5 truncate text-center text-[11px] text-(--hig-label-tertiary)">
                  {refs.length > 0
                    ? refs.map((photo) => photo.alt).join(" · ")
                    : "—"}
                </p>
              </div>

              <div>
                <p className="mb-1.5 flex items-center gap-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-(--hig-label-secondary)">
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-(--hig-accent)"
                    aria-hidden="true"
                  />
                  Finished
                </p>
                {fin?.url ? (
                  <div className="relative aspect-3/4 overflow-hidden rounded-[20px] bg-(--hig-fill) shadow-(--hig-card-shadow)">
                    <LoadablePhoto
                      src={fin.url}
                      alt={fin.alt || "Finished piece"}
                      onOpen={() =>
                        setLightbox({
                          src: fin.url!,
                          alt: fin.alt || "Finished piece",
                        })
                      }
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

          {/* The tape */}
          <section
            className="hig-rise mx-auto mt-6 w-full sm:max-w-107.5 px-4"
            style={{ animationDelay: "80ms" }}
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

          {/* The ledger */}
          <section
            className="hig-rise mx-auto mt-6 w-full sm:max-w-107.5 px-4"
            style={{ animationDelay: "120ms" }}
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
            className="hig-rise mx-auto mt-6 w-full sm:max-w-107.5 px-4 text-center text-[11.5px] leading-relaxed text-(--hig-label-tertiary)"
            style={{ animationDelay: "160ms" }}
          >
            Placed {formatStampDay(job.createdAt)}
            {job.dueDate ? ` · due ${formatDay(job.dueDate)}` : ""} · photos
            update when the finished piece lands.
          </p>
        </>
      )}

      {job && payOpen && (
        <PaymentSheet job={job} onClose={() => setPayOpen(false)} />
      )}
      {job && editOpen && (
        <EditJobSheet
          job={job}
          onClose={() => setEditOpen(false)}
          onDelete={() => {
            setEditOpen(false);
            setConfirmDelete(true);
          }}
        />
      )}

      {job && confirmDelete && (
        <div className="fixed inset-0 z-60" role="alertdialog" aria-modal="true" aria-label="Delete order">
          <button
            type="button"
            aria-label="Cancel"
            onClick={() => setConfirmDelete(false)}
            className="absolute inset-0 w-full animate-fade-in bg-black/50"
          />
          <div className="hig absolute inset-x-0 bottom-0 mx-auto w-full sm:max-w-107.5 animate-sheet-in rounded-t-[26px] border border-b-0 border-(--hig-separator) bg-(--hig-card) px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-2 shadow-[0_-30px_80px_-20px_rgba(0,0,0,0.5)]">
            <div className="mx-auto h-1 w-9.5 rounded-full bg-(--hig-separator)" aria-hidden="true" />
            <div className="mx-auto mt-5 flex h-13 w-13 items-center justify-center rounded-full border border-(--hig-danger)/40 bg-(--hig-danger-tint)">
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--hig-danger)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5.5 w-5.5" aria-hidden="true">
                <path d="M4 7h16" />
                <path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2" />
                <path d="M6.5 7l1 12a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l1-12" />
                <path d="M10 11v5" /><path d="M14 11v5" />
              </svg>
            </div>
            <h2 className="mt-3 text-center text-[20px] font-medium tracking-[-0.005em] text-(--hig-label)">
              Tear up this order?
            </h2>
            <p className="mx-auto mt-2 max-w-72 text-center text-[13px] leading-snug text-(--hig-label-secondary)">
              <b className="font-medium text-(--hig-label)">{job.description || "This order"}</b> has no
              payments, so it can be deleted — photos and all. This cannot be undone.
            </p>
            <div className="mt-5 flex w-full gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="relative flex-1 rounded-[15px] border border-(--hig-separator) bg-(--hig-fill) py-3.5 text-[14px] font-semibold text-(--hig-label-secondary) transition-transform active:scale-[0.98] after:absolute after:-inset-2 after:content-['']"
              >
                Keep it
              </button>
              <button
                type="button"
                disabled={deleteJob.isPending}
                onClick={handleDelete}
                className="relative flex-1 rounded-[15px] bg-(--hig-danger) py-3.5 text-[14px] font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-60 after:absolute after:-inset-2 after:content-['']"
              >
                {deleteJob.isPending ? (
                  <span className="mx-auto flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
                    Deleting…
                  </span>
                ) : (
                  "Delete"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.alt}
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/90 px-4"
        >
          <img loading="lazy"
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
