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
import { parseMeasurementInput, formatMeasurement, formatMeasurementInput } from "@/lib/measurement-input";
import type { MeasurementValue } from "@/lib/measurement-input";
import type { Customer } from "@/types/customer";
import type { Job } from "@/types/job";
import type { Measurement } from "@/types/measurement";
import type { Subject } from "@/types/subject";

import { formatDay, initials, naira, todayISO } from "@/lib/format";
import { useDismiss } from "@/lib/use-dismiss";

/**
 * The new-job sheet is ONE scrollable page — client, fitting, and job details stacked in the
 * order the work happens, with a single Create button. The fittings stay sparse records: only
 * fields actually measured are present. The composer is the entry point — the tailor types what
 * the tape said, and the API takes a sparse record (the dossier's book renders "not taken" for
 * any key it omits).
 */

/**
 * Draft storage is PER CLIENT: the key is derived from the intended client's name, so
 * switching clients swaps contexts instead of mixing them — go back to client A and her
 * half-typed fittings are still there; client B never sees a single one of A's numbers.
 *
 * With no steps to remember, a draft is just "the text fields + the measurements as she left
 * them" — restoring it puts everything on screen at once, so there is no step to second-guess.
 */
const draftKeyFor = (clientName: string) =>
  "hollyseams:job-wizard-draft:" + (clientName.trim().toLowerCase() || "_anon");

interface WizardDraft {
  query: string;
  phone: string;
  desc: string;
  price: string;
  dueDate: string;
  savedAt: number;
  activeKey: string;
  /** Subject chips must survive too, or their measurements restore as unreachable orphans. */
  subjects: Array<{ key: string; subjectId?: string; relationship: string; name: string }>;
  meas: Record<string, Record<string, MeasurementValue | null>>;
}

/** A measurement the composer invented ("Sleeve cap") still needs a stable record key. */
function toKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, "");
}

