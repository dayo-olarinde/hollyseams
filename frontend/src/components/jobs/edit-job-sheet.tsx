"use client";

import { useState } from "react";
import { useDismiss } from "@/components/customers/customer-sheets";
import { PhotoPicker, type PickedPhoto } from "@/components/jobs/photo-picker";
import { useToast } from "@/components/ui/toast";
import { useUpdateJob } from "@/hooks/use-jobs";
import { formatDay, formatStampDay } from "@/lib/format";
import type { Job, UpdateJobInput } from "@/types/job";

/**
 * The order file's edit sheet — one surface for "change the order".
 *
 * Being smart about scope: the sheet edits exactly the fields the studio actually revises
 * mid-flight (description, price, due date) plus the one flow that *defines* this screen —
 * attaching the finished piece when it's ready. Status is deliberately absent: the one-tap
 * switcher on the jobs list owns state changes, and two owners for one field is how drift starts.
 *
 * Everything saves through `PATCH /jobs/:id`, which the backend treats atomically: photos are
 * verified against Cloudinary, swapped, and the removed ones are destroyed server-side. The
 * client's only duty is to send the *complete desired state* of `finishedJob` — which is why the
 * PhotoPicker reports the full set, not a delta.
 */
export function EditJobSheet({
  job,
  onClose,
  onDelete,
}: {
  job: Job;
  onClose: () => void;
  /**
   * The destructive exit for this order. The sheet owns the confirm step (type-to-confirm is
   * overkill for a one-tap business, but a two-tap confirm with the consequence spelled out is
   * not), and the page owns the actual deletion — the sheet only reports intent.
   */
  onDelete?: () => void;
}) {
  const toast = useToast();
  const updateJob = useUpdateJob();

  const [description, setDescription] = useState(job.description);
  const [price, setPrice] = useState(String(job.agreedPrice));
  const [dueDate, setDueDate] = useState(
    job.dueDate ? job.dueDate.slice(0, 10) : "",
  );
  const [error, setError] = useState<string | null>(null);

  // The complete desired state of finishedJob: whatever the job already has, plus/minus what the
  // picker reports. Sending only a delta would delete everything the studio wants to keep.
  const existingPhotos: PickedPhoto[] = (job.finishedJob ?? []).map((p) => ({
    publicId: p.publicId ?? "",
    url: p.url,
    alt: p.alt,
  }));
  const [finished, setFinished] = useState<PickedPhoto[]>(existingPhotos);

  useDismiss(onClose);

  // Dirty check: an untouched sheet shouldn't pretend it has work to save.
  const priceNum = Number(price.replace(/[^\d.]/g, ""));
  const photoSetChanged = (): boolean => {
    const a = new Set(finished.map((p) => p.publicId));
    const b = new Set(existingPhotos.map((p) => p.publicId));
    if (a.size !== b.size) return true;
    for (const id of a) if (!b.has(id)) return true;
    return false;
  };
  const dirty =
    description !== job.description ||
    priceNum !== job.agreedPrice ||
    dueDate.slice(0, 10) !== (job.dueDate?.slice(0, 10) ?? "") ||
    photoSetChanged();

  const save = () => {
    setError(null);

    if (description.trim().length === 0) {
      setError("Describe the garment — the list card reads this.");
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setError("Set an agreed price above zero.");
      return;
    }

    const input: UpdateJobInput = {
      description: description.trim(),
      agreedPrice: priceNum,
      dueDate: dueDate ? new Date(`${dueDate}T12:00:00`).toISOString() : null,
      finishedJob: finished.map((p) => ({ publicId: p.publicId, alt: p.alt })),
    };

    // The hook's own onSettled invalidates the detail, lists, counts and reports.
    updateJob.mutate(
      { id: job.id, input },
      {
        onSuccess: () => {
          toast.show({
            title: "Order updated.",
            detail: "The job file now shows the new details.",
          });
          onClose();
        },
        onError: (err) =>
          setError(
            err instanceof Error ? err.message : "Could not save the changes.",
          ),
      },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label="Edit job"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 w-full animate-fade-in bg-black/50"
      />
      <div className="hig absolute inset-x-0 bottom-0 mx-auto w-full sm:max-w-107.5 animate-sheet-in rounded-t-[26px] bg-(--hig-canvas) backdrop-blur-xl px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-2 shadow-[0_-30px_80px_-20px_rgba(0,0,0,0.5)]">
        <div
          className="mx-auto h-1 w-9.5 rounded-full bg-(--hig-separator)"
          aria-hidden="true"
        />
        <div className="mt-3 flex items-center justify-between">
          <h2 className="text-[20px] font-medium tracking-[-0.005em]">
            Edit <span className="text-(--hig-accent)">order</span>
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
          Placed {formatStampDay(job.createdAt)}
          {job.dueDate ? ` · was due ${formatDay(job.dueDate)}` : ""}
        </p>

        {/* What the garment is */}
        <label className="mt-4 block text-[11px] font-semibold uppercase tracking-[0.08em] text-(--hig-label-tertiary)">
          Garment
        </label>
        <textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-1.5 w-full resize-none rounded-[13px] border border-(--hig-separator) bg-(--hig-fill) px-4 py-3 text-[14px] text-(--hig-label) outline-none transition-[border-color,box-shadow] focus:border-(--hig-accent) focus:shadow-[0_0_0_3px_var(--hig-accent-soft)]"
          placeholder="Blouse & Skirt — neatly crocheted"
        />

        {/* What it costs, and when it's due */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-(--hig-label-tertiary)">
              Agreed price
            </label>
            <div className="relative mt-1.5">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[15px] font-medium text-(--hig-accent)">
                ₦
              </span>
              <input
                inputMode="numeric"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full rounded-[13px] border border-(--hig-separator) bg-(--hig-fill) py-3 pl-9 pr-3 text-[15px] font-medium text-(--hig-label) outline-none transition-[border-color,box-shadow] focus:border-(--hig-accent) focus:shadow-[0_0_0_3px_var(--hig-accent-soft)] [font-variant-numeric:tabular-nums]"
                placeholder="0"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-(--hig-label-tertiary)">
              Due date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1.5 w-full rounded-[13px] border border-(--hig-separator) bg-(--hig-fill) px-3 py-3 text-[13px] font-medium text-(--hig-label) outline-none transition-[border-color,box-shadow] focus:border-(--hig-accent) focus:shadow-[0_0_0_3px_var(--hig-accent-soft)]"
            />
          </div>
        </div>

        {/* The finished piece — the flow that defines this screen */}
        <label className="mt-4 block text-[11px] font-semibold uppercase tracking-[0.08em] text-(--hig-label-tertiary)">
          Finished piece
        </label>
        <p className="mt-1 text-[11.5px] leading-4 text-(--hig-label-tertiary)">
          Attach photos when the garment is ready. Existing photos stay unless
          you remove them here.
        </p>
        <div className="mt-2">
          <PhotoPicker
            max={4}
            initial={existingPhotos}
            onChange={setFinished}
          />
        </div>

        {error && (
          <p className="mt-3 text-[12px] text-(--hig-danger)">{error}</p>
        )}

        <button
          type="button"
          disabled={updateJob.isPending || !dirty}
          onClick={save}
          className="mt-5 w-full rounded-[15px] bg-(--hig-accent) py-4 text-[15px] font-semibold text-white transition-transform duration-200 active:scale-[0.98] disabled:opacity-50"
        >
          {updateJob.isPending ? (
            <span className="mx-auto flex items-center justify-center gap-2">
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
                aria-hidden="true"
              />
              Saving…
            </span>
          ) : dirty ? (
            "Save changes"
          ) : (
            "Nothing changed yet"
          )}
        </button>

        {onDelete && (job.payments?.length ?? 0) === 0 && (
          <>
            <p className="mt-5 text-center text-[11px] leading-4 text-(--hig-label-tertiary)">
              Recorded a payment? Then this order is permanent — the ledger
              must stay whole.
            </p>
            <button
              type="button"
              disabled={updateJob.isPending}
              onClick={onDelete}
              className="relative mt-2 w-full rounded-[15px] border border-(--hig-danger)/40 py-3 text-[13.5px] font-semibold text-(--hig-danger) transition-transform duration-200 active:scale-[0.98] disabled:opacity-50 after:absolute after:-inset-2 after:content-['']"
            >
              Delete this order
            </button>
          </>
        )}
      </div>
    </div>
  );
}
