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
import { MEASUREMENT_KEYS, measureLabel } from "@/lib/measurements";
import type { Customer } from "@/types/customer";
import type { Job } from "@/types/job";
import type { Measurement } from "@/types/measurement";
import type { Subject } from "@/types/subject";

import { formatDay, initials, naira, todayISO } from "@/lib/format";

/**
 * The wizard's fittings are sparse records: only fields actually measured are present. The
 * composer is the entry point — the tailor types what the tape said, and the API takes a sparse
 * record (the dossier's book renders "not taken" for any key it omits).
 */

/** A measurement the composer invented ("Sleeve cap") still needs a stable record key. */
function toKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, "");
}

function filledFitting(
  meas: Record<string, number | null>,
): Record<string, number | null> {
  // The API contract is sparse: only the fields actually measured are sent (the schema wants
  // ≥1 entry; the dossier's book renders "not taken" for any key a record omits). The map over
  // MEASUREMENT_KEYS just guarantees a stable key per entry; the filter drops the absent ones.
  return Object.fromEntries(
    MEASUREMENT_KEYS.map((key) => [key, meas[key] ?? null]).filter(([, v]) => v !== null),
  );
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

const monoClass =
  "flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold";

const miniLabelClass =
  "mt-6 text-[12px] font-semibold uppercase tracking-[0.16em] text-(--hig-label-secondary)";

/**
 * The three stations of the flow, in the order the work actually happens: whose money, whose
 * body, what garment. The rail renders from this array, so the rail and the gates can never
 * disagree about what the steps are or what order they come in.
 */
const STEPS = [
  { name: "Client", hint: "Whose commission" },
  { name: "The fitting", hint: "Body & measurements" },
  { name: "The job", hint: "Garment & price" },
] as const;

export default function NewJobModal({
  open,
  onClose,
  prefillCustomer,
  prefillSubjectId,
}: {
  open: boolean;
  onClose: () => void;
  /**
   * Open the wizard already pointed at this client — the client file's "New job for {name}"
   * action. `pickClient` does the real work (loads their subjects, selects the first), so the
   * prefill only needs to hand over the record; the `?? undefined` keeps the prop optional
   * without leaking `null` into the effect's dependency array.
   */
  prefillCustomer?: Customer | null;
  /**
   * The dossier's switcher selection: "New job for Ike" must open on Ike, not on the client's
   * first subject. Passed only when the tapped button named a subject; the wizard falls back
   * to its own first-subject default when absent or when that subject no longer exists.
   */
  prefillSubjectId?: string | null;
}) {

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

  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [slideDir, setSlideDir] = useState<"fwd" | "back">("fwd");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Bumped with every error set, so the shake animation replays (the node remounts). */
  const [errorSeq, setErrorSeq] = useState(0);
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
    setMeas({ new: {} });
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
    setStep(0);
    setSlideDir("fwd");
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

    // The client file's action opens the wizard mid-flow: client already chosen, subjects about
    // to load. `pickClient` is the same path a manual pick takes, so the prefilled wizard is the
    // ordinary wizard, one step ahead — no second code path to maintain.
    const seed = prefillCustomer ?? undefined;
    if (seed) void pickClient(seed, prefillSubjectId);

    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open, queryClient, prefillCustomer, prefillSubjectId]);

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

  /**
   * Step gates — the questions each stage must answer before the flow slides on.
   *
   * Returning the step number to fix (instead of a bare boolean) lets the Next button walk the
   * user to the first blocker: the error message and the slide-to-step share one decision.
   */
  const gateFor = (s: 0 | 1 | 2): string | null => {
    if (s === 0) {
      const name = (client?.name ?? query).trim();
      if (name.length < 2 || !NAME_RE.test(name)) {
        return "Name must be at least 2 letters (letters, spaces, apostrophes, hyphens only).";
      }
      if (!client && phone.trim() && !PHONE_RE.test(phone.trim())) {
        return "Phone must be 7–15 digits, optionally starting with +.";
      }
      return null;
    }
    if (s === 1) {
      if (activeSubject && activeSubject.relationship !== "self" && activeSubject.name.trim().length < 2) {
        return "Give the subject a name (at least 2 letters).";
      }
      if (client && activeSubject?.key.startsWith("new-")) {
        return "Confirm the new subject (tap ✓) before continuing.";
      }
      if (Object.keys(filledFitting(meas[activeKey] ?? {})).length === 0) {
        return "Add at least one measurement for the fitting.";
      }
      return null;
    }
    const priceNum = Number(price.replace(/[^\d.]/g, ""));
    if (!price.trim() || !Number.isFinite(priceNum) || priceNum <= 0) {
      return "Set an agreed price for the job.";
    }
    const uploading = photos.some((p) => p.status === "uploading");
    if (uploading) return "Photos are still uploading — wait a moment.";
    const failed = photos.filter((p) => p.status === "error");
    if (failed.length > 0) {
      return `Retry or remove the ${failed.length} failed photo${failed.length === 1 ? "" : "s"} first.`;
    }
    return null;
  };

  /** Slide to a step, recording the direction so the panel knows which way to move. */
  function goTo(next: 0 | 1 | 2) {
    setSlideDir(next > step ? "fwd" : "back");
    setStep(next);
  }

  /** Next = validate the current stage; only a pass lets the sheet slide forward. */
  function tryAdvance() {
    const problem = gateFor(step);
    if (problem) {
      setError(problem);
      setErrorSeq((n) => n + 1);
      return;
    }
    setError(null);
    goTo((step + 1) as 0 | 1 | 2);
  }

  function clearClient() {
    setClient(null);
    setQuery("");
    setDdOpen(false);
    setAddingSubject(false);
    setSubjectError(null);
    setPhone("");
    setSubjects([{ key: "new", relationship: "self", name: "", loaded: true }]);
    setActiveKey("new");
    setMeas({ new: {} });
    setDirtyMeas(new Set());
  }

  async function pickClient(c: Customer, preferSubjectId?: string | null) {
    setClient(c);
    setQuery(c.name);
    setDdOpen(false);
    setAddingSubject(false);
    setSubjectError(null);
    setPhone("");
    setError(null);

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
    const chosen =
      mapped.find((s) => s.subjectId && s.subjectId === preferSubjectId) ??
      mapped[0];
    setActiveKey(chosen?.key ?? "");
    setMeas({});
    setDirtyMeas(new Set());

    if (chosen) await selectSubject(chosen);

    // Choosing the client IS the step: slide to the fitting as soon as her subjects are loaded
    // and the first fitting (if any) is on the table. Back stays available via the rail.
    setSlideDir("fwd");
    setStep(1);
  }

  function startAddSubject() {

    const key = "new-" + Math.random().toString(36).slice(2, 7);
    setSubjects((prev) => [
      ...prev.filter((x) => !x.key.startsWith("new-")),
      { key, relationship: "daughter", name: "", loaded: true },
    ]);
    setActiveKey(key);
    setMeas((prev) => ({ ...prev, [key]: prev[key] ?? {} }));
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
          next[created.id] = carried ?? {};
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
      setMeas((prev) => (prev[subj.key] ? prev : { ...prev, [subj.key]: {} }));
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
      setMeas((prev) => (prev[subj.key] ? prev : { ...prev, [subj.key]: {} }));
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

    // A final gate pass over all three stations — the same rules the Next buttons enforce,
    // re-run over the whole form, so nothing slipped through a back-navigation edit.
    for (const s of [0, 1, 2] as const) {
      const problem = gateFor(s);
      if (problem) {
        setError(problem);
        setErrorSeq((n) => n + 1);
        goTo(s);
        return;
      }
    }

    const name = (client?.name ?? query).trim();
    const measEntries = filledFitting(currentMeas());
    const priceNum = Number(price.replace(/[^\d.]/g, ""));
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
      setErrorSeq((n) => n + 1);
    } finally {
      setSubmitting(false);
    }
  }

  const suggestions = useMemo(() => {
    const q = composer.trim().toLowerCase();
    if (!q) return [];
    const fields = MEASUREMENT_KEYS.map((key) => ({ key, name: measureLabel(key) }));
    const matches = fields.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 6);
    // Custom entries stay opt-in: the offer only appears on an exact Enter-style match miss,
    // so typing "bust" suggests the field rather than advertising a one-off "bust" key.
    const hasCustom = matches.length === 0;
    return [
      ...matches.map((f) => ({ name: f.name, key: f.key, custom: false })),
      ...(hasCustom ? [{ name: composer.trim(), key: toKey(composer.trim()), custom: true }] : []),
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

  /** The step rail's own truth: done stations carry their answer, the active one glows. */
  const railSummaries = [
    clientLabel === "no client yet" ? "New client" : clientLabel,
    activeSubject ? subjectLabel(activeSubject) : "Who is it for?",
    priceNum > 0 ? naira(priceNum) : "Set the price",
  ];

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="New job">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 w-full animate-fade-in bg-black/50"
      />

      <div className="hig absolute inset-x-0 bottom-0 mx-auto flex h-[92dvh] w-full sm:max-w-107.5 animate-sheet-in flex-col overflow-hidden rounded-t-[26px] border border-b-0 border-(--hig-separator) bg-(--hig-card) shadow-[0_-30px_80px_-20px_rgba(0,0,0,0.5)]">
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
        <div className="shrink-0 px-4 pb-3 pt-3">
          <div className="flex items-center gap-1.5 rounded-[14px] border border-(--hig-separator) bg-(--hig-fill) p-1.5">
            {STEPS.map((s, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => i <= step && goTo(i as 0 | 1 | 2)}
                  disabled={i > step}
                  aria-current={active ? "step" : undefined}
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-[10px] border px-2 py-1.5 text-left transition-colors ${
                    active
                      ? "border-(--hig-accent-line) bg-(--hig-accent-tint)"
                      : done
                        ? "border-(--hig-success)/30 bg-(--hig-success-tint)"
                        : "border-transparent"
                  }`}
                >
                  <span
                    className={`flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold transition-colors ${
                      active
                        ? "bg-(--hig-accent) text-white"
                        : done
                          ? "bg-(--hig-success) text-white"
                          : "border border-(--hig-separator) bg-(--hig-card) text-(--hig-label-tertiary)"
                    }`}
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={`block truncate text-[11px] font-semibold leading-tight ${
                        active ? "text-(--hig-accent)" : done ? "text-(--hig-label)" : "text-(--hig-label-tertiary)"
                      }`}
                    >
                      {s.name}
                    </span>
                    <span className="block truncate text-[9.5px] leading-tight text-(--hig-label-tertiary)">
                      {done || active ? railSummaries[i] : s.hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div
          className="flex-1 space-y-3 overflow-y-auto px-4 py-3 scrollbar-none [&::-webkit-scrollbar]:hidden"
          onScroll={() => {
            setDdOpen(false);
            setSugOpen(false);
          }}
        >
          <div key={step} className={slideDir === "fwd" ? "animate-slide-fwd" : "animate-slide-back"}>
            {step === 0 && (
        <section className="space-y-3">
            <div ref={ddWrapRef} className="relative">
              <input
                ref={nameInputRef}
                className={`${inputClass} text-[15px]! font-medium!`}
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
                className={inputClass}
                placeholder="Phone (optional)"
                value={phone}
                autoComplete="off"
                inputMode="tel"
                onChange={(e) => setPhone(e.target.value)}
              />
            )}
            {client?.phoneNumber && (
              <div className="flex items-center gap-1.5 text-[10.5px] text-(--hig-label-secondary)">
                <span className="h-1.5 w-1.5 rounded-full bg-(--hig-success) shadow-[0_0_8px_rgba(48,209,88,0.6)]" aria-hidden="true" />
                Phone on file · <b className="font-medium tracking-[0.04em] text-(--hig-label)">{client.phoneNumber}</b>
              </div>
            )}
        </section>
            )}
          {step === 1 && (
        <section className="space-y-3">
            <div className={miniLabelClass}>For whom</div>
            <div className="grid grid-cols-2 gap-2">
              {subjects.map((s) => {
                const hue = subjectHue(s);
                const active = activeKey === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => selectSubject(s)}
                    className={`relative flex flex-col justify-between rounded-2xl border-2 p-3 text-left transition-all active:scale-[0.98] ${
                      active
                        ? "border-(--hig-accent) bg-(--hig-accent-tint)"
                        : "border-(--hig-separator) bg-(--hig-card)"
                    }`}
                  >
                    <span className="flex items-center justify-between">
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
                      {active && (
                        <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-(--hig-accent) text-white">
                          <CheckIcon />
                        </span>
                      )}
                    </span>
                    <span className="mt-2 block truncate text-[13px] font-semibold text-(--hig-label)">
                      {subjectLabel(s)}
                    </span>
                    <span className="block truncate text-[10.5px] text-(--hig-label-secondary)">
                      {s.relationship !== "self" ? `(${s.relationship})` : "Self"}
                      {s.loaded && s.latestMeasId ? " · fitted" : ""}
                    </span>
                  </button>
                );
              })}
              {!addingSubject && (
                <button
                  type="button"
                  onClick={startAddSubject}
                  className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-(--hig-accent-line) bg-(--hig-fill) text-(--hig-accent) transition-all active:scale-[0.98]"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-(--hig-accent-tint)">
                    +
                  </span>
                  <span className="text-[12px] font-semibold">Add subject</span>
                </button>
              )}
            </div>
            {addingSubject && activeSubject?.key.startsWith("new-") && (
              <div className="animate-fade-in">
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
              Measurements <span className="font-normal normal-case tracking-[0.04em] text-stone">· inches</span>
            </div>
            {Object.keys(filledFitting(currentMeas())).length === 0 && (
              <p className="rounded-xl border border-dashed border-(--hig-separator) bg-(--hig-fill) px-4 py-3 text-[12.5px] leading-snug text-(--hig-label-secondary)">
                Nothing measured yet — type below to add the first measurement.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 pt-2 sm:grid-cols-3">
              {Object.entries(currentMeas())
                .filter(([, value]) => value !== null)
                .map(([key, value]) => {
                const hue = subjectHue(activeSubject ?? { key: activeKey, relationship: "self", name: "", loaded: true });
                return editingMeas === key ? (
                  <div
                    key={key}
                    className="col-span-2 flex items-center gap-2 rounded-xl border border-(--hig-accent-line) bg-(--hig-accent-tint) py-2.5 pl-3.5 pr-2 sm:col-span-1"
                  >
                    <span className="text-[12px] font-semibold text-(--hig-label-secondary)">{measureLabel(key)}</span>
                    <input
                      id="editVal"
                      className="w-14 rounded-lg border border-(--hig-separator) bg-(--hig-card) py-1.5 text-center text-[13px] font-semibold text-(--hig-label) outline-none"
                      inputMode="decimal"
                      defaultValue={String(value ?? "")}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit(key, (e.target as HTMLInputElement).value);
                      }}
                      onBlur={(e) => commitEdit(key, e.target.value)}
                    />
                    <span className="text-[11px] text-(--hig-label-tertiary)">″</span>
                    <button
                      type="button"
                      aria-label="Save"
                      className="relative ml-auto flex h-7 w-7 items-center justify-center rounded-lg bg-(--hig-success) text-white after:absolute after:-inset-3 after:content-['']"
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
                    style={{ backgroundColor: hue + "1F", borderColor: hue + "45" }}
                    className="relative flex items-baseline justify-between gap-1.5 rounded-xl border px-3.5 py-3 text-left transition-all active:scale-[0.98]"
                  >
                    <span className="text-[12px] font-medium text-(--hig-label-secondary)">{measureLabel(key)}</span>
                    <span className="text-[15px] font-semibold text-(--hig-label) [font-variant-numeric:tabular-nums]">
                      {value}
                      <span className="ml-0.5 text-[10px] font-normal text-(--hig-label-tertiary)">″</span>
                    </span>
                    <span
                      aria-label={`Remove ${key}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        const next = { ...currentMeas() };
                        delete next[key];
                        touchMeas(next);
                      }}
                      className="absolute -right-1.5 -top-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full border bg-(--hig-card) text-[9px] text-(--hig-label-tertiary) hover:text-(--hig-danger) after:absolute after:-inset-3 after:content-['']"
                    >
                      ✕
                    </span>
                  </button>
                );
              })}
            </div>
            <div ref={compWrapRef} className="relative mt-4">
              <input
                ref={compInputRef}
                className={inputClass}
                placeholder="Type a measurement — e.g. bust, sleeve, length…"
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
                            // Edit only when a real value exists — an absent or never-taken key
                            // opens the fresh-entry row instead.
                            if (currentMeas()[s.key] != null) {
                              setEditingMeas(s.key);
                            } else {
                              setPendingMeas({ key: s.key, name: s.name });
                            }
                            setComposer("");
                            setSugOpen(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-[9px] px-3 py-2.5 text-left text-[12.5px] transition-colors hover:bg-(--hig-accent-tint) hover:text-(--hig-label) ${
                            s.custom ? "text-(--hig-accent)" : "text-(--hig-label)"
                          }`}
                        >
                          <span className="font-medium">{s.custom ? `Use "${s.name}"` : s.name}</span>
                          {s.custom && <span className="text-[10px] text-(--hig-label-tertiary)">custom field</span>}
                        </button>
                      ))}
                    </div>,
                    document.body,
                  )}
            </div>
            {pendingMeas && (
              <div className="mt-2 flex animate-fade-in items-center gap-2 rounded-xl border border-(--hig-accent-line) bg-(--hig-accent-tint) p-2">
                <span className="shrink-0 text-[12px] font-semibold text-(--hig-accent)">{pendingMeas.name}</span>
                <input
                  id="pendVal"
                  className="min-w-0 flex-1 rounded-[9px] border border-(--hig-separator) bg-(--hig-card) px-3 py-2 text-[14px] font-semibold text-(--hig-label) outline-none"
                  inputMode="decimal"
                  placeholder="0"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitPending();
                  }}
                />
                <span className="text-[11px] text-(--hig-label-tertiary)">″</span>
                <button type="button" aria-label="Add value" onClick={commitPending} className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-(--hig-success) text-white after:absolute after:-inset-3 after:content-['']">
                  <CheckIcon />
                </button>
              </div>
            )}
        </section>
          )}
          {step === 2 && (
        <section className="space-y-3">
            <input
              className={inputClass}
              placeholder="e.g. Gown — purple lace, puff sleeves"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
            <div className={miniLabelClass}>Agreed price</div>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] font-medium text-(--hig-accent)">&#8358;</span>
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
                  <img loading="lazy"
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
                    &#10005;
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
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFiles} />
        </section>
          )}
          </div>
        </div>
        {error && (
          <div className="shrink-0 px-4 pb-2">
            <p key={errorSeq} className="animate-shake rounded-xl bg-(--hig-danger-tint) px-4 py-3 text-[13px] leading-snug text-(--hig-danger)">{error}</p>
          </div>
        )}
        <div className="flex shrink-0 items-center gap-3 border-t border-(--hig-separator) bg-(--hig-card) px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => {
                setError(null);
                goTo((step - 1) as 0 | 1 | 2);
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-(--hig-separator) bg-(--hig-fill) text-(--hig-label-secondary) transition-all active:scale-95"
              aria-label="Back"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="flex h-11 shrink-0 items-center rounded-2xl px-3 text-[14px] font-medium text-(--hig-label-secondary) transition-colors hover:text-(--hig-label)"
            >
              Cancel
            </button>
          )}
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
            onClick={step < 2 ? tryAdvance : handleCreate}
            disabled={submitting}
            className="flex shrink-0 items-center gap-2 rounded-2xl bg-(--hig-accent) px-5 py-3 text-[14px] font-semibold text-white shadow-(--hig-bar-shadow) transition-all active:scale-95 disabled:opacity-60"
          >
            {submitting ? (
              <span className="h-3.75 w-3.75 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
            ) : step < 2 ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-3.75 w-3.75">
                <path d="M9 6l6 6-6 6" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-3.75 w-3.75">
                <path d="M12 5v14" /><path d="M5 12h14" />
              </svg>
            )}
            {step < 2 ? "Next" : submitting ? "Creating…" : "Create job"}
          </button>
        </div>
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

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
      <path d="M5 12.5 10 17.5 19 6.5" />
    </svg>
  );
}
