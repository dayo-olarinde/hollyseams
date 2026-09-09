"use client";

/**
 * Dark/light toggle for the Apple HIG theme.
 *
 * A 44px circular material button (iOS style: translucent, blurred) that sits
 * in the top-right corner. It shows the mode you switch TO — a moon in light
 * mode, a sun in dark mode — and animates a quick rotate+fade on swap.
 *
 * State lives on <html> as `hig-light`/`hig-dark` (see globals.css) and is
 * persisted in localStorage("hig-theme"); the root layout's inline script
 * applies it before first paint, so login and dashboard always agree.
 */
import { useEffect, useState } from "react";

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-5 w-5">
      <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-5 w-5">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.5M12 19v2.5M2.5 12h2.5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8" />
    </svg>
  );
}

export default function ThemeToggle() {
  // Initialised in an effect (not the useState initialiser) to avoid an SSR
  // mismatch — `document` doesn't exist on the server.
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("hig-dark"));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("hig-dark", next);
    document.documentElement.classList.toggle("hig-light", !next);
    localStorage.setItem("hig-theme", next ? "hig-dark" : "hig-light");
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--hig-bar)] text-[var(--hig-label)] shadow-[var(--hig-bar-shadow)] backdrop-blur-[20px] backdrop-saturate-150 transition-transform duration-200 active:scale-90"
    >
      <span key={dark ? "sun" : "moon"} className="hig-swap flex h-5 w-5">
        {dark ? <SunIcon /> : <MoonIcon />}
      </span>
    </button>
  );
}