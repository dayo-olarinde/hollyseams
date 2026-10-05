"use client";

import { useEffect } from "react";

/**
 * The one dismiss contract for every sheet, modal and lightbox in the app: lock the page behind
 * the surface, close it on Escape.
 *
 * This used to be copied into each surface, and the copies drifted — one locked the scroll and
 * forgot Escape, another released the lock while its dialog was still open. One hook, one
 * contract, so the behaviour cannot differ per screen.
 *
 * `enabled` exists for surfaces that stay mounted while closed — the new-job sheet renders `null`
 * but its hooks keep running, and a closed sheet that still held the lock (or swallowed Escape)
 * would be a bug the user could not see the cause of.
 */
export function useDismiss(onClose: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, enabled]);
}
