"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ThemeToggle from "@/components/ui/theme-toggle";
import {
  useCustomer,
  useCustomerJobs,
  useCustomerSubjects,
} from "@/hooks/use-customers";
import { useOutstandingPayments } from "@/hooks/use-reports";
import { useSubjectMeasurements } from "@/hooks/use-subjects";
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
  if (m) return `${+m[3]!} ${MONTHS[+m[2]! - 1]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]!}`;
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

const isOverdue = (j: Job) =>
  j.status === "pending" &&
  !!j.dueDate &&
  Number.isFinite(parseDay(j.dueDate)) &&
  parseDay(j.dueDate) < new Date(new Date().toDateString()).getTime();

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

function jobPill(j: Job): { label: string; cls: string } {
  if (isOverdue(j)) return { label: "Overdue", cls: "bg-(--hig-danger-tint) text-(--hig-danger)" };
  if (j.status === "pending") return { label: "In progress", cls: "bg-(--hig-warning-tint) text-(--hig-warning)" };
  if (j.status === "completed" && !j.deliveredAt) return { label: "Ready", cls: "bg-(--hig-success-tint) text-(--hig-success)" };
  if (j.deliveredAt) return { label: "Delivered", cls: "bg-(--hig-accent-tint) text-(--hig-accent)" };
  return { label: "Canceled", cls: "bg-(--hig-separator) text-(--hig-label-secondary)" };
}

