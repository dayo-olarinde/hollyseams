"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getUploadSignature,
  uploadPhotoToCloudinary,
} from "@/lib/api/uploads";

/**
 * One photo-upload flow, two screens.
 *
 * The new-job modal owned this machinery first: signed upload, per-photo status, preview
 * lifecycles, retry. The edit sheet needed the *same* flow pointed at `finishedJob`, and a second
 * hand-rolled copy would have been the same failure as five `naira()` implementations — drift.
 * So the machinery lives here, and both screens compose it.
 *
 * The picker is deliberately dumb about jobs: it only knows photos. What happens with the
 * publicIds (create a job, or PATCH one) is the host's business.
 */

/** What a host holds after the picker does its work. */
export interface PickedPhoto {
  publicId: string;
  /** Cloudinary URL for existing photos; local preview for ones just uploaded. */
  url?: string;
  alt: string;
}

interface PickerPhoto {
  /** Stable per-photo identity for React keys and in-place patching. */
  key: string;
  file?: File;
  /** Local preview for new files; Cloudinary URL for photos already on the server. */
  previewUrl: string;
  alt: string;
  publicId?: string;
  status: "uploading" | "done" | "error";
  error?: string;
}

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

const thumb =
  "relative aspect-square overflow-hidden rounded-xl border border-(--hig-separator) bg-(--hig-fill)";
const thumbBar =
  "absolute inset-x-1.5 bottom-1.5 rounded-lg bg-black/55 px-1.5 py-1 text-center text-[9px] font-semibold text-white backdrop-blur-sm";

export function PhotoPicker({
  max = 4,
  initial,
  onChange,
}: {
  /** How many photos this slot allows. */
  max?: number;
  /** Photos already on the server (an edit starts from what the job has). */
  initial?: PickedPhoto[];
  /** Fires on every add/remove/retry/complete with the current done set. */
  onChange: (photos: PickedPhoto[]) => void;
}) {
  const [photos, setPhotos] = useState<PickerPhoto[]>(() =>
    (initial ?? []).map((p, i) => ({
      key: `existing-${i}-${p.publicId}`,
      previewUrl: p.url ?? "",
      alt: p.alt,
      publicId: p.publicId,
      status: "done" as const,
    })),
  );

  // The ref mirrors state so async completions (uploads resolve out of order) always patch the
  // latest list, and every commit can report outward without a side effect inside a setState
  // updater — which React StrictMode would double-invoke.
  const photosRef = useRef(photos);
  const previewUrlsRef = useRef<string[]>([]);
  useEffect(
    () => () => {
      // Object URLs outlive the component that made them; leak nothing.
      for (const url of previewUrlsRef.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const commit = useCallback(
    (next: PickerPhoto[]) => {
      photosRef.current = next;
      setPhotos(next);
      onChange(
        next
          .filter((p) => p.status === "done" && p.publicId)
          .map((p) => ({ publicId: p.publicId!, url: p.previewUrl, alt: p.alt })),
      );
    },
    [onChange],
  );

  async function uploadOne(
    key: string,
    file: File,
    sigPromise: ReturnType<typeof getUploadSignature>,
  ) {
    const patchOne = (patchFields: Partial<PickerPhoto>) =>
      commit(
        photosRef.current.map((p) =>
          p.key === key ? { ...p, ...patchFields } : p,
        ),
      );

    try {
      if (file.size > MAX_PHOTO_BYTES) {
        throw new Error("Over the 10 MB limit — pick a smaller photo");
      }
      const sig = await sigPromise;
      const { publicId } = await uploadPhotoToCloudinary(file, sig);
      patchOne({ publicId, status: "done" });
    } catch (err) {
      patchOne({
        status: "error",
        error:
          err instanceof Error ? err.message : "Upload failed — tap to retry",
      });
    }
  }

  function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";

    const batch = files.slice(0, Math.max(0, max - photosRef.current.length));
    if (batch.length === 0) return;

    const sigPromise = getUploadSignature();
    const added: PickerPhoto[] = batch.map((file, i) => {
      const stem = file.name
        .replace(/\.[a-z0-9]+$/i, "")
        .replace(/[_-]+/g, " ")
        .trim();
      const previewUrl = URL.createObjectURL(file);
      previewUrlsRef.current.push(previewUrl);
      return {
        key: `new-${Date.now()}-${i}-${file.name}`,
        file,
        previewUrl,
        alt: `Finished piece${stem ? ` — ${stem}` : ""}`.slice(0, 200),
        status: "uploading" as const,
      };
    });

    commit([...photosRef.current, ...added]);
    for (const item of added) {
      void uploadOne(item.key, item.file!, sigPromise);
    }
  }

  function removePhoto(key: string) {
    commit(photosRef.current.filter((p) => p.key !== key));
  }

  function retryPhoto(p: PickerPhoto) {
    if (!p.file) return;
    void uploadOne(p.key, p.file, getUploadSignature());
  }

  const full = photos.length >= max;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <div key={p.key} className={`w-20 ${thumb}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img loading="lazy"
              src={p.previewUrl}
              alt={p.alt}
              className="absolute inset-0 h-full w-full object-cover"
            />
            {p.status === "uploading" && (
              <div className={thumbBar}>Uploading…</div>
            )}
            {p.status === "error" && (
              <button
                type="button"
                onClick={() => retryPhoto(p)}
                className={`${thumbBar} !bg-black/70`}
              >
                {p.error ?? "Tap to retry"}
              </button>
            )}
            <button
              type="button"
              aria-label={`Remove ${p.alt}`}
              onClick={() => removePhoto(p.key)}
              className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-(--hig-separator) bg-(--hig-card) text-[11px] text-(--hig-danger) shadow-sm"
            >
              ✕
            </button>
          </div>
        ))}

        {!full && (
          <label
            className={`flex w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-[1.5px] border-dashed border-(--hig-accent-line) text-(--hig-accent) ${thumb}`}
          >
            <span className="text-[18px] leading-none">＋</span>
            <span className="px-1 text-center text-[9px] leading-tight">
              Add photo
            </span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={onFiles}
            />
          </label>
        )}
      </div>
    </div>
  );
}
