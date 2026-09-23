"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import NewJobModal from "@/components/jobs/new-job-modal";
import {
  AddSubjectSheet,
  EditCustomerSheet,
  LogFittingSheet,
} from "@/components/customers/customer-sheets";
import { DetailHeader } from "@/components/ui/detail-header";
import { CustomerFileSkeleton } from "@/components/ui/skeletons";
import {
  useCustomer,
  useCustomerJobs,
  useCustomerSubjects,
} from "@/hooks/use-customers";
import { useOutstandingPayments, useTopCustomers } from "@/hooks/use-reports";
import { usePrefetchJob } from "@/hooks/use-jobs";
import { useSubjectMeasurements } from "@/hooks/use-subjects";
import { ApiError } from "@/lib/api/transport";
import { avatarColor, avatarTint } from "@/lib/avatar-colors";
import { hasWhatsApp, waMe } from "@/lib/contact";
import {
  cmOf,
  formatDay,
  initials,
  isOverdue,
  naira,
} from "@/lib/format";
import { MEASUREMENT_KEYS, measureLabel } from "@/lib/measurements";
import type { Job } from "@/types/job";

/** Balances for this client's jobs, keyed by job id. */
type Balances = ReadonlyMap<string, number>;

function jobPill(j: Job): { label: string; cls: string } {
  if (isOverdue(j)) return { label: "Overdue", cls: "bg-(--hig-danger-tint) text-(--hig-danger)" };
  if (j.status === "pending") return { label: "In progress", cls: "bg-(--hig-warning-tint) text-(--hig-warning)" };
  if (j.status === "completed" && !j.deliveredAt) return { label: "Ready", cls: "bg-(--hig-success-tint) text-(--hig-success)" };
  if (j.deliveredAt) return { label: "Delivered", cls: "bg-(--hig-accent-tint) text-(--hig-accent)" };
  return { label: "Canceled", cls: "bg-(--hig-separator) text-(--hig-label-secondary)" };
}

/* ------------------------------------------------------------------ */
/* The measurement book — Stitch's inset grouped tables                 */
/* ------------------------------------------------------------------ */

/**
 * The book renders the latest fitting of the selected person: the inset grouped table, filled
 * values as bold figures with their cm twins, empty fields present-but-quiet (the tailor scans
 * for gaps), and the trailing "+" row that opens the fitting sheet. History stays one tap away
 * in the switcher's tray below.
 */
