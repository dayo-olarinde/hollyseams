"use client";

import { useState } from "react";
import { useDismiss } from "@/components/customers/customer-sheets";
import { useToast } from "@/components/ui/toast";
import { useCreatePayment } from "@/hooks/use-jobs";
import { formatDay, naira, todayISO } from "@/lib/format";
import { newIdempotencyKey } from "@/lib/payment-intent";
import type { Job } from "@/types/job";

/**
 * The payment sheet — one surface, one intent.
 *
 * The idempotency contract lives in `lib/payment-intent.ts`; this component is its UI: the key
 * is minted once per opened sheet and survives retries, so a double-tap on a flaky network can
 * never become a double charge. Quick chips prefill the free-amount input from the live balance;
 * they never replace it.
 */
export function PaymentSheet({ job, onClose }: { job: Job; onClose: () => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(newIdempotencyKey);

  useDismiss(onClose);

  const payments = job.payments ?? [];
  const balance = Math.max(
    0,
    job.agreedPrice - payments.reduce((s, p) => s + p.amount, 0),
  );

  const amountNum = Number(amount.replace(/[^\d.]/g, ""));
  const valid =
    amount.trim() !== "" && Number.isFinite(amountNum) && amountNum > 0;

  const pay = useCreatePayment();

  /** Quick chips: real fractions of the real balance, prefilled into the input. */
  const quickChips = [
    balance > 0 && { label: "Full balance", value: balance },
    balance >= 2 && { label: "Half", value: Math.round(balance / 2) },
  ].filter(Boolean) as { label: string; value: number }[];

  const submitPayment = () =>
    pay.mutate(
      {
        jobId: job.id,
        amount: amountNum,
        paidAt: date ? new Date(date + "T12:00:00").toISOString() : undefined,
        idempotencyKey,
      },
      {
        onSuccess: () => {
          toast.show({
            title: "Payment recorded.",
            detail: `${naira(amountNum)} on ${formatDay(date)}`,
          });
          onClose();
        },
        onError: (err) =>
          setError(
            err instanceof Error
              ? err.message
              : "Could not record the payment.",
          ),
      },
    );

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label="Record a payment"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 w-full animate-fade-in bg-black/50"
      />
      <div className="hig absolute inset-x-0 bottom-0 mx-auto w-full sm:max-w-107.5 animate-sheet-in rounded-t-[26px] bg-(--hig-canvas) backdrop-blur-xl px-5 pb-[calc(18px+env(safe-area-inset-bottom))] pt-2 shadow-[0_-30px_80px_-20px_rgba(0,0,0,0.5)]">
        <div
          className="mx-auto h-1 w-9.5 rounded-full bg-(--hig-separator)"
          aria-hidden="true"
        />
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
            {naira(balance)}
          </b>
        </p>

        {/* Quick amounts — Stitch's chips, prefilled from the live balance */}
        {quickChips.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {quickChips.map((chip) => {
              const active = amountNum === chip.value;
              return (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => {
                    setAmount(String(chip.value));
                    setError(null);
                  }}
                  className={`rounded-xl px-3 py-2.5 text-left transition-all duration-200 active:scale-[0.98] ${
                    active
                      ? "border-2 border-(--hig-accent) bg-(--hig-accent-tint)"
                      : "border border-(--hig-separator) bg-(--hig-fill)"
                  }`}
                >
                  <span
                    className={`block text-[14px] font-semibold [font-variant-numeric:tabular-nums] ${
                      active ? "text-(--hig-accent)" : ""
                    }`}
                  >
                    {naira(chip.value)}
                  </span>
                  <span className="block text-[10px] text-(--hig-label-tertiary)">
                    {chip.label}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Free amount — always visible; the chips merely prefill it */}
        <div className="relative mt-3">
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

        {/* When the money landed */}
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

        {error && (
          <p className="mt-3 text-[12px] text-(--hig-danger)">{error}</p>
        )}

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
            `Record ${valid ? naira(amountNum) : "payment"}`
          )}
        </button>
      </div>
    </div>
  );
}