function SubjectRow({
  subject,
  jobs,
  open,
  onToggle,
}: {
  subject: { id: string; name: string; relationship: string | null; createdAt: string };
  jobs: Job[];
  open: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();

  const [openFitting, setOpenFitting] = useState<string | null>(null);

  const fittingQ = useSubjectMeasurements(subject.id);
  const fittings = fittingQ.data ?? [];
  const latest = fittings[0];
  const hue = avatarColor(subject.name);

  const totalBal = jobs.reduce((s, j) => s + (balancesByJob.get(j.id) ?? 0), 0);

  return (
    <div className="border-t border-dashed border-(--hig-separator) first:border-t-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors"
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold"
          style={{ backgroundColor: avatarTint(subject.name), color: hue, borderColor: hue + "4D" }}
        >
          {initials(subject.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-medium">{subject.name}</span>
          <span className="mt-0.5 block text-[11px] text-(--hig-label-tertiary)">
            {subject.relationship ?? "self"}
            {fittingQ.isSuccess && (
              <>
                {" · "}
                {latest ? (
                  <>
                    fitted <b className="font-semibold text-(--hig-label-secondary)">{fmtDay(String(latest.date))}</b>
                  </>
                ) : (
                  "not fitted yet"
                )}
              </>
            )}
          </span>
        </span>
        <span className="shrink-0 text-[11px] text-(--hig-label-tertiary) [font-variant-numeric:tabular-nums]">
          {jobs.length} {jobs.length === 1 ? "job" : "jobs"}
        </span>
        <span
          className={`shrink-0 text-[13px] text-(--hig-label-tertiary) transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>

      {}
      {open && (
        <div className="animate-fade-in px-4 pb-4">
          {}
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-(--hig-label-tertiary)">
            Fittings{fittingQ.isLoading ? " · loading…" : ` · ${fittings.length} on file`}
          </p>
          {fittings.length === 0 ? (
            <p className="mt-2 text-[11.5px] text-(--hig-label-tertiary)">
              No fittings on file yet.
            </p>
          ) : (
            <div className="mt-1.5 space-y-1.5">
              {fittings.map((f) => (
                <div key={f.id} className="overflow-hidden rounded-2xl bg-(--hig-fill)">
                  <button
                    type="button"
                    onClick={() => setOpenFitting(openFitting === f.id ? null : f.id)}
                    aria-expanded={openFitting === f.id}
                    className="flex w-full items-center justify-between px-3.5 py-2.5 text-left"
                  >
                    <span className="text-[12.5px] font-medium">{fmtDay(String(f.date))}</span>
                    <span className="flex items-center gap-1.5 text-[10.5px] text-(--hig-label-tertiary) [font-variant-numeric:tabular-nums]">
                      {Object.keys(f.measurements).length} measurements
                      <span
                        className={`text-[11px] transition-transform duration-200 ${openFitting === f.id ? "rotate-180" : ""}`}
                        aria-hidden="true"
                      >
                        ▾
                      </span>
                    </span>
                  </button>
                  {openFitting === f.id && (

                    <div className="animate-fade-in grid grid-cols-2 border-t border-dashed border-(--hig-separator) px-3.5 pb-1 pt-0.5">
                      {Object.entries(f.measurements).map(([key, value], i) => (
                        <div
                          key={key}
                          className={`px-1.5 py-2 ${
                            i % 2 === 0 ? "border-r border-dashed border-(--hig-separator)" : ""
                          } ${i >= 2 ? "border-t border-dashed border-(--hig-separator)" : ""}`}
                        >
                          <p className="text-[9px] font-semibold uppercase tracking-[0.07em] text-(--hig-label-tertiary)">
                            {key}
                          </p>
                          <p className="mt-0.5 text-[15px] font-medium [font-variant-numeric:tabular-nums]">
                            {value === null ? (
                              <span className="text-[11px] font-light text-(--hig-label-tertiary)">not taken</span>
                            ) : (
                              <>
                                {value}
                                <em className="ml-1 text-[9.5px] font-medium not-italic text-(--hig-label-secondary)">cm</em>
                              </>
                            )}
                          </p>
                        </div>
                      ))}
                      {Object.keys(f.measurements).length === 0 && (
                        <p className="col-span-2 py-2 text-center text-[11.5px] text-(--hig-label-tertiary)">
                          Fitting on file, no measurements recorded.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {}
          <p className="mt-3 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-(--hig-label-tertiary)">
            Their jobs{totalBal > 0 ? ` · ${naira.format(totalBal)} to collect` : ""}
          </p>
          {jobs.length === 0 ? (
            <p className="mt-1.5 text-[11.5px] text-(--hig-label-tertiary)">
              No jobs on file for {subject.name} yet.
            </p>
          ) : (
            <div className="mt-1.5 space-y-2">
              {jobs.map((j) => {
                const pill = jobPill(j);
                const bal = balancesByJob.get(j.id) ?? 0;
                return (
                  <button
                    key={j.id}
                    type="button"
                    onClick={() => router.push(`/jobs/${j.id}`)}
                    className="flex w-full items-center gap-2.5 rounded-[14px] bg-(--hig-card) px-3 py-2.5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-transform duration-200 active:scale-[0.98]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">
                        {j.description || "Garment"}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-(--hig-label-tertiary) [font-variant-numeric:tabular-nums]">
                        {j.dueDate ? `due ${fmtDay(j.dueDate)}` : "no due date"}
                        {bal > 0 ? ` · ${naira.format(bal)} owing` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-[13.5px] font-medium [font-variant-numeric:tabular-nums]">
                      {naira.format(j.agreedPrice)}
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-semibold ${pill.cls}`}>
                      {pill.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const balancesByJob = new Map<string, number>();

function FileSkeleton() {
  const bar = "animate-pulse rounded bg-(--hig-separator)";
  return (
    <div className="mx-auto w-full max-w-107.5 px-4">
      <div className="mt-6 flex items-center gap-3">
        <div className={`h-12 w-12 shrink-0 rounded-full ${bar}`} />
        <div className="flex-1">
          <div className={`h-4 w-32 ${bar}`} />
          <div className={`mt-2 h-3 w-40 ${bar}`} />
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2.5">
        <div className={`h-16 ${bar}`} />
        <div className={`h-16 ${bar}`} />
        <div className={`h-16 ${bar}`} />
      </div>
      <div className={`mt-7 h-40 ${bar}`} />
    </div>
  );
}

export default function CustomerFilePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [openSubject, setOpenSubject] = useState<string | null>(null);

  const customerQ = useCustomer(id);
  const subjectsQ = useCustomerSubjects(id);
  const jobsQ = useCustomerJobs(id);

  const outstandingQ = useOutstandingPayments();

  const jobs = jobsQ.data ?? [];
  useMemo(() => {
    balancesByJob.clear();
    for (const o of outstandingQ.data ?? []) {
      if (o.customer.id === id) {

        balancesByJob.set(o.jobId, o.balanceDue);
      }
    }
  }, [outstandingQ.data, id]);

  const customer = customerQ.data;
  const subjects = subjectsQ.data ?? [];

  const toCollect = [...balancesByJob.values()].reduce((s, v) => s + v, 0);
  const overdue = jobs.filter(isOverdue).reduce((s, j) => s + (balancesByJob.get(j.id) ?? 0), 0);

  const anyError = customerQ.isError || subjectsQ.isError || jobsQ.isError;
  const retryAll = () => {
    customerQ.refetch();
    subjectsQ.refetch();
    jobsQ.refetch();
    outstandingQ.refetch();
  };

  return (
    <main className="hig min-h-dvh bg-(--hig-grouped) pb-16 text-(--hig-label) transition-colors duration-300">
      {}
      <header className="sticky top-0 z-30 border-b border-(--hig-separator) bg-(--hig-bar)/80 backdrop-blur-[20px] backdrop-saturate-150">
        <div className="mx-auto flex w-full max-w-107.5 items-center justify-between px-4 py-1.5">
          <button
            type="button"
            aria-label="Back to customers"
            onClick={() => (window.history.length > 1 ? router.back() : router.push("/customers"))}
            className="flex h-11 w-11 items-center justify-center rounded-full text-[20px] text-(--hig-accent) transition-transform duration-200 active:scale-90"
          >
            ‹
          </button>
          <h1 className="text-[15px] font-semibold tracking-[-0.01em]">Customer file</h1>
          <ThemeToggle />
        </div>
      </header>

      {anyError ? (

        <div className="mx-auto mt-24 w-full max-w-107.5 px-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-(--hig-danger-tint) text-(--hig-danger)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="h-6 w-6" aria-hidden="true">
              <path d="M12 8.5v5" />
              <path d="M12 17.2v.1" />
              <path d="M10.3 4.2 2.9 17a1.9 1.9 0 0 0 1.65 2.85h14.9A1.9 1.9 0 0 0 21.1 17L13.7 4.2a1.9 1.9 0 0 0-3.4 0Z" />
            </svg>
          </div>
          <p className="mt-4 text-[16px] font-medium">Couldn&apos;t open this client.</p>
          <p className="mt-1 text-[13px] text-(--hig-label-secondary)">
            {customerQ.error instanceof Error
              ? customerQ.error.message
              : "Check your connection and try again."}
          </p>
          <button
            type="button"
            onClick={retryAll}
            className="mt-5 rounded-[13px] bg-(--hig-accent) px-6 py-3 text-[14px] font-semibold text-white transition-transform duration-200 active:scale-95"
          >
            Retry
          </button>
        </div>
      ) : !customer ? (
        <FileSkeleton />
      ) : (
        <>
          {}
          <div className="mx-auto w-full max-w-107.5 px-4 pt-6">
            <div className="flex items-center gap-3">
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border text-[15px] font-semibold"
                style={{
                  backgroundColor: avatarTint(customer.name),
                  color: avatarColor(customer.name),
                  borderColor: avatarColor(customer.name) + "4D",
                }}
              >
                {initials(customer.name)}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[24px] font-medium leading-7.5 tracking-[-0.02em]">
                  {customer.name}
                </h2>
                <p className="mt-0.5 truncate text-[12.5px] text-(--hig-label-secondary)">
                  {customer.phoneNumber ?? "no phone on file"}
                </p>
              </div>
              {customer.phoneNumber && (
                <a
                  href={`tel:${customer.phoneNumber.replace(/[^\d+]/g, "")}`}
                  aria-label={`Call ${customer.phoneNumber}`}
                  title={`Call ${customer.phoneNumber}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center text-(--hig-accent) transition-transform duration-200 active:scale-90"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7" aria-hidden="true">
                    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.4 2.1L8.1 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.6 2Z" />
                  </svg>
                </a>
              )}
            </div>

            {}
            <div className="mt-5 grid grid-cols-3 gap-2.5">
              <div className="rounded-2xl bg-(--hig-card) py-3 text-center shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                <p className="text-[15px] font-medium leading-tight text-(--hig-warning) [font-variant-numeric:tabular-nums]">
                  {naira.format(toCollect)}
                </p>
                <p className="mt-1 text-[8.5px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-tertiary)">
                  To collect
                </p>
              </div>
              <div className="rounded-2xl bg-(--hig-card) py-3 text-center shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                <p className="text-[15px] font-medium leading-tight text-(--hig-danger) [font-variant-numeric:tabular-nums]">
                  {naira.format(overdue)}
                </p>
                <p className="mt-1 text-[8.5px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-tertiary)">
                  Overdue
                </p>
              </div>
              <div className="rounded-2xl bg-(--hig-card) py-3 text-center shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                <p className="text-[15px] font-medium leading-tight [font-variant-numeric:tabular-nums]">
                  {jobs.length}
                </p>
                <p className="mt-1 text-[8.5px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-tertiary)">
                  Jobs
                </p>
              </div>
            </div>
          </div>

          {}
          <section className="mx-auto mt-7 w-full max-w-107.5 px-4">
            <div className="mb-2.5 flex items-baseline justify-between px-0.5">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-secondary)">
                The family
              </h2>
              <span className="text-[11.5px] text-(--hig-label-tertiary) [font-variant-numeric:tabular-nums]">
                {subjects.length} {subjects.length === 1 ? "person" : "people"}
              </span>
            </div>

            {subjects.length === 0 ? (
              <div className="rounded-[20px] bg-(--hig-card) px-5 py-8 text-center text-[12.5px] text-(--hig-label-tertiary)">
                No subjects on file for {customer.name} yet.
              </div>
            ) : (
              <div className="rounded-[20px] bg-(--hig-card) shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                {subjects.map((s) => (
                  <SubjectRow
                    key={s.id}
                    subject={s}
                    jobs={jobs.filter((j) => j.subjectId === s.id)}
                    open={openSubject === s.id}
                    onToggle={() => setOpenSubject(openSubject === s.id ? null : s.id)}
                  />
                ))}
              </div>
            )}
          </section>

          <p className="mx-auto mt-6 w-full max-w-107.5 px-4 text-center text-[11.5px] leading-relaxed text-(--hig-label-tertiary)">
            Client since {fmtISO(customer.createdAt)} · tap a person to see their fittings and jobs.
          </p>
        </>
      )}
    </main>
  );
}