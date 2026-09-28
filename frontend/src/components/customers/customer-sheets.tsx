"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import { createMeasurement } from "@/lib/api/measurements";
import { updateCustomer } from "@/lib/api/customers";
import { addSubject } from "@/lib/api/subjects";
import { keys } from "@/lib/query/keys";
import { measureLabel } from "@/lib/measurements";
import { parseMeasurementInput, formatMeasurementInput } from "@/lib/measurement-input";
import type { MeasurementValue } from "@/lib/measurement-input";
import { todayISO } from "@/lib/format";
import type { Customer } from "@/types/customer";

/**
 * The three sheets' shared mount behavior: lock body scroll behind the modal and let Escape
 * dismiss it. One hook, not three diverging copies — the escape hatch a keyboard user expects
 * from any dialog, and the lock that stops the page behind a sheet from scrolling on touch.
 */
export function useDismiss(onClose: () => void) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
}

/**
 * The client dossier's edit sheet — one surface for "change the client record".
 *
 * Deliberately two fields: name and phone are everything the schema carries. The sheet exists so
 * the pencil in the hero has somewhere to go, and so a typo fix never requires the new-job wizard.
 * Same chrome and dirty-check contract as the order file's edit sheet.
 */
export function EditCustomerSheet({
  customer,
  onClose,
}: {
  customer: Customer;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phoneNumber ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useDismiss(onClose);

  const dirty =
    name.trim() !== customer.name || phone.trim() !== (customer.phoneNumber ?? "");

  const save = () => {
    setError(null);
    if (name.trim().length < 2) {
      setError("The client's name needs at least 2 letters.");
      return;
    }
    const digits = phone.replace(/\D/g, "");
    if (digits.length > 0 && (digits.length < 7 || digits.length > 15)) {
      setError("That phone number doesn't look right.");
      return;
    }
    setSaving(true);
    updateCustomer(customer.id, {
      name: name.trim(),
      ...(phone.trim() ? { phoneNumber: phone.trim() } : { phoneNumber: "" }),
    })
      .then(() => {
        // The record itself, plus every surface that shows it: the tab's infinite list, the
        // wizard's picker cache, and the top-clients report whose names come from the same row.
        void queryClient.invalidateQueries({ queryKey: keys.customers.all });
        void queryClient.invalidateQueries({ queryKey: keys.reports.all });
        toast.show({ title: "Client updated.", detail: "The dossier shows the new details." });
        onClose();
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Could not save the changes."),
      )
      .finally(() => setSaving(false));
  };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Edit client">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 w-full animate-fade-in bg-black/50"
      />
      <div className="animate-rise absolute inset-x-0 bottom-0 mx-auto w-full max-w-[430px] rounded-t-[28px] bg-(--hig-grouped) backdrop-blur-xl pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-8px_40px_rgba(0,0,0,0.25)]">
        <div className="mx-auto mt-3 h-1 w-9 rounded-full bg-(--hig-separator)" />
        <div className="flex items-center justify-between px-5 pt-3">
          <h2 className="text-[17px] font-semibold tracking-[-0.01em]">Edit client</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1.5 text-[13px] font-medium text-(--hig-label-secondary)"
          >
            Cancel
          </button>
        </div>

        <div className="space-y-3.5 px-5 pt-4">
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-(--hig-label-secondary)">
              Name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field mt-1.5 w-full rounded-xl px-3.5 py-3 text-[14px] text-(--hig-label) outline-none"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-(--hig-label-secondary)">
              Phone
            </span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              placeholder="e.g. 08012345678"
              className="input-field mt-1.5 w-full rounded-xl px-3.5 py-3 text-[14px] text-(--hig-label) outline-none"
            />
          </label>
          {error && <p className="text-[12.5px] text-(--hig-danger)">{error}</p>}
        </div>

        <div className="px-5 pt-5">
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="w-full rounded-[14px] bg-(--hig-accent) py-3.5 text-[15px] font-semibold text-white transition-transform duration-200 active:scale-[0.98] disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The "+ Add family member" action — Stitch's switcher tail, made real.
 *
 * Creates the subject through `POST /customers/:id/subjects`, then invalidates the exact cache
 * entry the dossier's switcher reads (`customers.subjects`), which is also the entry the new-job
 * wizard fetches — so the next "New job" from this file offers the new person immediately.
 */
export function AddSubjectSheet({
  customer,
  onClose,
  onCreated,
}: {
  customer: Customer;
  onClose: () => void;
  /** Called with the new subject's id so the parent can open its switcher on the fresh tab. */
  onCreated?: (subjectId: string) => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("daughter");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useDismiss(onClose);

  const relationships = ["self", "spouse", "daughter", "son", "mother", "father", "other"];

  const save = () => {
    setError(null);
    if (name.trim().length < 2) {
      setError("The person's name needs at least 2 letters.");
      return;
    }
    setSaving(true);
    addSubject(customer.id, { name: name.trim(), relationship })
      .then((res) => {
        void queryClient.invalidateQueries({ queryKey: keys.customers.subjects(customer.id) });
        toast.show({
          title: `${name.trim()} added.`,
          detail: "Their fittings and jobs will file under this tab.",
        });
        onCreated?.(res.data!.id);
        onClose();
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Could not add the family member."),
      )
      .finally(() => setSaving(false));
  };

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label="Add family member"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 w-full animate-fade-in bg-black/50"
      />
      <div className="animate-rise absolute inset-x-0 bottom-0 mx-auto w-full max-w-[430px] rounded-t-[28px] bg-(--hig-grouped) backdrop-blur-xl pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-8px_40px_rgba(0,0,0,0.25)]">
        <div className="mx-auto mt-3 h-1 w-9 rounded-full bg-(--hig-separator)" />
        <div className="flex items-center justify-between px-5 pt-3">
          <h2 className="text-[17px] font-semibold tracking-[-0.01em]">Add family member</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1.5 text-[13px] font-medium text-(--hig-label-secondary)"
          >
            Cancel
          </button>
        </div>

        <div className="space-y-3.5 px-5 pt-4">
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-(--hig-label-secondary)">
              Name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Who do you sew for?"
              className="input-field mt-1.5 w-full rounded-xl px-3.5 py-3 text-[14px] text-(--hig-label) outline-none"
              autoFocus
            />
          </label>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-(--hig-label-secondary)">
              Relationship to {customer.name.split(" ")[0]}
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {relationships.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRelationship(r)}
                  aria-pressed={relationship === r}
                  className={
                    relationship === r
                      ? "rounded-full bg-(--hig-accent) px-3.5 py-2 text-[12px] font-semibold text-white transition-transform duration-150 active:scale-95"
                      : "rounded-full bg-(--hig-fill) px-3.5 py-2 text-[12px] font-medium text-(--hig-label-secondary) transition-transform duration-150 active:scale-95"
                  }
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-[12.5px] text-(--hig-danger)">{error}</p>}
        </div>

        <div className="px-5 pt-5">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="w-full rounded-[14px] bg-(--hig-accent) py-3.5 text-[15px] font-semibold text-white transition-transform duration-200 active:scale-[0.98] disabled:opacity-40"
          >
            {saving ? "Adding…" : "Add to the family"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The measurement book's "new entry" action — a fresh fitting for one person, dated today.
 *
 * The book renders newest-first and the dossier reads the first row, so adding through this sheet
 * moves that person's displayed set forward without any edit-in-place of history — the same
 * append-only rule the payments ledger follows.
 */
export function LogFittingSheet({
  subjectId,
  subjectName,
  keys: measurementKeys,
  previous,
  onClose,
}: {
  subjectId: string;
  subjectName: string;
  /** The canonical field list, camelCased — the same keys the wizard and the book render. */
  keys: string[];
  /** The latest fitting's values, to carry forward so a re-fit only changes what moved. */
  previous: Record<string, MeasurementValue | null> | undefined;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [values, setValues] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const k of measurementKeys) {
      seed[k] = formatMeasurementInput(previous?.[k]);
    }
    return seed;
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useDismiss(onClose);

  const save = () => {
    setError(null);
    // SPARSE on purpose: only fields actually taken are sent. Sending the full grid with
    // nulls used to let backend coercion store 0s for "not taken" — which is how a 34-row
    // book of zeros happened. A record carries what was measured, nothing else.
    const filled: Record<string, MeasurementValue> = {};
    for (const k of measurementKeys) {
      const raw = values[k]?.trim() ?? "";
      if (raw === "") continue;
      const parsed = parseMeasurementInput(raw);
      if (
        parsed === null ||
        (typeof parsed === "number" && (parsed <= 0 || parsed > 500)) ||
        (Array.isArray(parsed) && (parsed[0] > 500 || parsed[1] > 500))
      ) {
        setError(`“${k}” doesn't look like a measurement. Use "8.5" or a pair like "8/8".`);
        return;
      }
      filled[k] = parsed;
    }
    const anyValue = Object.values(filled).some((v) => v !== null);
    if (!anyValue) {
      setError("Enter at least one measurement — or cancel.");
      return;
    }
    setSaving(true);
    createMeasurement(subjectId, { measurements: filled, date: todayISO() })
      .then(() => {
        void queryClient.invalidateQueries({
          queryKey: keys.subjects.measurements(subjectId),
        });
        toast.show({
          title: "Fitting recorded.",
          detail: `${subjectName}'s measurement book is up to date.`,
        });
        onClose();
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Could not record the fitting."),
      )
      .finally(() => setSaving(false));
  };

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label={`New fitting for ${subjectName}`}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 w-full animate-fade-in bg-black/50"
      />
      <div className="animate-rise absolute inset-x-0 bottom-0 mx-auto w-full max-w-[430px] rounded-t-[28px] bg-(--hig-grouped) backdrop-blur-xl pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-8px_40px_rgba(0,0,0,0.25)]">
        <div className="mx-auto mt-3 h-1 w-9 rounded-full bg-(--hig-separator)" />
        <div className="flex items-center justify-between px-5 pt-3">
          <h2 className="text-[17px] font-semibold tracking-[-0.01em]">
            New fitting · {subjectName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1.5 text-[13px] font-medium text-(--hig-label-secondary)"
          >
            Cancel
          </button>
        </div>

        <div className="max-h-[52dvh] space-y-2.5 overflow-y-auto px-5 pt-4">
          {measurementKeys.map((k) => (
            <label key={k} className="flex items-center gap-3">
              <span className="w-31 shrink-0 text-[12px] font-medium text-(--hig-label-secondary)">
                {measureLabel(k)}
              </span>
              <input
                value={values[k] ?? ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [k]: e.target.value }))}
                inputMode="decimal"
                placeholder="8.5 · 8/8"
                className="input-field w-full rounded-xl px-3 py-2.5 text-right text-[13.5px] [font-variant-numeric:tabular-nums] text-(--hig-label) outline-none"
              />
              {/* The numeric keypad has no "/", yet pairs ("8/8") are core notation — this
                  key inserts it. preventDefault on mousedown keeps focus in the input so the
                  tap never blurs mid-edit. */}
              <button
                type="button"
                aria-label="Add pair separator — for two numbers like 8/8"
                title="Two numbers, e.g. 8/8"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  const input = e.currentTarget.previousElementSibling as HTMLInputElement | null;
                  if (!input) return;
                  const pos = input.selectionStart ?? input.value.length;
                  const v = input.value;
                  setValues((prev) => ({ ...prev, [k]: v.slice(0, pos) + "/" + v.slice(pos) }));
                }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-(--hig-separator) bg-(--hig-fill) text-[14px] font-semibold text-(--hig-label-secondary)"
              >
                /
              </button>
              <span className="w-6 shrink-0 text-[10.5px] text-(--hig-label-tertiary)">″</span>
            </label>
          ))}
          <p className="pt-1 text-center text-[10.5px] text-(--hig-label-tertiary)">
            Inches, as measured — the cm twin shows on the client&apos;s book.
          </p>
          {error && <p className="pt-1 text-[12.5px] text-(--hig-danger)">{error}</p>}
        </div>

        <div className="px-5 pt-4">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="w-full rounded-[14px] bg-(--hig-accent) py-3.5 text-[15px] font-semibold text-white transition-transform duration-200 active:scale-[0.98] disabled:opacity-40"
          >
            {saving ? "Recording…" : "Record fitting"}
          </button>
        </div>
      </div>
    </div>
  );
}