function MeasurementBook({
  subjectId,
  subjectName,
  onLogFitting,
}: {
  subjectId: string;
  subjectName: string;
  onLogFitting: () => void;
}) {
  const fittingQ = useSubjectMeasurements(subjectId);
  const fittings = fittingQ.data ?? [];
  const latest = fittings[0];

  if (fittingQ.isPending) {
    return (
      <section className="mt-6">
        <div className="rounded-[20px] bg-(--hig-card) px-4 py-6 text-center text-[12px] text-(--hig-label-tertiary)">
          Opening the measurement book…
        </div>
      </section>
    );
  }

  if (!latest) {
    return (
      <section className="mt-6">
        <div className="flex items-baseline justify-between px-1 pb-1.5">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.07em] text-(--hig-label-tertiary)">
            Measurement book
          </h3>
        </div>
        <div className="rounded-[20px] bg-(--hig-card) px-4 py-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
          <p className="text-[14px] font-semibold">No fittings on file.</p>
          <p className="mx-auto mt-1 max-w-[240px] text-[12.5px] leading-5 text-(--hig-label-secondary)">
            {subjectName} hasn&apos;t been measured yet — the first fitting starts the book.
          </p>
          <button
            type="button"
            onClick={onLogFitting}
            className="mt-4 rounded-[13px] bg-(--hig-accent-tint) px-5 py-3 text-[13.5px] font-semibold text-(--hig-accent) transition-transform duration-200 active:scale-[0.98]"
          >
            + Take first measurements
          </button>
        </div>
      </section>
    );
  }

  const entries = MEASUREMENT_KEYS.filter((k) => k in latest.measurements);
  const extra = Object.keys(latest.measurements).filter(
    (k) => !MEASUREMENT_KEYS.includes(k),
  );
  const rows = [...entries, ...extra];

  return (
    <section className="mt-6">
      <div className="flex items-baseline justify-between px-1 pb-1.5">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.07em] text-(--hig-label-tertiary)">
          Measurement book
        </h3>
        <span className="text-[10.5px] text-(--hig-label-tertiary)">
          Fitted {formatDay(String(latest.date))}
        </span>
      </div>
      <div className="overflow-hidden rounded-[20px] bg-(--hig-card) shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
        {rows.map((key, i) => {
          const v = latest.measurements[key];
          return (
            <div
              key={key}
              className={`flex min-h-12 items-center justify-between px-4 py-2.5 ${
                i !== 0 ? "border-t border-dashed border-(--hig-separator)" : ""
              }`}
            >
              <span className="text-[13.5px] text-(--hig-label)">{measureLabel(key)}</span>
              <span className="text-[15px] font-semibold [font-variant-numeric:tabular-nums]">
                {v === null || v === undefined ? (
                  <span className="text-[11px] font-light text-(--hig-label-tertiary)">
                    not taken
                  </span>
                ) : (
                  <>
                    {v}
                    <em className="ml-0.5 text-[12px] font-medium not-italic text-(--hig-label-secondary)">″</em>
                    <em className="ml-1.5 text-[9.5px] font-medium not-italic text-(--hig-label-tertiary) [font-variant-numeric:tabular-nums]">
                      ({cmOf(v)} cm)
                    </em>
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {fittings.length > 1 && (
        <p className="mt-1.5 px-1 text-[10.5px] text-(--hig-label-tertiary)">
          {fittings.length - 1} earlier {fittings.length === 2 ? "fitting" : "fittings"} in
          the tray below.
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Subject switcher — Stitch's family segmented bar                     */
/* ------------------------------------------------------------------ */

function SubjectSwitcher({
  subjects,
  activeId,
  onSelect,
  onAdd,
}: {
  subjects: Array<{ id: string; name: string; relationship: string | null }>;
  activeId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <section className="mt-6">
      <div className="flex items-baseline justify-between px-1 pb-1.5">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.07em] text-(--hig-label-tertiary)">
          Measurement book profile
        </h3>
        <span className="text-[10.5px] text-(--hig-label-tertiary)">
          {subjects.length} {subjects.length === 1 ? "person" : "people"}
        </span>
      </div>
      <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-(--hig-filter-well) p-1 scrollbar-none border border-(--hig-separator) [&::-webkit-scrollbar]:hidden">
        {subjects.map((s) => {
          const active = s.id === activeId;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              aria-pressed={active}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[12.5px] transition-all duration-150 active:scale-[0.97] ${
                active
                  ? "bg-(--hig-card) font-semibold text-(--hig-label) shadow-[0_1px_3px_rgba(0,0,0,0.10)]"
                  : "text-(--hig-label-secondary)"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${active ? "bg-(--hig-accent)" : "bg-(--hig-separator)"}`}
                aria-hidden="true"
              />
              {s.name}
              {s.relationship && s.relationship !== "self" && (
                <span className="text-[10.5px] font-normal text-(--hig-label-tertiary)">
                  ({s.relationship})
                </span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onAdd}
          className="flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-(--hig-accent) transition-colors active:bg-(--hig-card)"
        >
          <span aria-hidden="true">＋</span> Add
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Fittings history tray                                                */
/* ------------------------------------------------------------------ */

function FittingsTray({ subjectId }: { subjectId: string }) {
  const fittingQ = useSubjectMeasurements(subjectId);
  const fittings = fittingQ.data ?? [];
  const [openFitting, setOpenFitting] = useState<string | null>(null);

  if (fittings.length <= 1) return null;

  return (
    <section className="mt-5">
      <p className="px-1 pb-1.5 text-[12px] font-semibold uppercase tracking-[0.07em] text-(--hig-label-tertiary)">
        Fitting history · {fittings.length} on file
      </p>
      <div className="space-y-1.5">
        {fittings.map((f) => (
          <div key={f.id} className="overflow-hidden rounded-2xl bg-(--hig-card) shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            <button
              type="button"
              onClick={() => setOpenFitting(openFitting === f.id ? null : f.id)}
              aria-expanded={openFitting === f.id}
              className="flex w-full items-center justify-between px-3.5 py-2.5 text-left"
            >
              <span className="text-[12.5px] font-medium">{formatDay(String(f.date))}</span>
              <span className="flex items-center gap-1.5 text-[10.5px] text-(--hig-label-tertiary) [font-variant-numeric:tabular-nums]">
                {Object.values(f.measurements).filter((v) => v !== null).length} recorded
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
                {Object.entries(f.measurements)
                  .filter(([, v]) => v !== null)
                  .map(([key, value], i, arr) => (
                    <div
                      key={key}
                      className={`py-2 pr-2 ${i % 2 === 0 ? "border-r border-dashed border-(--hig-separator)" : ""} ${i >= 2 ? "border-t border-dashed border-(--hig-separator)" : ""} ${i === arr.length - 1 && i % 2 === 0 ? "col-span-2 border-r-0" : ""}`}
                    >
                      <p className="text-[9px] font-semibold uppercase tracking-[0.07em] text-(--hig-label-tertiary)">
                        {measureLabel(key)}
                      </p>
                      <p className="mt-0.5 text-[14px] font-medium [font-variant-numeric:tabular-nums]">
                        {value}
                        <em className="ml-0.5 text-[11px] font-medium not-italic text-(--hig-label-secondary)">″</em>
                        <em className="ml-1.5 text-[9px] font-medium not-italic text-(--hig-label-tertiary) [font-variant-numeric:tabular-nums]">
                          ({cmOf(value as number)} cm)
                        </em>
                      </p>
                    </div>
                  ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* The person's jobs — filed under the selected family member           */
/* ------------------------------------------------------------------ */

function SubjectJobs({
  subjectName,
  jobs,
  balances,
}: {
  subjectId: string;
  subjectName: string;
  jobs: Job[];
  balances: Balances;
}) {
  const prefetchJob = usePrefetchJob();

  return (
    <section className="mt-6">
      <div className="flex items-baseline justify-between px-1 pb-1.5">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.07em] text-(--hig-label-tertiary)">
          {subjectName}&apos;s commissions
        </h3>
        <span className="text-[10.5px] text-(--hig-label-tertiary) [font-variant-numeric:tabular-nums]">
          {jobs.length} {jobs.length === 1 ? "job" : "jobs"}
        </span>
      </div>
      {jobs.length === 0 ? (
        <div className="rounded-[20px] bg-(--hig-card) px-4 py-6 text-center text-[12.5px] text-(--hig-label-tertiary)">
          Nothing commissioned for {subjectName} yet.
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map((j) => {
            const pill = jobPill(j);
            const bal = balances.get(j.id) ?? 0;
            return (
              <Link
                key={j.id}
                href={`/jobs/${j.id}`}
                onPointerDown={() => prefetchJob(j.id)}
                className="flex w-full items-center gap-2.5 rounded-[16px] bg-(--hig-card) px-3.5 py-3 text-left shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-transform duration-200 active:scale-[0.98]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">
                    {j.description || "Garment"}
                  </span>
                  <span className="mt-0.5 block text-[10.5px] text-(--hig-label-tertiary) [font-variant-numeric:tabular-nums]">
                    {j.dueDate ? `due ${formatDay(j.dueDate)}` : "no due date"}
                    {bal > 0 ? ` · ${naira(bal)} owing` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-[13.5px] font-medium [font-variant-numeric:tabular-nums]">
                  {naira(j.agreedPrice)}
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-semibold ${pill.cls}`}>
                  {pill.label}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* The dossier page                                                     */
/* ------------------------------------------------------------------ */

export default function CustomerFilePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  const [openSubject, setOpenSubject] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [fittingOpen, setFittingOpen] = useState(false);

  const customerQ = useCustomer(id);
  const subjectsQ = useCustomerSubjects(id);
  const jobsQ = useCustomerJobs(id);
  const outstandingQ = useOutstandingPayments();
  const topQ = useTopCustomers(100);

  const customer = customerQ.data;
  const subjects = subjectsQ.data ?? [];
  const jobs = jobsQ.data ?? [];

  const balances = useMemo<Balances>(() => {
    const map = new Map<string, number>();
    for (const o of outstandingQ.data ?? []) {
      if (o.customer.id === id) map.set(o.jobId, o.balanceDue);
    }
    return map;
  }, [outstandingQ.data, id]);

  const toCollect = [...balances.values()].reduce((sum, v) => sum + v, 0);
  const overdue = jobs
    .filter(isOverdue)
    .reduce((sum, j) => sum + (balances.get(j.id) ?? 0), 0);

  /** Lifetime figures, from the leaderboard — dash-quiet when this client isn't on it. */
  const lifetime = (topQ.data ?? []).find((t) => t.id === id) ?? null;

  const anyError = customerQ.isError || subjectsQ.isError || jobsQ.isError;
  const retryAll = () => {
    customerQ.refetch();
    subjectsQ.refetch();
    jobsQ.refetch();
    outstandingQ.refetch();
  };

  /**
   * The selected person. First render has no subjects yet, and "self" is how a client starts —
   * so the switcher defaults to the self row, else the first person, else nobody.
   */
  const activeSubjectId =
    openSubject ??
    subjects.find((s) => s.relationship === "self")?.id ??
    subjects[0]?.id ??
    null;
  const activeSubject = subjects.find((s) => s.id === activeSubjectId) ?? null;
  const subjectJobs = jobs.filter((j) => j.subjectId === activeSubjectId);

  /**
   * The selected person's book, read here so the fitting sheet can seed from the latest entry.
   * Same query key the MeasurementBook uses — one cache entry, zero extra requests.
   */
  const activeFittingsQ = useSubjectMeasurements(activeSubjectId ?? "");

  const heroStats = [
    { label: "To collect", value: naira(toCollect), tone: "text-(--hig-warning)" },
    { label: "Overdue", value: naira(overdue), tone: "text-(--hig-danger)" },
    { label: "Commissions", value: String(jobs.length), tone: "" },
  ];

  return (
    <main className="hig min-h-dvh bg-(--hig-grouped) pb-[calc(4rem+env(safe-area-inset-bottom))] text-(--hig-label) transition-colors duration-300">
      <DetailHeader
        title={customer?.name ?? "Client dossier"}
        fallbackHref="/dashboard?tab=customers"
        actions={
          customer ? (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="flex h-9 items-center gap-1 rounded-full bg-(--hig-accent-tint) px-3.5 text-[13px] font-semibold text-(--hig-accent) transition-transform duration-200 active:scale-95"
            >
              Edit
            </button>
          ) : undefined
        }
      />

      {anyError ? (
        <div className="mx-auto mt-24 w-full sm:max-w-107.5 px-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-(--hig-danger-tint) text-(--hig-danger)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="h-6 w-6" aria-hidden="true">
              <path d="M12 8.5v5" />
              <path d="M12 17.2v.1" />
              <path d="M10.3 4.2 2.9 17a1.9 1.9 0 0 0 1.65 2.85h14.9A1.9 1.9 0 0 0 21.1 17L13.7 4.2a1.9 1.9 0 0 0-3.4 0Z" />
            </svg>
          </div>
          <p className="mt-4 text-[16px] font-medium">Couldn&apos;t open this client.</p>
          <p className="mt-1 text-[13px] text-(--hig-label-secondary)">
            {customerQ.error instanceof ApiError && !customerQ.error.isNetworkError
              ? customerQ.error.message
              : "No connection — check your network and try again."}
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
        <CustomerFileSkeleton />
      ) : (
        <>
          <div className="mx-auto w-full sm:max-w-107.5 px-4 pt-5">
            {/* Hero profile card — Stitch's dossier header */}
            <section className="rounded-[22px] bg-(--hig-card) p-4.5 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
              <div className="flex items-start gap-3.5">
                <span
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 text-[17px] font-semibold"
                  style={{
                    backgroundColor: avatarTint(customer.name),
                    color: avatarColor(customer.name),
                    borderColor: avatarColor(customer.name) + "4D",
                  }}
                >
                  {initials(customer.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[21px] font-semibold leading-7 tracking-[-0.02em]">
                    {customer.name}
                  </h2>
                  <p className="mt-0.5 truncate text-[13px] text-(--hig-label-secondary)">
                    {customer.phoneNumber ?? "no phone on file"}
                  </p>
                  {/* The provenance chips — facts that hold no matter when the row was typed in.
                      No "client since": a client met years ago is entered today, and the badge
                      would call her new. */}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-(--hig-fill) px-2.5 py-1 text-[10.5px] font-medium text-(--hig-label-secondary)">
                      {jobs.length} {jobs.length === 1 ? "commission" : "commissions"}
                    </span>
                    {lifetime && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-(--hig-success-tint) px-2.5 py-1 text-[10.5px] font-semibold text-(--hig-success)">
                        {naira(lifetime.totalPaid)} paid
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Contact row — call the raw number, WhatsApp the 234 form */}
              {customer.phoneNumber && (
                <div className="mt-3.5 grid grid-cols-2 gap-2.5">
                  <a
                    href={`tel:${customer.phoneNumber}`}
                    className="flex items-center justify-center gap-2 rounded-[13px] bg-(--hig-fill) py-2.5 text-[13px] font-semibold text-(--hig-label) transition-transform duration-200 active:scale-[0.98]"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                    Call
                  </a>
                  {hasWhatsApp(customer.phoneNumber) && (
                    <a
                      href={waMe(customer.phoneNumber)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 rounded-[13px] bg-(--hig-fill) py-2.5 text-[13px] font-semibold text-(--hig-label) transition-transform duration-200 active:scale-[0.98]"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                      </svg>
                      WhatsApp
                    </a>
                  )}
                </div>
              )}
            </section>

            {/* The ledger counters */}
            <div className="mt-4 grid grid-cols-3 gap-2.5">
              {heroStats.map((s) => (
                <div key={s.label} className="rounded-[18px] bg-(--hig-card) py-3 text-center shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                  <p className={`text-[15px] font-medium leading-tight [font-variant-numeric:tabular-nums] ${s.tone}`}>
                    {s.value}
                  </p>
                  <p className="mt-1 text-[8.5px] font-semibold uppercase tracking-[0.06em] text-(--hig-label-tertiary)">
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {subjects.length === 0 ? (
            <div className="mx-auto mt-6 w-full sm:max-w-107.5 px-4">
              <div className="rounded-[20px] bg-(--hig-card) px-5 py-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                <p className="text-[14.5px] font-semibold">No family members on file.</p>
                <p className="mx-auto mt-1 max-w-[260px] text-[12.5px] leading-5 text-(--hig-label-secondary)">
                  Add the people you sew for — each keeps their own measurement book and
                  commission history.
                </p>
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="mt-4 rounded-[13px] bg-(--hig-accent) px-5 py-3 text-[13.5px] font-semibold text-white transition-transform duration-200 active:scale-95"
                >
                  + Add family member
                </button>
              </div>
            </div>
          ) : (
            <div className="mx-auto w-full sm:max-w-107.5 px-4">
              <SubjectSwitcher
                subjects={subjects}
                activeId={activeSubjectId}
                onSelect={setOpenSubject}
                onAdd={() => setAddOpen(true)}
              />

              {activeSubject && (
                <>
                  <MeasurementBook
                    subjectId={activeSubject.id}
                    subjectName={activeSubject.name}
                    onLogFitting={() => setFittingOpen(true)}
                  />
                  <FittingsTray subjectId={activeSubject.id} />
                  <SubjectJobs
                    subjectId={activeSubject.id}
                    subjectName={activeSubject.name}
                    jobs={subjectJobs}
                    balances={balances}
                  />
                </>
              )}
            </div>
          )}

          {/* The two verbs — Stitch's action pair */}
          <div className="mx-auto mt-7 w-full sm:max-w-107.5 px-4">
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setFittingOpen(true)}
                disabled={!activeSubject}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-[14px] bg-(--hig-card) text-[13.5px] font-semibold text-(--hig-label) shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-transform duration-200 active:scale-[0.98] disabled:opacity-40"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5 text-(--hig-label-secondary)" aria-hidden="true">
                  <path d="M3 17l6-6 4 4 8-8" />
                  <path d="M15 7h6v6" />
                </svg>
                New fitting
              </button>
              <button
                type="button"
                onClick={() => setNewJobOpen(true)}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-[14px] bg-(--hig-accent) text-[13.5px] font-semibold text-white transition-transform duration-200 active:scale-[0.98]"
              >
                <span aria-hidden="true" className="text-[15px]">＋</span>
                New job for {activeSubject?.name?.split(" ")[0] ?? customer.name.split(" ")[0]}
              </button>
            </div>
            <p className="mt-4 text-center text-[11.5px] leading-relaxed text-(--hig-label-tertiary)">
              Measurements are kept per person, and a new fitting never rewrites the old ones.
            </p>
          </div>

          {/* The sheets */}
          {editOpen && (
            <EditCustomerSheet customer={customer} onClose={() => setEditOpen(false)} />
          )}
          {addOpen && (
            <AddSubjectSheet
              customer={customer}
              onClose={() => setAddOpen(false)}
              onCreated={(sid) => setOpenSubject(sid)}
            />
          )}
          {fittingOpen && activeSubject && (
            <LogFittingSheet
              subjectId={activeSubject.id}
              subjectName={activeSubject.name}
              keys={MEASUREMENT_KEYS}
              // Seed from the newest fitting so a re-fit only retypes what moved.
              previous={activeFittingsQ.data?.[0]?.measurements}
              onClose={() => setFittingOpen(false)}
            />
          )}
          <NewJobModal
            open={newJobOpen}
            onClose={() => setNewJobOpen(false)}
            prefillCustomer={customer}
            prefillSubjectId={activeSubjectId}
          />
        </>
      )}
    </main>
  );
}