function filledFitting(
  meas: Record<string, MeasurementValue | null>,
): Record<string, MeasurementValue | null> {
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

/** One recipe for every field — see the `input-field` utility in globals.css. */
const inputClass =
  "input-field w-full rounded-xl px-4 py-3 text-[15px] text-(--hig-label) outline-none";

const miniLabelClass =
  "mt-5 text-[11px] font-semibold uppercase tracking-[0.1em] text-(--hig-label-secondary)";

/**
 * The value well: dimmed until a measurement field is armed, then the ring marks where
 * the number goes.
 */
const wellClass = (armed: boolean) =>
  `w-24 shrink-0 rounded-xl px-2 py-3 text-center text-[15px] font-semibold [font-variant-numeric:tabular-nums] text-(--hig-label) outline-none placeholder:text-[11px] placeholder:font-medium ${
    armed ? "input-field shadow-[0_0_0_1px_var(--hig-accent-line)]" : "input-field opacity-60"
  }`;

const sectionErrorClass =
  "animate-shake rounded-xl bg-(--hig-danger-tint) px-4 py-3 text-[13px] leading-snug text-(--hig-danger)";

type SectionErrors = { client: string | null; fitting: string | null; job: string | null };
const emptyErrors: SectionErrors = { client: null, fitting: null, job: null };

export default function NewJobModal({
  open,
  onClose,
  prefillCustomer,
  prefillSubjectId,
}: {
  open: boolean;
  onClose: () => void;
  /**
   * Open the sheet already pointed at this client — the client file's "New job for {name}"
   * action. `pickClient` does the real work (loads their subjects, selects the first), so the
   * prefill only needs to hand over the record; the `?? undefined` keeps the prop optional
   * without leaking `null` into the effect's dependency array.
   */
  prefillCustomer?: Customer | null;
  /**
   * The dossier's switcher selection: "New job for Ike" must open on Ike, not on the client's
   * first subject. Passed only when the tapped button named a subject; the sheet falls back
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
  const [meas, setMeas] = useState<Record<string, Record<string, MeasurementValue | null>>>({});
  /**
   * Who the GENERIC measurement bucket ("new"/"new-*" subjects — not bound to any saved
   * subject ID) belongs to. Client-bound buckets carry their subject IDs, so they can never
   * submit under another client; the generic bucket is only as safe as its owner, so every
   * edit stamps the owner and the draft writer strips generic values that changed hands.
   */
  const [genericMeasOwner, setGenericMeasOwner] = useState("");
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

  const [submitting, setSubmitting] = useState(false);
  /**
   * Validation is PER SECTION, set when Create is pressed and cleared the moment that
   * section's inputs change again — the error lives next to the fields it is about.
   */
  const [errors, setErrors] = useState<SectionErrors>(emptyErrors);
  /** Bumped with every validation pass, so the shake animation replays (the node remounts). */
  const [errorSeq, setErrorSeq] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Job | null>(null);

  const ddWrapRef = useRef<HTMLDivElement>(null);
  const ddRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [ddRect, setDdRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const compWrapRef = useRef<HTMLDivElement>(null);
  const compRef = useRef<HTMLDivElement>(null);
  const compInputRef = useRef<HTMLInputElement>(null);
  // Anchor = the composer's BOTTOM edge: the panel opens below the field (per the tailor's
  // preference) — she scrolls the sheet itself when the keyboard hides it.
  const [compRect, setCompRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [sugOpen, setSugOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /** Scroll targets for "walk her to the first blocker" on a failed Create. */
  const clientRef = useRef<HTMLElement>(null);
  const fittingRef = useRef<HTMLElement>(null);
  const jobRef = useRef<HTMLElement>(null);

  /**
   * The sheet's measurement draft lives in localStorage so a stray close or refresh never
   * costs a live measuring session. Written on every touch (inside the setState updater, so
   * the persisted snapshot can never lag the committed state), restored once on open, cleared
   * the moment a job is actually created. Storage failures are swallowed by design: a missing
   * draft degrades to today's behavior, it must never surface as an error.
   */
  /**
   * ONE writer for the whole draft. It runs whenever any draft-relevant field changes while
   * the sheet is open — measurements, price, description, due date, phone — so the snapshot
   * can never lag behind what's on screen. The key is the intended client, so a half-typed
   * job for A never bleeds into a job for B.
   */
  const intendedClient = (client?.name ?? query).trim();
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    // Generic-bucket values may only ride along under their owner, and subject-bound values
    // only when the selected client still matches the intended name — a retype without
    // re-picking must never smuggle another client's subjects into this draft.
    const clientMatches = !client || client.name.trim() === intendedClient;
    const safeMeas: typeof meas = {};
    for (const [subjKey, values] of Object.entries(meas)) {
      const isGeneric = subjKey === "new" || subjKey.startsWith("new-");
      if (isGeneric) {
        if (genericMeasOwner === intendedClient) safeMeas[subjKey] = values;
      } else if (clientMatches) {
        safeMeas[subjKey] = values;
      }
    }
    const hasMeas = Object.values(safeMeas).some((m) => Object.keys(m ?? {}).length > 0);
    const hasAnything = hasMeas || desc || price || dueDate || phone || query;
    try {
      if (!hasAnything) {
        window.localStorage.removeItem(draftKeyFor(intendedClient));
        return;
      }
      const draft: WizardDraft = {
        query, phone, desc, price, dueDate, savedAt: Date.now(),
        activeKey,
        subjects: subjects.map((s) => ({
          key: s.key,
          ...(s.subjectId ? { subjectId: s.subjectId } : {}),
          relationship: s.relationship,
          name: s.name,
        })),
        meas: safeMeas,
      };
      window.localStorage.setItem(draftKeyFor(intendedClient), JSON.stringify(draft));
    } catch {
      /* private mode / quota — drafts are a convenience, not a contract */
    }
  }, [open, query, phone, desc, price, dueDate, meas, client?.name, intendedClient, genericMeasOwner, activeKey, subjects]);

  /**
   * Resume after a close/crash: restore the most recently saved draft (any client), text
   * fields and measurements alike. Everything is on one page, so restoring IS arriving —
   * no step to reconstruct, no position to second-guess.
   */
  function restoreLastDraft(): void {
    if (typeof window === "undefined") return;
    try {
      let best: WizardDraft | null = null;
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (!key || !key.startsWith("hollyseams:job-wizard-draft:")) continue;
        const raw = window.localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as WizardDraft;
        if (!best || (parsed.savedAt ?? 0) > (best.savedAt ?? 0)) best = parsed;
      }
      if (!best) return;
      if (best.query) setQuery(best.query);
      if (best.phone) setPhone(best.phone);
      if (best.desc) setDesc(best.desc);
      if (best.price) setPrice(best.price);
      if (best.dueDate) setDueDate(best.dueDate);
      const hasMeas = Object.values(best.meas ?? {}).some((m) => Object.keys(m ?? {}).length > 0);
      if (hasMeas) {
        setMeas(best.meas);
        setGenericMeasOwner(best.query?.trim() ?? "");
        setDirtyMeas(new Set(Object.keys(best.meas)));
      }
      // Subjects (including ones she added mid-flow) come back exactly as they were, so their
      // measurements render again instead of orphaning. latestMeasId is deliberately dropped:
      // every restored key is marked dirty, so submit re-creates the fitting from these values.
      if (best.subjects?.length) {
        setSubjects(best.subjects.map((s) => ({ ...s, loaded: true })));
        const stillThere = best.subjects.some((s) => s.key === best.activeKey);
        setActiveKey(stillThere ? best.activeKey : (best.subjects[0]?.key ?? "new"));
      }
    } catch {
      /* a corrupt draft is still just "no draft" */
    }
  }
  /** Every object URL this sheet has created, so unmount can revoke all of them. */
  const previewUrlsRef = useRef<string[]>([]);
  const activeSubject = subjects.find((s) => s.key === activeKey) ?? null;

  useDismiss(onClose, open);

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
    setError(null);
    setErrors(emptyErrors);
    setCreated(null);

    // A saved draft (survived a close, refresh, or crash) beats the blank slate — but never
    // in a seeded flow, which opens pointed at a specific client on purpose.
    if (!prefillCustomer) restoreLastDraft();

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

    // The client file's action opens the sheet mid-flow: client already chosen, subjects about
    // to load. `pickClient` is the same path a manual pick takes, so the prefilled sheet is the
    // ordinary sheet, one step ahead — no second code path to maintain.
    const seed = prefillCustomer ?? undefined;
    if (seed) void pickClient(seed, prefillSubjectId);
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

  /** Outside taps close the two suggestion popovers; Escape is `useDismiss`'s now. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!(ddWrapRef.current?.contains(t) || ddRef.current?.contains(t))) setDdOpen(false);
      if (!(compWrapRef.current?.contains(t) || compRef.current?.contains(t))) setSugOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const filteredCustomers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (customers ?? []).filter((c) => c.name.toLowerCase().includes(q));
  }, [customers, query]);

  /**
   * Section gates — the questions each part of the page must answer before Create goes
   * through. Create runs all three and walks her to the first blocker, so nothing slipped
   * through an edit after the fact.
   */
  const gateClient = (): string | null => {
    const name = (client?.name ?? query).trim();
    if (name.length < 2 || !NAME_RE.test(name)) {
      return "Name must be at least 2 letters (letters, spaces, apostrophes, hyphens only).";
    }
    if (!client && phone.trim() && !PHONE_RE.test(phone.trim())) {
      return "Phone must be 7–15 digits, optionally starting with +.";
    }
    return null;
  };

  const gateFitting = (): string | null => {
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
  };

  const gateJob = (): string | null => {
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

  function clearClient() {
    setClient(null);
    setQuery("");
    setDdOpen(false);
    setAddingSubject(false);
    setSubjectError(null);
    setPhone("");
    setSubjects([{ key: "new", relationship: "self", name: "", loaded: true }]);
    setActiveKey("new");
    setErrors((prev) => (prev.client === null ? prev : { ...prev, client: null }));
    // DELIBERATELY not touching meas/dirtyMeas: measurements under the generic "new"
    // subject are the tailor's in-progress work and follow her to the corrected flow.
    // Anything tied to a specific client's subject IDs simply stops being reachable here —
    // it can never leak into another client's record, and it lives on in that client's draft.
  }

  async function pickClient(c: Customer, preferSubjectId?: string | null) {
    setClient(c);
    setQuery(c.name);
    setDdOpen(false);
    setAddingSubject(false);
    setSubjectError(null);
    setPhone("");
    setError(null);
    setErrors(emptyErrors);

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
    /**
     * The customer themself is always a choice, even when the API holds no self subject row —
     * the normal case for a client whose first job was created for a relative, because
     * subjects are only written when someone is actually measured. Without this chip the
     * Self option silently disappears for exactly those clients. It carries no subjectId;
     * submit creates the row lazily, on the first Self job.
     */
    const hasSelf = rows.some((s) => (s.relationship ?? "self") === "self");
    const mapped: ModalSubject[] = [
      ...(hasSelf
        ? []
        : [{ key: "self", relationship: "self", name: "", loaded: true } satisfies ModalSubject]),
      ...rows.map((s: Subject) => ({
        key: s.id,
        subjectId: s.id,
        relationship: s.relationship ?? "self",
        name: s.name,
        loaded: false,
      })),
    ];
    setSubjects(mapped);
    const chosen =
      mapped.find((s) => s.subjectId && s.subjectId === preferSubjectId) ??
      mapped[0];
    setActiveKey(chosen?.key ?? "");
    // No wholesale meas reset: each subject's values arrive via selectSubject (cache →
    // latest fitting), so switching clients swaps contexts. Stale entries from another
    // client's subject IDs are unreachable under the new activeKey and never submit.
    setDirtyMeas(new Set());

    if (chosen) await selectSubject(chosen);
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
    setErrors((prev) => (prev.fitting === null ? prev : { ...prev, fitting: null }));

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

  function touchMeas(next: Record<string, MeasurementValue | null>) {

    if (activeKey === "new" || activeKey.startsWith("new-")) {
      setGenericMeasOwner((client?.name ?? query).trim());
    }
    setMeas((prev) => ({ ...prev, [activeKey]: next }));
    setDirtyMeas((prev) => new Set(prev).add(activeKey));
    setErrors((prev) => (prev.fitting === null ? prev : { ...prev, fitting: null }));
  }

  /** Rewrites dashes a paste may carry ("8-8" → "8/8"); typed input never has any. */
  const toParserSafe = (raw: string) =>
    raw.replace(/[-\u2012\u2013\u2014\u2212]/g, "/");

  const pendingMeasRef = useRef(pendingMeas);
  useEffect(() => {
    pendingMeasRef.current = pendingMeas;
  }, [pendingMeas]);

  /**
   * Commit-on-blur, deferred: an immediate commit would fire while she is merely moving
   * between the name and value fields, so blur starts a short grace window that focus
   * back inside the row cancels. The armed field comes from a ref, so a stale timer can
   * never commit the wrong field.
   */
  const blurCommitTimer = useRef<number | null>(null);
  function cancelBlurCommit() {
    if (blurCommitTimer.current !== null) {
      window.clearTimeout(blurCommitTimer.current);
      blurCommitTimer.current = null;
    }
  }
  function scheduleBlurCommit() {
    cancelBlurCommit();
    blurCommitTimer.current = window.setTimeout(() => {
      blurCommitTimer.current = null;
      if (compWrapRef.current?.contains(document.activeElement)) return;
      commitPending();
    }, 120);
  }

  function commitPending() {
    const el = document.getElementById("pendVal") as HTMLInputElement | null;
    const raw = toParserSafe(el?.value ?? "");
    const value = parseMeasurementInput(raw);
    const pending = pendingMeasRef.current;
    if (pending && value !== null) {
      touchMeas({ ...currentMeas(), [pending.key]: value });
    }
    // The well is uncontrolled — clear by hand for the next entry.
    if (el) el.value = "";
    setComposer("");
    setPendingMeas(null);
  }

  function commitEdit(key: string, rawValue: string) {
    const raw = toParserSafe(rawValue);
    const value = parseMeasurementInput(raw);
    if (raw.trim() && value !== null) {
      touchMeas({ ...currentMeas(), [key]: value });
    }
    setEditingMeas(null);
  }

  function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    setErrors((prev) => (prev.job === null ? prev : { ...prev, job: null }));

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

    // One pass over every section — the same rules, re-run over the whole page, so nothing
    // slipped through an edit after she moved on. Each error lands inline next to its own
    // fields, and the page walks her to the first blocker.
    const clientProblem = gateClient();
    const fittingProblem = gateFitting();
    const jobProblem = gateJob();
    if (clientProblem || fittingProblem || jobProblem) {
      setErrors({ client: clientProblem, fitting: fittingProblem, job: jobProblem });
      setErrorSeq((n) => n + 1);
      const target = clientProblem ? clientRef : fittingProblem ? fittingRef : jobRef;
      // The error paragraphs mount in the same commit as this state change — scroll only
      // after they exist, or the layout shift they cause cancels the smooth scroll
      // that is on its way to them.
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          target.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        ),
      );
      return;
    }
    setErrors(emptyErrors);

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
        let subjectId = activeSubject?.subjectId;
        if (!subjectId && activeSubject?.relationship === "self") {
          // Jobs bind to a subject, and this client has no self row yet (their first job
          // went to a relative, and subjects are only written when someone is measured).
          // Create it here, on the first Self job, so "for the client themself" never dead-ends.
          const selfRes = await addSubject(client.id, {
            name: client.name,
            relationship: "self",
          });
          subjectId = selfRes.data!.id;
          setSubjects((prev) =>
            prev.map((x) => (x.key === activeKey ? { ...x, subjectId } : x)),
          );
        }
        let measurementId = activeSubject?.latestMeasId;
        if (!measurementId || dirtyMeas.has(activeKey)) {
          const res = await createMeasurement(subjectId!, {
            measurements: measEntries,
            date: todayISO(),
          });
          measurementId = res.data!.id;
        }
        job = (await createJobForSubject(subjectId!, {
          measurementId,
          job: jobPayload,
        })).data!;
      }
      setCreated(job);

      invalidateJobWrites();
      // The draft's purpose is served: this job exists. Clear the intended client's snapshot.
      if (typeof window !== "undefined") {
        try {
          window.localStorage.removeItem(draftKeyFor((client?.name ?? query).trim()));
        } catch { /* best-effort */ }
      }
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

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="New job">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 w-full animate-fade-in bg-black/50"
      />

      <div className="hig absolute inset-x-0 bottom-0 mx-auto flex h-[92dvh] w-full sm:max-w-107.5 animate-sheet-in flex-col overflow-hidden rounded-t-[26px] bg-(--hig-card) shadow-[0_-30px_80px_-20px_rgba(0,0,0,0.5)]">
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
          className="flex-1 space-y-3 overflow-y-auto px-4 py-3 pb-8 scrollbar-none [&::-webkit-scrollbar]:hidden"
          onScroll={() => {
            setDdOpen(false);
            setSugOpen(false);
          }}
        >
          <section ref={clientRef} className="scroll-mt-3 space-y-3">
            <SectionHead n="1" title="Client" />
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
                  setErrors((prev) => (prev.client === null ? prev : { ...prev, client: null }));
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

              {ddOpen && ddRect && filteredCustomers.length > 0 && createPortal(
                <div
                  ref={ddRef}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="hig fixed z-70 max-h-52 animate-fade-in overflow-y-auto rounded-2xl bg-(--hig-card) p-1 shadow-(--hig-bar-shadow)"
                  style={{ top: ddRect.top + 6, left: ddRect.left, width: ddRect.width }}
                >
                  {customers === null ? (
                    <div className="px-4 py-3 text-[11px] text-(--hig-label-tertiary)">Loading clients…</div>
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
                onChange={(e) => {
                  setPhone(e.target.value);
                  setErrors((prev) => (prev.client === null ? prev : { ...prev, client: null }));
                }}
              />
            )}
            {client?.phoneNumber && (
              <div className="flex items-center gap-1.5 text-[10.5px] text-(--hig-label-secondary)">
                <span className="h-1.5 w-1.5 rounded-full bg-(--hig-success) shadow-[0_0_8px_rgba(48,209,88,0.6)]" aria-hidden="true" />
                Phone on file · <b className="font-medium tracking-[0.04em] text-(--hig-label)">{client.phoneNumber}</b>
              </div>
            )}
            {errors.client && <p key={`client-${errorSeq}`} className={sectionErrorClass}>{errors.client}</p>}
          </section>

          <section ref={fittingRef} className="scroll-mt-3 space-y-3">
            <SectionHead n="2" title="For whom" hint={activeSubject ? subjectLabel(activeSubject) : undefined} />
            <div className="grid grid-cols-2 gap-2">
              {subjects.map((s) => {
                const hue = subjectHue(s);
                const active = activeKey === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => selectSubject(s)}
                    className={`flex items-center gap-3 rounded-2xl p-3 text-left transition-all active:scale-[0.98] ${
                      active
                        ? "bg-(--hig-accent-tint)"
                        : "stitch-card"
                    }`}
                  >
                    <span
                      className="flex h-9.5 w-9.5 flex-shrink-0 items-center justify-center rounded-full border text-[13px] font-semibold"
                      style={{
                        backgroundColor: tintOf(hue),
                        color: hue,
                        borderColor: hue + "4D",
                      }}
                    >
                      {initials(subjectLabel(s))}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-(--hig-label)">
                        {subjectLabel(s)}
                      </span>
                      {s.relationship !== "self" && (
                        <span className="mt-0.5 block truncate text-[11px] text-(--hig-label-secondary)">
                          {s.relationship}
                        </span>
                      )}
                    </span>
                    {active && (
                      <span className="flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full bg-(--hig-accent) text-white">
                        <CheckIcon />
                      </span>
                    )}
                  </button>
                );
              })}
              {!addingSubject && (
                <button
                  type="button"
                  onClick={startAddSubject}
                  className="stitch-card flex items-center justify-center gap-2.5 rounded-2xl p-3 text-(--hig-accent) transition-all active:scale-[0.98]"
                >
                  <span className="flex h-9.5 w-9.5 flex-shrink-0 items-center justify-center rounded-full bg-(--hig-accent) text-[17px] leading-none text-white shadow-(--hig-bar-shadow)">
                    +
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold">Add subject</span>
                    <span className="block truncate text-[11px] text-(--hig-label-secondary)">child, spouse, parent…</span>
                  </span>
                </button>
              )}
            </div>
            {addingSubject && activeSubject?.key.startsWith("new-") && (
              <div className="animate-fade-in">
                <div className="flex items-center gap-2">
                  <select
                    className="input-field shrink-0 rounded-[10px] px-2 py-2 text-[12px] text-(--hig-label) outline-none"
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
              Measurements <span className="font-normal normal-case tracking-[0.02em] text-(--hig-label-tertiary)">· inches</span>
            </div>
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
                      defaultValue={formatMeasurementInput(value)}
                      autoFocus
                      enterKeyHint="done"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          // Submit the edit; preventDefault stops the browser advancing
                          // focus into the next field instead.
                          e.preventDefault();
                          commitEdit(key, (e.target as HTMLInputElement).value);
                        }
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
                      {formatMeasurement(value)}
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
            {/* Name and value side by side; the value takes the full keyboard so "8/8"
                can be typed as written. Enter commits; tapping away commits too. */}
            <div ref={compWrapRef} className="relative mt-4 flex items-center gap-1.5">
              <input
                ref={compInputRef}
                className={`${inputClass} min-w-0 flex-1`}
                placeholder="Type a measurement — e.g. bust, sleeve…"
                value={composer}
                onChange={(e) => {
                  setComposer(e.target.value);
                  setPendingMeas(null);

                  if (e.target.value.trim()) {
                    const r = compInputRef.current?.getBoundingClientRect();
                    if (r) {
                      setCompRect({ top: r.bottom, left: r.left, width: r.width });
                    }
                    setSugOpen(true);
                  } else {
                    setSugOpen(false);
                  }
                }}
              />
              <input
                id="pendVal"
                className={wellClass(Boolean(pendingMeas))}
                autoComplete="off"
                enterKeyHint="done"
                placeholder={pendingMeas ? pendingMeas.name : "value"}
                aria-label="Measurement value — type 8.5, or 8/8 for a pair"
                onBlur={scheduleBlurCommit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    // Submit the measurement; preventDefault stops the browser advancing
                    // focus into the next field (the job description) instead.
                    e.preventDefault();
                    cancelBlurCommit();
                    commitPending();
                  }
                }}
              />
              <span className="shrink-0 text-[11px] text-(--hig-label-tertiary)">″</span>
                  {sugOpen && composer.trim() && compRect && createPortal(
                    <div
                      ref={compRef}
                      onMouseDown={(e) => e.stopPropagation()}
                      className="hig fixed z-70 max-h-58 animate-fade-in overflow-y-auto rounded-2xl bg-(--hig-card) p-1.5 shadow-(--hig-bar-shadow)"
                      style={{
                        top: compRect.top + 6,
                        left: compRect.left,
                        width: compRect.width,
                      }}
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
                              // The name IS the suggestion; the value field arms beside it.
                              setPendingMeas({ key: s.key, name: s.name });
                              setComposer(s.name);
                              const el = document.getElementById("pendVal") as HTMLInputElement | null;
                              if (el) el.value = "";
                              setSugOpen(false);
                              requestAnimationFrame(() => el?.focus());
                              return;
                            }
                            setComposer("");
                            setSugOpen(false);
                          }}
                          className={`flex w-full items-center justify-between px-3.5 py-3.5 text-left text-[14px] transition-colors [&:not(:last-child)]:border-b [&:not(:last-child)]:border-dotted [&:not(:last-child)]:border-(--hig-separator) hover:bg-(--hig-accent-tint) ${
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
            {errors.fitting && <p key={`fitting-${errorSeq}`} className={sectionErrorClass}>{errors.fitting}</p>}
          </section>

          <section ref={jobRef} className="scroll-mt-3 space-y-3">
            <SectionHead n="3" title="The job" hint={priceNum > 0 ? naira(priceNum) : undefined} />
            <input
              className={inputClass}
              placeholder="e.g. Gown — purple lace, puff sleeves"
              value={desc}
              onChange={(e) => {
                setDesc(e.target.value);
                setErrors((prev) => (prev.job === null ? prev : { ...prev, job: null }));
              }}
            />
            <div className={miniLabelClass}>Agreed price</div>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] font-medium text-(--hig-accent)">&#8358;</span>
              <input
                className={`${inputClass} pl-8! text-[17px]! font-medium!`}
                placeholder="0"
                inputMode="numeric"
                value={price}
                onChange={(e) => {
                  setPrice(e.target.value);
                  setErrors((prev) => (prev.job === null ? prev : { ...prev, job: null }));
                }}
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
                onChange={(e) => {
                  setDueDate(e.target.value);
                  setErrors((prev) => (prev.job === null ? prev : { ...prev, job: null }));
                }}
              />
            </div>
            <div className="mt-5 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-(--hig-label-secondary)">Style reference</span>
              {photos.length > 0 && (
                <span className="text-[11px] font-medium text-(--hig-label-secondary)">
                  {photos.length}/{MAX_PHOTOS}
                </span>
              )}
            </div>
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
                  className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border-[1.5px] border-dashed border-(--hig-accent-line) bg-(--hig-card) text-(--hig-accent) transition-transform active:scale-95"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-6 w-6">
                    <path d="M12 5v14" /><path d="M5 12h14" />
                  </svg>
                </button>
              )}
            </div>
            <p className="mt-2 text-[12px] leading-snug text-(--hig-label-tertiary)">
              {photos.some((p) => p.status === "uploading")
                ? "Uploading — keep this sheet open for a moment."
                : photos.some((p) => p.status === "error")
                  ? "Tap the failed photo to retry the upload."
                  : "Jpg or png, up to 10 MB — shows on the job card."}
            </p>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFiles} />
            {errors.job && <p key={`job-${errorSeq}`} className={sectionErrorClass}>{errors.job}</p>}
          </section>
        </div>
        {error && (
          <div className="shrink-0 px-4 pb-2">
            <p key={errorSeq} className="animate-shake rounded-xl bg-(--hig-danger-tint) px-4 py-3 text-[13px] leading-snug text-(--hig-danger)">{error}</p>
          </div>
        )}
        <div className="flex shrink-0 items-center gap-3 border-t border-(--hig-separator) bg-(--hig-card) px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 shrink-0 items-center rounded-2xl px-1 text-[14px] font-medium text-(--hig-label-secondary) transition-colors hover:text-(--hig-label)"
          >
            Cancel
          </button>
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
        {created && (
          <div className="absolute inset-0 z-40 flex animate-fade-in flex-col items-center justify-center rounded-t-[26px] bg-(--hig-card) px-8 text-center shadow-(--hig-card-shadow)">
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

/**
 * Section headers on the single-page sheet: a numbered dot (label-on-card colors, so it
 * adapts to theme), a title, and — when there is one — a live summary of the answer so far
 * on the right. The numbers give the scroll order meaning: 1 whose money, 2 whose body,
 * 3 what garment.
 */
function SectionHead({ n, title, hint }: { n: string; title: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 pt-2">
      <div className="flex items-center gap-2.5">
        <span className="flex h-5.5 w-5.5 items-center justify-center rounded-full bg-(--hig-label) text-[10.5px] font-bold text-(--hig-card)">
          {n}
        </span>
        <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-(--hig-label)">{title}</h3>
      </div>
      {hint && (
        <span className="truncate text-[11.5px] font-medium text-(--hig-label-secondary)">{hint}</span>
      )}
    </div>
  );
}
