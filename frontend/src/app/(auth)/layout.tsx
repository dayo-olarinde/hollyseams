"use client";

import { useEffect } from "react";

/**
 * The auth screens are always light — Stitch's "vault door".
 *
 * The keypad screen is chrome, not a data surface: dark mode exists to make job data readable at
 * night, and a passcode gate has no data. Stitch's pin-unlock design is light for the same reason
 * a bank's is — the moment you are authenticating, the room should feel lit.
 *
 * Two-part mechanism, because the theme is one class on `<html>` and the token blocks read it
 * there (`html.hig-dark .hig { … }`):
 *
 * 1. **Before first paint**, an inline script (runs while the HTML streams, before React) flips
 *    `hig-dark` → `hig-light`. Without it, a dark-mode user would see the vault paint dark for
 *    one flash before the effect below corrected it.
 * 2. **On unmount** (leaving `/login`), the effect restores what the user actually chose —
 *    localStorage if set, the system preference otherwise — so the dashboard comes back exactly
 *    as dark as they left it. `replace()` is a no-op when the class is absent, so both paths are
 *    safe whether the visit started light or dark.
 */
const paintLight = `try{document.documentElement.classList.replace('hig-dark','hig-light')}catch(e){}`;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const stored = localStorage.getItem("hig-theme");
    const wantsDark =
      stored === "hig-dark" ||
      (stored !== "hig-light" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    return () => {
      if (wantsDark)
        document.documentElement.classList.replace("hig-light", "hig-dark");
    };
  }, []);

  /**
   * v3: horizontal centring only. Vertical composition belongs to the page —
   * the login screen is a full-height flex column (content centred, trust
   * pill anchored to the bottom), so a centring wrapper here would fight it.
   */
  return (
    <main className="hig flex min-h-dvh flex-col items-center bg-(--hig-canvas) text-(--hig-label) transition-colors duration-200">
      <script dangerouslySetInnerHTML={{ __html: paintLight }} />
      {children}
    </main>
  );
}
