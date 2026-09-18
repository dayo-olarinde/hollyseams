"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import { useInvalidateJobWrites } from "@/hooks/use-jobs";
import { listCustomers } from "@/lib/api/customers";
import { keys } from "@/lib/query/keys";
import { createJob, createJobForSubject } from "@/lib/api/jobs";
import { createMeasurement, listMeasurements } from "@/lib/api/measurements";
import { addSubject, listSubjects } from "@/lib/api/subjects";
import { getUploadSignature, uploadPhotoToCloudinary } from "@/lib/api/uploads";
import { avatarColor, avatarTint, tintOf } from "@/lib/avatar-colors";
import type { Customer } from "@/types/customer";
import type { Job } from "@/types/job";
import type { Measurement } from "@/types/measurement";
import type { Subject } from "@/types/subject";

import { formatDay, initials, naira, todayISO } from "@/lib/format";

const COMMON_MEASUREMENTS = [
  "Hip", "Knee", "Bust", "Neck", "Thigh", "Ankle", "Chest", "Waist", "Length",
  "Sleeve", "Across back", "Knee length", "Calf length", "Full length",
  "Half length", "Skirt length", "Dress length", "Waist to Hip", "Waist to Knee",
  "Nipple to Nipple", "Round under Bust", "Shoulder to Nipple",
  "Shoulder to Under Bust",
];

function toKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, "");
}

function emptyFitting(): Record<string, number | null> {
  return Object.fromEntries(COMMON_MEASUREMENTS.map((name) => [toKey(name), null]));
}

function filledFitting(
  meas: Record<string, number | null>,
): Record<string, number | null> {
  return Object.fromEntries(Object.entries(meas).filter(([, value]) => value !== null));
}

const NAME_RE = /^[a-zA-Z]+(?:[ '-][a-zA-Z]+)*$/;
const PHONE_RE = /^\+?[0-9]{7,15}$/;

interface ModalSubject {
  key: string;
  subjectId?: string;
  relationship: string;
  name: string;
  loaded: boolean;
  latestMeasId?: string;
}

interface WizardPhoto {
  file: File;
  previewUrl: string;
  alt: string;
  publicId?: string;
  status: "uploading" | "done" | "error";
  error?: string;
}

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

const MAX_PHOTOS = 1;

const inputClass =
  "w-full rounded-xl border border-(--hig-separator) bg-(--hig-fill) px-4 py-3 text-[13px] text-(--hig-label) outline-none transition-[border-color,box-shadow] placeholder:font-light placeholder:text-(--hig-label-tertiary) focus:border-(--hig-accent) focus:shadow-[0_0_0_3px_var(--hig-accent-soft)]";

const chipClass =
  "inline-flex items-center gap-2 rounded-full bg-(--hig-fill) px-3 py-2 text-[11px] font-medium text-(--hig-label-secondary) transition-all active:scale-95";

const chipOnClass = "!text-(--hig-label)";

const chipAddClass =
  "border border-dashed border-(--hig-accent-line) bg-transparent text-(--hig-accent)";

const monoClass =
  "flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold";

const miniLabelClass =
  "mt-6 text-[12px] font-semibold uppercase tracking-[0.16em] text-(--hig-label-secondary)";

export default function NewJobModal({ open, onClose }: { open: boolean; onClose: () => void }) {

  const invalidateJobWrites = useInvalidateJobWrites();
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [query, setQuery] = useState("");
  const [ddOpen, setDdOpen] = useState(false);
  const [client, setClient] = useState<Customer | null>(null);
  const [phone, setPhone] = useState("");

  const [subjects, setSubjects] = useState<ModalSubject[]>([]);
  const [activeKey, setActiveKey] = useState("new");
  const [meas, setMeas] = useState<Record<string, Record<string, number | null>>>({});
  const [dirtyMeas, setDirtyMeas] = useState<Set<string>>(new Set());
  const [composer, setComposer] = useState("");
  const [pendingMeas, setPendingMeas] = useState<{ key: string; name: string } | null>(null);
  const [editingMeas, setEditingMeas] = useState<string | null>(null);
  const [addingSubject, setAddingSubject] = useState(false);
  const [subjectSaving, setSubjectSaving] = useState(false);
  const [subjectError, setSubjectError] = useState<string | null>(null);

  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [photos, setPhotos] = useState<WizardPhoto[]>([]);

  const [fold, setFold] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Job | null>(null);

  const ddWrapRef = useRef<HTMLDivElement>(null);
  const ddRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [ddRect, setDdRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const compWrapRef = useRef<HTMLDivElement>(null);
  const compRef = useRef<HTMLDivElement>(null);
  const compInputRef = useRef<HTMLInputElement>(null);
  const [compRect, setCompRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [sugOpen, setSugOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  /** Every object URL this sheet has created, so unmount can revoke all of them. */
  const previewUrlsRef = useRef<string[]>([]);
  const activeSubject = subjects.find((s) => s.key === activeKey) ?? null;

  useEffect(() => {
    if (!open) return;

    setCustomers(null);
    setQuery("");
    setClient(null);
    setPhone("");
    setSubjects([{ key: "new", relationship: "self", name: "", loaded: true }]);
    setActiveKey("new");
    setMeas({ new: emptyFitting() });
    setDirtyMeas(new Set());
    setComposer("");
    setPendingMeas(null);
    setEditingMeas(null);
    setAddingSubject(false);
    setSubjectError(null);
    setDesc("");
    setPrice("");
    setDueDate("");
    setPhotos([]);
    setFold(1);
    setError(null);
    setCreated(null);

    /**
     * The client list comes from the cache, not from a fresh request every time.
     *
     * Opening this sheet used to fire its own `listCustomers({ limit: 100 })` and throw the answer
     * away on close — a hundred rows on every open, even for a job for a client chosen a minute
     * ago. `fetchQuery` reads the cache and only hits the network when the entry is missing or
     * stale, and the key sits under `customers` so a job that creates a client invalidates it.
     */
    void queryClient
      .fetchQuery({
        queryKey: keys.customers.picker,
        queryFn: ({ signal }) => listCustomers({ limit: 100 }, signal),
        staleTime: 5 * 60_000,
      })
      .then((res) => setCustomers(res.data ?? []))
      .catch(() => setCustomers([]));

    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open, queryClient]);

  /**
   * Release the local preview blobs when the sheet goes away.
   *
   * `URL.createObjectURL` pins a whole image in memory until it is revoked, and a failed or
   * abandoned upload never reached the "remove" button that revokes one — so on a phone that keeps
   * the tab alive for days, a few 3 MB photos become a few hundred. The ref, not the `photos`
   * state, is the source of truth here: a cleanup closure reading state would only ever see the
   * array from the render it was created in.
   */
  useEffect(() => {
    const previews = previewUrlsRef.current;
    return () => {
      for (const url of previews) URL.revokeObjectURL(url);
      previews.length = 0;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!(ddWrapRef.current?.contains(t) || ddRef.current?.contains(t))) setDdOpen(false);
      if (!(compWrapRef.current?.contains(t) || compRef.current?.contains(t))) setSugOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, onClose]);

  const filteredCustomers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (customers ?? []).filter((c) => c.name.toLowerCase().includes(q));
  }, [customers, query]);

  function clearClient() {
    setClient(null);
    setQuery("");
    setDdOpen(false);
    setAddingSubject(false);
    setSubjectError(null);
    setPhone("");
    setSubjects([{ key: "new", relationship: "self", name: "", loaded: true }]);
    setActiveKey("new");
    setMeas({ new: emptyFitting() });
    setDirtyMeas(new Set());
  }

  async function pickClient(c: Customer) {
    setClient(c);
    setQuery(c.name);
    setDdOpen(false);
    setAddingSubject(false);
    setSubjectError(null);
    setPhone("");

    // Same cache entry as the customer file's subject list: the tailor who just visited a client
    // should not pay for that list a second time when opening this sheet.
    const res = await queryClient.fetchQuery({
      queryKey: keys.customers.subjects(c.id),
      queryFn: ({ signal }) => listSubjects(c.id, { limit: 100 }, signal),
      staleTime: 10 * 60_000,
    });
    const rows = (res.data ?? []).slice().sort((a, b) =>
      a.relationship === "self" ? -1 : b.relationship === "self" ? 1 : 0,
    );
    const mapped: ModalSubject[] = rows.map((s: Subject) => ({
      key: s.id,
      subjectId: s.id,
      relationship: s.relationship ?? "self",
      name: s.name,
      loaded: false,
    }));
    setSubjects(mapped);
    const first = mapped[0];
    setActiveKey(first?.key ?? "");
    setMeas({});
    setDirtyMeas(new Set());

    if (first) await selectSubject(first);
  }

  function startAddSubject() {

    const key = "new-" + Math.random().toString(36).slice(2, 7);
    setSubjects((prev) => [
      ...prev.filter((x) => !x.key.startsWith("new-")),
      { key, relationship: "daughter", name: "", loaded: true },
    ]);
    setActiveKey(key);
    setMeas((prev) => ({ ...prev, [key]: prev[key] ?? emptyFitting() }));
    setAddingSubject(true);
    setSubjectError(null);
  }

  async function confirmSubject() {
    const subj = activeSubject;
    if (!subj || !subj.key.startsWith("new-")) return;
    const name = subj.name.trim();
    if (name.length < 2) {
      setSubjectError("Name needs at least 2 letters.");
      return;
    }
    setSubjectSaving(true);
    try {
      if (client) {

        const res = await addSubject(client.id, {
          name,
          relationship: subj.relationship,
        });
        const created = res.data!;
        setSubjects((prev) =>
          prev.map((x) =>
            x.key === subj.key
              ? {
                  key: created.id,
                  subjectId: created.id,
                  relationship: created.relationship ?? subj.relationship,
                  name: created.name,
                  loaded: true,
                }
              : x,
          ),
        );
        setMeas((prev) => {
          const carried = prev[subj.key];
          const next = { ...prev };
          delete next[subj.key];
          next[created.id] = carried ?? emptyFitting();
          return next;
        });
        setDirtyMeas((prev) => {
          if (!prev.has(subj.key)) return prev;
          const next = new Set(prev);
          next.delete(subj.key);
          next.add(created.id);
          return next;
        });
        setActiveKey(created.id);
      }
      setAddingSubject(false);
    } catch (err) {
      setSubjectError(err instanceof Error ? err.message : "Could not add the subject.");
    } finally {
      setSubjectSaving(false);
    }
  }

  function cancelSubject() {
    const next = subjects.filter((x) => !(x.key === activeKey && x.key.startsWith("new-")));
    setSubjects(next);
    setActiveKey(next[0]?.key ?? "");
    setAddingSubject(false);
    setSubjectError(null);
  }

  async function selectSubject(subj: ModalSubject) {
    setActiveKey(subj.key);
    setPendingMeas(null);
    setEditingMeas(null);

    if (!subj.subjectId || subj.loaded) {
      setMeas((prev) => (prev[subj.key] ? prev : { ...prev, [subj.key]: emptyFitting() }));
      return;
    }

    /**
     * Read the subject's fittings through the *same* cache entry the client's file page uses.
     *
     * Two things were wrong before: this asked the API directly, so a customer the tailor had just
     * looked at was fetched again, and it asked for `limit: 1` — meaning the same logical data
     * lived under two different cache keys depending on which screen wanted it. The list is
     * ordered newest-first, so the newest fitting is `[0]` whether one row was requested or a
     * hundred: same question, same answer, one cache entry.
     */
    const res = await queryClient.fetchQuery({
      queryKey: keys.subjects.measurements(subj.subjectId),
      queryFn: ({ signal }) => listMeasurements(subj.subjectId!, { limit: 100 }, signal),
      staleTime: 10 * 60_000,
    });
    const latest: Measurement | undefined = res.data?.[0];
    setSubjects((prev) =>
      prev.map((x) =>
        x.key === subj.key
          ? { ...x, loaded: true, latestMeasId: latest?.id }
          : x,
      ),
    );
    if (latest) {
      setMeas((prev) => ({ ...prev, [subj.key]: { ...latest.measurements } }));
    } else {
      setMeas((prev) => (prev[subj.key] ? prev : { ...prev, [subj.key]: emptyFitting() }));
    }
  }

  const currentMeas = () => meas[activeKey] ?? {};

  function touchMeas(next: Record<string, number | null>) {

    setMeas((prev) => ({ ...prev, [activeKey]: next }));
    setDirtyMeas((prev) => new Set(prev).add(activeKey));
  }

  function commitPending() {
    const raw = (document.getElementById("pendVal") as HTMLInputElement | null)?.value ?? "";
    const value = Number(raw.replace(/[^\d.]/g, ""));
    if (pendingMeas && raw.trim() && !Number.isNaN(value)) {
      touchMeas({ ...currentMeas(), [pendingMeas.key]: value });
    }
    setPendingMeas(null);
  }

  function commitEdit(key: string, raw: string) {
    const value = Number(raw.replace(/[^\d.]/g, ""));
    if (raw.trim() && !Number.isNaN(value)) {
      touchMeas({ ...currentMeas(), [key]: value });
    }
    setEditingMeas(null);
  }

  function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";

    const batch = files.slice(0, Math.max(0, MAX_PHOTOS - photos.length));
    if (batch.length === 0) return;

    const sigPromise = getUploadSignature();
    for (const file of batch) {

      const stem = file.name
        .replace(/\.[a-z0-9]+$/i, "")
        .replace(/[_-]+/g, " ")
        .trim();
      const alt = `Style reference${stem ? ` — ${stem}` : ""}`.slice(0, 200);
      const previewUrl = URL.createObjectURL(file);
      previewUrlsRef.current.push(previewUrl);
      setPhotos((prev) => [
        ...prev,
        { file, previewUrl, alt, status: "uploading" },
      ]);
      void uploadOne(file, previewUrl, sigPromise);
    }
  }

  async function uploadOne(
    file: File,
    previewUrl: string,
    sigPromise: ReturnType<typeof getUploadSignature>,
  ) {
    try {
      if (file.size > MAX_PHOTO_BYTES) {
        throw new Error("Over the 10 MB limit — pick a smaller photo");
      }
      const sig = await sigPromise;
      const { publicId } = await uploadPhotoToCloudinary(file, sig);
      setPhotos((prev) =>
        prev.map((p) =>
          p.previewUrl === previewUrl
            ? { ...p, publicId, status: "done" as const }
            : p,
        ),
      );
    } catch (err) {
      setPhotos((prev) =>
        prev.map((p) =>
          p.previewUrl === previewUrl
            ? {
                ...p,
                status: "error" as const,
                error:
                  err instanceof Error
                    ? err.message
                    : "Upload failed — tap to retry",
              }
            : p,
        ),
      );
    }
  }

  function retryPhoto(p: WizardPhoto) {
    setPhotos((prev) =>
      prev.map((x) =>
        x.previewUrl === p.previewUrl ? { ...x, status: "uploading" } : x,
      ),
    );
    void uploadOne(p.file, p.previewUrl, getUploadSignature());
  }

  async function handleCreate() {
    setError(null);

    const name = (client?.name ?? query).trim();
    if (name.length < 2 || !NAME_RE.test(name)) {
      setError("Name must be at least 2 letters (letters, spaces, apostrophes, hyphens only).");
      setFold(1);
      return;
    }
    if (!client && phone.trim() && !PHONE_RE.test(phone.trim())) {
      setError("Phone must be 7–15 digits, optionally starting with +.");
      setFold(1);
      return;
    }
    if (activeSubject && activeSubject.relationship !== "self" && activeSubject.name.trim().length < 2) {
      setError("Give the subject a name (at least 2 letters).");
      setFold(2);
      return;
    }
    if (client && activeSubject?.key.startsWith("new-")) {
      setError("Confirm the new subject (tap ✓) before creating the job.");
      setFold(2);
      return;
    }
    const measEntries = filledFitting(currentMeas());
    if (Object.keys(measEntries).length === 0) {
      setError("Add at least one measurement for the fitting.");
      setFold(2);
      return;
    }
    const priceNum = Number(price.replace(/[^\d.]/g, ""));
    if (!price.trim() || !Number.isFinite(priceNum) || priceNum <= 0) {
      setError("Set an agreed price for the job.");
      setFold(3);
      return;
    }

    const uploading = photos.some((p) => p.status === "uploading");
    const failed = photos.filter((p) => p.status === "error");
    if (uploading) {
      setError("Photos are still uploading — wait a moment.");
      setFold(3);
      return;
    }
    if (failed.length > 0) {
      setError(
        `Retry or remove the ${failed.length} failed photo${failed.length === 1 ? "" : "s"} first.`,
      );
      setFold(3);
      return;
    }
    const styleRef = photos.map((p) => ({ publicId: p.publicId!, alt: p.alt }));

    const jobPayload = {
      description: desc.trim(),
      agreedPrice: priceNum,
      ...(dueDate ? { dueDate } : {}),
      ...(styleRef.length > 0 ? { styleRef } : {}),
    };

    setSubmitting(true);
    try {
      let job: Job;
      if (!client) {

        job = (await createJob({
          customer: {
            name,
            ...(phone.trim() ? { phoneNumber: phone.trim() } : {}),
          },
          subjects: [
            {
              relationship: activeSubject!.relationship,

              ...(activeSubject!.relationship !== "self"
                ? { name: activeSubject!.name.trim() }
                : {}),
              measurements: measEntries,
            },
          ],
          job: jobPayload,
        })).data!;
      } else {

        let measurementId = activeSubject?.latestMeasId;
        if (!measurementId || dirtyMeas.has(activeKey)) {

          const res = await createMeasurement(activeSubject!.subjectId!, {
            measurements: measEntries,
            date: todayISO(),
          });
          measurementId = res.data!.id;
        }
        job = (await createJobForSubject(activeSubject!.subjectId!, {
          measurementId,
          job: jobPayload,
        })).data!;
      }
      setCreated(job);

      invalidateJobWrites();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the job. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const suggestions = useMemo(() => {
    const q = composer.trim().toLowerCase();
    if (!q) return [];
    const matches = COMMON_MEASUREMENTS.filter((n) => n.toLowerCase().includes(q)).slice(0, 6);
    const hasExact = matches.some((n) => n.toLowerCase() === q);
    return [
      ...matches.map((n) => ({ name: n, key: toKey(n), custom: false })),
      ...(!hasExact && q ? [{ name: composer.trim(), key: toKey(composer.trim()), custom: true }] : []),
    ];
  }, [composer]);

  const subjectLabel = (s: ModalSubject) =>
    s.relationship === "self"
      ? client?.name ?? "Self"
      : s.name || "Subject";

  const subjectHue = (s: ModalSubject) =>
    avatarColor(s.relationship === "self" ? (client?.name ?? "") : s.name);

  const dueLabel = dueDate ? formatDay(dueDate) : null;
  const clientLabel = (client?.name ?? query.trim()) || "no client yet";
  const priceNum = Number(price.replace(/[^\d.]/g, "")) || 0;
  const measCount = Object.keys(filledFitting(currentMeas())).length;

  const confirmCreated = () => {
    if (!created) return;
    toast.show({
      title: "Cut and pinned.",
      detail: `${created.description || "Garment"} for ${subjectLabel(activeSubject!)} — ${naira(created.agreedPrice)}${created.dueDate ? `, due ${formatDay(created.dueDate)}` : ""}`,
    });
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="New job">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 w-full animate-fade-in bg-black/50"
      />

      <div className="hig absolute inset-x-0 bottom-0 mx-auto flex h-[92dvh] w-full max-w-107.5 animate-sheet-in flex-col overflow-hidden rounded-t-[26px] border border-b-0 border-(--hig-separator) bg-(--hig-card) shadow-[0_-30px_80px_-20px_rgba(0,0,0,0.5)]">
        <div className="mx-auto mt-3 h-1 w-9.5 shrink-0 rounded-full bg-(--hig-separator)" aria-hidden="true" />

        <div className="flex shrink-0 items-center justify-between border-b border-(--hig-separator) px-5 pb-3 pt-2">
          <h2 className="text-[22px] font-medium tracking-[-0.005em] text-(--hig-label)">
            The cutting <span className="text-(--hig-accent)">table</span>
            <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-(--hig-warning)" aria-hidden="true" />
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

        <div
          className="flex-1 space-y-3 overflow-y-auto px-4 py-3 scrollbar-none [&::-webkit-scrollbar]:hidden"
          onScroll={() => {
            setDdOpen(false);
            setSugOpen(false);
          }}
        >
          <Fold
            num={1}
            name="Client"
            summary={clientLabel === "no client yet" ? "New client" : clientLabel}
            open={fold === 1}
            onToggle={() => setFold(fold === 1 ? 2 : 1)}
          >
            <div ref={ddWrapRef} className="relative">
              <input
                ref={nameInputRef}
                className={inputClass}
                placeholder="Start typing a name…"
                value={query}
                autoComplete="off"
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (client && e.target.value !== client.name) clearClient();
                  if (e.target.value.trim()) {
                    const r = nameInputRef.current?.getBoundingClientRect();
                    if (r) setDdRect({ top: r.bottom, left: r.left, width: r.width });
                    setDdOpen(true);
                  } else {
                    setDdOpen(false);
                  }
                }}
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear client"
                  onClick={clearClient}
                  className="absolute right-3 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-(--hig-separator) text-[11px] text-(--hig-label-secondary) after:absolute after:-inset-3 after:content-['']"
                >
                  ✕
                </button>
              )}

              {ddOpen && ddRect && createPortal(
                <div
                  ref={ddRef}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="hig fixed z-70 max-h-52 animate-fade-in overflow-y-auto rounded-2xl border border-(--hig-separator) bg-(--hig-card) p-1 shadow-(--hig-bar-shadow)"
                  style={{ top: ddRect.top + 6, left: ddRect.left, width: ddRect.width }}
                >
                  {customers === null ? (
                    <div className="px-4 py-3 text-[11px] text-(--hig-label-tertiary)">Loading clients…</div>
                  ) : filteredCustomers.length === 0 ? (
                    <div className="px-4 py-3 text-[11px] text-(--hig-label-tertiary)">
                      No match — this will be a new client.
                    </div>
                  ) : (
                    <>
                      <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-(--hig-label-tertiary)">
                        Returning clients
                      </div>
                      {filteredCustomers.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => pickClient(c)}
                          className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left transition-colors hover:bg-(--hig-accent-tint)"
                        >
                          <span
                            className="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold"
                            style={{
                              backgroundColor: avatarTint(c.name),
                              color: avatarColor(c.name),
                              borderColor: avatarColor(c.name) + "4D",
                            }}
                          >
                            {initials(c.name)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-(--hig-label)">{c.name}</span>
                            <span className="block text-[11px] text-(--hig-label-secondary)">
                              {c.phoneNumber ?? "no phone on file"}
                            </span>
                          </span>
                          <span className="text-[11px] text-(--hig-accent)">→</span>
                        </button>
                      ))}
                    </>
                  )}
                </div>,
                document.body,
              )}
            </div>

            {(!client || !client.phoneNumber) && (
              <input
                className={`${inputClass} mt-2`}
                placeholder="Phone (optional)"
                value={phone}
                autoComplete="off"
                inputMode="tel"
                onChange={(e) => setPhone(e.target.value)}
              />
            )}
            {client?.phoneNumber && (
              <div className="mt-2 flex items-center gap-1.5 text-[10.5px] text-(--hig-label-secondary)">
                <span className="h-1.5 w-1.5 rounded-full bg-(--hig-success) shadow-[0_0_8px_rgba(48,209,88,0.6)]" aria-hidden="true" />
                Phone on file · <b className="font-medium tracking-[0.04em] text-(--hig-label)">{client.phoneNumber}</b>
              </div>
            )}
          </Fold>

          {}
          <Fold
            num={2}
            name="The fitting"
            summary={activeSubject ? subjectLabel(activeSubject) : "Who is it for?"}
            open={fold === 2}
            onToggle={() => setFold(fold === 2 ? 3 : 2)}
          >
            <div className={miniLabelClass}>For whom</div>
            <div className="flex flex-wrap gap-2 pt-2">
              {subjects.map((s) => {
                const hue = subjectHue(s);
                const active = activeKey === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => selectSubject(s)}
                    className={`${chipClass} ${active ? chipOnClass : ""}`}
                    style={
                      active
                        ? {

                            backgroundColor: hue + "1A",
                          }
                        : undefined
                    }
                  >
                    <span
                      className={monoClass}
                      style={{
                        backgroundColor: tintOf(hue),
                        color: hue,
                        borderColor: hue + "4D",
                      }}
                    >
                      {initials(subjectLabel(s))}
                    </span>
                    {subjectLabel(s)}
                    {s.relationship !== "self" && (
                      <span className="text-[11px] text-(--hig-label-tertiary)">{s.relationship}</span>
                    )}
                    {s.loaded && s.latestMeasId && (
                      <span className="text-[11px] text-(--hig-label-tertiary)">· fitted</span>
                    )}
                  </button>
                );
              })}
              {!addingSubject && (
                <button type="button" onClick={startAddSubject} className={`${chipClass} ${chipAddClass}`}>
                  + Add subject
                </button>
              )}
            </div>

            {}
            {addingSubject && activeSubject?.key.startsWith("new-") && (
              <div className="mt-3 animate-fade-in">
                <div className="flex items-center gap-2">
                  <select
                    className="shrink-0 rounded-[10px] border border-(--hig-separator) bg-(--hig-fill) px-2 py-2 text-[11px] text-(--hig-label) outline-none"
                    value={activeSubject.relationship}
                    onChange={(e) =>
                      setSubjects((prev) =>
                        prev.map((x) => (x.key === activeKey ? { ...x, relationship: e.target.value } : x)),
                      )
                    }
                  >
                    {["daughter","son","husband","wife","mother","father","brother","sister","other"].map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <input
                    className={`${inputClass} py-2! text-[12px]`}
                    placeholder="Name"
                    value={activeSubject.name}
                    disabled={subjectSaving}
                    onChange={(e) => {
                      setSubjectError(null);
                      setSubjects((prev) =>
                        prev.map((x) => (x.key === activeKey ? { ...x, name: e.target.value } : x)),
                      );
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmSubject();
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Add subject"
                    disabled={subjectSaving}
                    onClick={confirmSubject}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-(--hig-accent) text-white shadow-(--hig-bar-shadow) transition-all active:scale-95 disabled:opacity-60"
                  >
                    {subjectSaving ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
                    ) : (
                      <CheckIcon />
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label="Cancel add subject"
                    onClick={cancelSubject}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-(--hig-separator) bg-(--hig-fill) text-[10px] text-(--hig-label-secondary) transition-colors hover:text-(--hig-label)"
                  >
                    ✕
                  </button>
                </div>
                {subjectError && (
                  <p className="mt-2 text-[12px] text-(--hig-danger)">{subjectError}</p>
                )}
              </div>
            )}

            <div className={miniLabelClass}>
              Measurements <span className="font-normal normal-case tracking-[0.04em] text-stone">· cm</span>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              {Object.entries(currentMeas()).map(([key, value]) => {

                const hue = avatarColor(key);
                return editingMeas === key ? (
                  <div
                    key={key}
                    className="flex items-center gap-2 rounded-full border py-2 pl-3 pr-2"
                    style={{ backgroundColor: tintOf(hue), borderColor: hue + "4D" }}
                  >
                    <span className="text-[11px] font-semibold" style={{ color: hue }}>{key}</span>
                    <input
                      id="editVal"
                      className="w-13 rounded-lg border border-(--hig-separator) bg-(--hig-fill) py-1 text-center text-[12px] font-medium text-(--hig-label) outline-none"
                      inputMode="decimal"
                      defaultValue={String(value ?? "")}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit(key, (e.target as HTMLInputElement).value);
                      }}
                      onBlur={(e) => commitEdit(key, e.target.value)}
                    />
                    <span className="text-[10px] text-(--hig-label-tertiary)">cm</span>
                    <button
                      type="button"
                      aria-label="Save"
                      className="relative flex h-6 w-6 items-center justify-center rounded-lg bg-(--hig-success) text-white after:absolute after:-inset-3 after:content-['']"
                      onClick={() => commitEdit(key, (document.getElementById("editVal") as HTMLInputElement)?.value ?? "")}
                    >
                      <CheckIcon />
                    </button>
                  </div>
                ) : (
                  <button
                    key={key}
                    type="button"
                    title="Tap to update"
                    onClick={() => setEditingMeas(key)}
                    className={`${chipClass} px-3! py-2!`}
                    style={{ backgroundColor: tintOf(hue) }}
                  >
                    <b className="font-semibold" style={{ color: hue }}>{key}</b>{" "}
                    <b className="font-medium text-(--hig-label)">{value ?? "\u2014"}</b>
                    <span className="text-[10px] text-(--hig-label-secondary)">cm</span>
                    <span
                      aria-label={`Remove ${key}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        const next = { ...currentMeas() };
                        delete next[key];
                        touchMeas(next);
                      }}
                      className="relative flex h-3.75 w-3.75 items-center justify-center rounded-full bg-(--hig-separator) text-[10px] text-(--hig-label-tertiary) hover:text-(--hig-danger) after:absolute after:-inset-3 after:content-['']"
                    >
                      ✕
                    </span>
                  </button>
                );
              })}
            </div>

            {}
            <div ref={compWrapRef} className="relative mt-3">
              <input
                ref={compInputRef}
                className={inputClass}
                placeholder="Type a measurement…"
                value={composer}
                onChange={(e) => {
                  setComposer(e.target.value);
                  setPendingMeas(null);

                  if (e.target.value.trim()) {
                    const r = compInputRef.current?.getBoundingClientRect();
                    if (r) setCompRect({ top: r.bottom, left: r.left, width: r.width });
                    setSugOpen(true);
                  } else {
                    setSugOpen(false);
                  }
                }}
              />
              {sugOpen && composer.trim() && compRect && createPortal(
                <div
                  ref={compRef}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="hig fixed z-70 max-h-43 animate-fade-in overflow-y-auto rounded-2xl border border-(--hig-separator) bg-(--hig-card) p-1 shadow-(--hig-bar-shadow)"
                  style={{ top: compRect.top + 6, left: compRect.left, width: compRect.width }}
                >
                  {suggestions.map((s) => (
                    <button
                      key={s.key + (s.custom ? "-c" : "")}
                      type="button"
                      onClick={() => {

                        if (Object.prototype.hasOwnProperty.call(currentMeas(), s.key)) {
                          setEditingMeas(s.key);
                        } else {
                          setPendingMeas({ key: s.key, name: s.name });
                        }
                        setComposer("");
                        setSugOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-[9px] px-3 py-2 text-left text-[11.5px] transition-colors hover:bg-(--hig-accent-tint) hover:text-(--hig-label) ${
                        s.custom ? "text-(--hig-accent)" : "text-(--hig-label-secondary)"
                      }`}
                    >
                      <span>{s.custom ? `Use "${s.name}"` : s.name}</span>
                      <span className="font-mono text-[10px] text-(--hig-label-secondary)">{s.key}</span>
                    </button>
                  ))}
                </div>,
                document.body,
              )}
            </div>

            {}
            {pendingMeas && (
              <div className="mt-2 flex animate-fade-in items-center gap-2 rounded-xl border border-(--hig-accent-line) bg-(--hig-accent-tint) p-2">
                <span className="shrink-0 text-[11px] font-semibold text-(--hig-accent)">{pendingMeas.name}</span>
                <span className="shrink-0 font-mono text-[10px] text-(--hig-label-secondary)">{pendingMeas.key}</span>
                <input
                  id="pendVal"
                  className="min-w-0 flex-1 rounded-[9px] border border-(--hig-separator) bg-(--hig-fill) px-3 py-2 text-[13px] font-medium text-(--hig-label) outline-none"
                  inputMode="decimal"
                  placeholder="0"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitPending();
                  }}
                />
                <span className="text-[10px] text-(--hig-label-tertiary)">cm</span>
                <button type="button" aria-label="Add value" onClick={commitPending} className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-(--hig-success) text-white after:absolute after:-inset-3 after:content-['']">
                  <CheckIcon />
                </button>
              </div>
            )}

            {}
          </Fold>

          {}
          <Fold
            num={3}
            name="The job"
            summary={priceNum > 0 ? naira(priceNum) : "Set the price"}
            open={fold === 3}
            onToggle={() => setFold(fold === 3 ? 1 : 3)}
          >
            <input
              className={inputClass}
              placeholder="e.g. Gown — purple lace, puff sleeves"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
            <div className={miniLabelClass}>Agreed price</div>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] font-medium text-(--hig-accent)">₦</span>
              <input
                className={`${inputClass} pl-8! text-[17px]! font-medium!`}
                placeholder="0"
                inputMode="numeric"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div className={miniLabelClass}>Due date</div>
            <div className="relative">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-(--hig-accent)">
                <rect x="3.5" y="5" width="17" height="16" rx="3" /><path d="M3.5 10h17" /><path d="M8 3v4" /><path d="M16 3v4" />
              </svg>
              <input
                type="date"
                className={inputClass + " pl-9!"}
                value={dueDate}
                min={todayISO()}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className={miniLabelClass}>Style reference</div>
            <div className="flex flex-wrap gap-2 pt-1">
              {photos.map((p, i) => (
                <div
                  key={p.previewUrl}
                  className={`relative h-24 w-24 shrink-0 overflow-visible rounded-2xl border bg-(--hig-accent-tint) ${
                    p.status === "error"
                      ? "border-(--hig-danger)"
                      : "border-(--hig-accent-line)"
                  }`}
                >
                  <img
                    src={p.previewUrl}
                    alt={p.alt}
                    decoding="async"
                    className={`h-full w-full rounded-[14px] object-cover ${p.status === "done" ? "" : "opacity-70"}`}
                  />
                  {p.status === "uploading" && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-[14px] bg-black/25">
                      <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
                    </span>
                  )}
                  {p.status === "error" && (
                    <button
                      type="button"
                      aria-label="Retry upload"
                      title={p.error}
                      onClick={() => retryPhoto(p)}
                      className="absolute inset-0 flex items-center justify-center rounded-[14px] bg-(--hig-danger)/85 text-white transition-transform active:scale-95"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                        <path d="M3 12a9 9 0 1 0 2.6-6.3" />
                        <path d="M3 4v5h5" />
                      </svg>
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="Remove photo"
                    onClick={() => {

                      URL.revokeObjectURL(p.previewUrl);
                      setPhotos((prev) => prev.filter((_, j) => j !== i));
                    }}
                    className="absolute -right-1.5 -top-1.5 flex h-4.25 w-4.25 items-center justify-center rounded-full border border-(--hig-danger) bg-(--hig-danger-tint) text-[10px] text-(--hig-danger) shadow-(--hig-bar-shadow) after:absolute after:-inset-3 after:content-['']"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <button
                  type="button"
                  aria-label="Add photo"
                  onClick={() => fileRef.current?.click()}
                  className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border-[1.5px] border-dashed border-(--hig-accent-line) bg-(--hig-fill) text-(--hig-accent) transition-transform active:scale-95"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-6 w-6">
                    <path d="M12 5v14" /><path d="M5 12h14" />
                  </svg>
                </button>
              )}
            </div>
            <div className="mt-2 text-[12px] leading-snug text-(--hig-label-tertiary)">
              {photos.some((p) => p.status === "uploading")
                ? "Uploading…"
                : photos.some((p) => p.status === "error")
                  ? "Tap a failed photo to retry."
                  : photos.length > 0
                    ? "Uploaded — ready to create."
                    : "Add a style-reference photo."}
            </div>
            {}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFiles} />
          </Fold>
        </div>

        {}
        {error && (
          <div className="shrink-0 px-4 pb-2">
            <p className="animate-shake rounded-xl bg-(--hig-danger-tint) px-4 py-3 text-[13px] leading-snug text-(--hig-danger)">{error}</p>
          </div>
        )}

        {}
        <div className="flex shrink-0 items-center gap-3 border-t border-(--hig-separator) bg-(--hig-card) px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-(--hig-label-tertiary)">Ticket</div>
            <div className="whitespace-nowrap text-[20px] font-medium leading-none tracking-[-0.02em] text-(--hig-label) [font-variant-numeric:tabular-nums]">
              <small className="mr-0.5 text-[13px] font-medium text-(--hig-accent)">₦</small>
              {priceNum.toLocaleString("en-US")}
            </div>
            <div className="mt-1 truncate whitespace-nowrap text-[12.5px] text-(--hig-label-secondary)">
              {dueLabel ? (
                <>
                  due <b className="font-medium text-(--hig-warning)">{dueLabel}</b> ·{" "}
                </>
              ) : (
                "no due date · "
              )}
              {clientLabel}
            </div>
          </div>
          <button
            type="button"
            onClick={handleCreate}
            disabled={submitting}
            className="flex shrink-0 items-center gap-2 rounded-2xl bg-(--hig-accent) px-5 py-3 text-[14px] font-semibold text-white shadow-(--hig-bar-shadow) transition-all active:scale-95 disabled:opacity-60"
          >
            {submitting ? (
              <span className="h-3.75 w-3.75 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-3.75 w-3.75">
                <path d="M12 5v14" /><path d="M5 12h14" />
              </svg>
            )}
            {submitting ? "Creating…" : "Create job"}
          </button>
        </div>

        {}
        {created && (
          <div className="absolute inset-0 z-40 flex animate-fade-in flex-col items-center justify-center rounded-t-[26px] bg-(--hig-card) px-8 text-center">
            <div className="mb-4 flex h-15.5 w-15.5 items-center justify-center rounded-full border border-(--hig-success) bg-(--hig-success-tint) shadow-[0_0_30px_-8px_rgba(48,209,88,0.45)]">
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--hig-success)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-6.5 w-6.5">
                <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
              </svg>
            </div>
            <h3 className="text-[22px] font-medium text-(--hig-label)">
              Cut and <span className="text-(--hig-success)">pinned</span>.
            </h3>
            <p className="mt-3 text-[16px] leading-snug text-(--hig-label)">
              {created.description || "Garment"} for {subjectLabel(activeSubject!)} — {naira(created.agreedPrice)}.
            </p>
            {}
            <p className="mt-2 text-[13.5px] text-(--hig-label-secondary)">
              {created.dueDate ? `due ${formatDay(created.dueDate)}` : "no due date"} · {measCount} measurement{measCount === 1 ? "" : "s"} saved
            </p>
            <div className="mt-4 flex w-full gap-3">
              <button
                type="button"
                onClick={confirmCreated}
                className="flex-1 rounded-[13px] border border-(--hig-separator) bg-(--hig-fill) py-3 text-[14px] font-semibold text-(--hig-label-secondary) transition-colors hover:text-(--hig-label)"
              >
                Done
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!created) return;

                  onClose();
                  router.push(`/jobs/${created.id}`);
                }}
                className="flex-1 rounded-[13px] bg-(--hig-accent) py-3 text-[14px] font-semibold text-white shadow-(--hig-bar-shadow) transition-colors"
              >
                View job
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Fold({
  num,
  name,
  summary,
  open,
  onToggle,
  children,
}: {
  num: number;
  name: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className={`overflow-hidden rounded-[18px] border border-(--hig-separator) bg-(--hig-card) transition-colors ${open ? "border-(--hig-accent-line)" : ""}`}>
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3">
        <span className={`w-6 shrink-0 text-right text-[15px] transition-colors ${open ? "font-semibold text-(--hig-accent)" : "text-(--hig-label-tertiary)"}`}>
          {num}
        </span>
        <span className="flex-1 text-left text-[15px] font-semibold tracking-[0.01em] text-(--hig-label)">{name}</span>
        <span className="max-w-27.5 truncate text-[11px] text-(--hig-label-secondary)">{summary}</span>
        <span className={`flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full border border-(--hig-separator) bg-(--hig-fill) text-(--hig-label-secondary) transition-transform duration-300 ${open ? "rotate-180 text-(--hig-accent)" : ""}`}>
          <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="h-2.5 w-2.5">
            <path d="M1.5 3.5 5 7l3.5-3.5" />
          </svg>
        </span>
      </button>
      {}
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="px-4 pb-4 pt-1">{children}</div>
        </div>
      </div>
    </section>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
      <path d="M5 12.5 10 17.5 19 6.5" />
    </svg>
  );
}