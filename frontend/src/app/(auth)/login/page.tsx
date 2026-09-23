"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/haptics";

/**
 * The keypad, v3 — Stitch's structure in Apple HIG clothes.
 *
 * What was kept from the Stitch design (structure only, per the porting rule):
 *   • a monogram badge above the wordmark, instead of type alone;
 *   • a dialer-style keypad — digit with its letter hints (ABC, DEF, …);
 *   • a footer trust pill anchoring the screen's bottom.
 *
 * What was deliberately NOT kept, and why:
 *   • the fake iOS status bar — the real one exists on a device, and the app
 *     already paints under it (`viewportFit: cover` + safe-area utilities);
 *   • Face ID button — there is no biometric flow behind it, and a control
 *     that only pretends to work is worse than none;
 *   • the gradients and blur orbs — the design system's one hard law:
 *     flat fills, depth from surface layering, no gradients anywhere;
 *   • "Forgot Studio Passcode?" — no such flow exists in the backend;
 *     the link would be a dead end.
 *
 * Two v3.1 corrections, both from device testing:
 *   • The column is width-capped at *every* viewport (340px), not just ≥640px —
 *     the earlier `sm:`-only cap was a full-bleed sweep casualty: on a 514px
 *     canvas the keypad stretched to 165px squares. This screen is a phone
 *     composition; the cap IS the design. The dashboard caps stay `sm:`-gated.
 *   • The screen is always light (the auth layout pins the theme) — Stitch's
 *     "vault door". Dark mode exists for data surfaces; the vault is chrome,
 *     and chrome keeps one face.
 *
 * Everything behavioural is v2's, unchanged: React Query session flow
 * (`useAuth`), haptics on every touch, physical-keyboard input, the shake on
 * a wrong PIN, the spinner that belongs to this submit and nothing else.
 */
const PIN_LENGTH = 4;

/** Dialer letter hints, keyed by digit — iOS phone-app flavour, Stitch's idea. */
const LETTER_HINTS: Record<string, string> = {
  "2": "ABC",
  "3": "DEF",
  "4": "GHI",
  "5": "JKL",
  "6": "MNO",
  "7": "PQRS",
  "8": "TUV",
  "9": "WXYZ",
};

export default function LoginPage() {
  // `isSigningIn`, not `isLoading`: the spinner and the disabled keypad belong
  // to *this* submit. (See lib/auth.tsx — the split outlives the redesign.)
  const { login, error, clearError, isSigningIn } = useAuth();
  const [pin, setPin] = useState("");
  const [isShaking, setIsShaking] = useState(false);

  const handleSubmit = useCallback(
    async (pinValue: string) => {
      const success = await login(pinValue);
      if (!success) {
        haptic("error");
        setIsShaking(true);
        setTimeout(() => {
          setIsShaking(false);
          setPin("");
        }, 400);
      }
    },
    [login],
  );

  const handleDigit = useCallback(
    (digit: string) => {
      clearError();
      if (pin.length >= PIN_LENGTH) return;
      haptic();

      const newPin = pin + digit;
      setPin(newPin);

      if (newPin.length === PIN_LENGTH) {
        setTimeout(() => handleSubmit(newPin), 100);
      }
    },
    [pin, clearError, handleSubmit],
  );

  const handleClear = useCallback(() => {
    haptic();
    setPin("");
    clearError();
  }, [clearError]);

  const handleBackspace = useCallback(() => {
    haptic();
    setPin((prev) => prev.slice(0, -1));
    clearError();
  }, [clearError]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key >= "0" && e.key <= "9") {
        handleDigit(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === "Escape") {
        handleClear();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleDigit, handleBackspace, handleClear]);

  return (
    // Always light: pinned by the auth layout; this class is the first-frame fallback.
    <div className="hig flex min-h-dvh w-full max-w-[340px] select-none flex-col text-center">
      {/* my-auto centres the main cluster in the space the footer leaves free. */}
      <div className="my-auto w-full">
        {/* ——— Monogram badge + wordmark (Stitch's header, HIG skin) ——— */}
        <div className="hig-rise" style={{ animationDelay: "0ms" }}>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-(--hig-separator) bg-(--hig-card)">
            {/* Shears — the one piece of ornament on the screen. */}
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 text-(--hig-accent)"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="6" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M20 4 8.12 15.88" />
              <path d="M14.47 14.48 20 20" />
              <path d="M8.12 8.12 12 12" />
            </svg>
          </div>

          {/* Micro wordmark under the badge; the Large Title carries the greeting,
              same hierarchy as the dashboard ("Morning, Wunmi —"). The name is a
              constant the way the seed PIN is: this app has exactly one user. */}
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-widest text-(--hig-label-tertiary)">
            Hollyseams · Tailor Studio
          </p>
          <h1 className="mt-2 text-[34px] font-semibold leading-10.25 tracking-[-0.02em]">
            Welcome back, Wunmi.
          </h1>
        </div>

        <p
          className="hig-rise mt-2 text-[17px] leading-5.5 text-(--hig-label-secondary)"
          style={{ animationDelay: "40ms" }}
        >
          Enter your PIN to continue.
        </p>

        {/* ——— PIN dots ——— */}
        <div className="hig-rise mt-8" style={{ animationDelay: "80ms" }}>
          {/* Separate node: stacking two animations on one element lets the cascade
              pick a single winner, so the shake silently loses the hig-rise class. */}
          <div
            role="group"
            aria-label="PIN entry"
            className={`flex justify-center gap-3 ${
              isShaking ? "animate-shake" : ""
            }`}
          >
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <div
                key={i}
                className={`h-5 w-5 rounded-full border-2 transition-colors duration-150 ${
                  i < pin.length
                    ? "border-(--hig-accent) bg-(--hig-accent)"
                    : "border-(--hig-dot-empty)"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Error / spinner — reserved height so the keypad never jumps. */}
        <div
          className="hig-rise mt-6 flex min-h-5 items-center justify-center px-2"
          style={{ animationDelay: "80ms" }}
        >
          {isSigningIn ? (
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-(--hig-accent-soft) border-t-(--hig-accent)"
              aria-label="Signing in"
            />
          ) : (
            error && (
              <p
                className="text-[13px] font-medium leading-4.5 text-(--hig-danger)"
                role="alert"
                aria-live="assertive"
              >
                {error}
              </p>
            )
          )}
        </div>

        {/* ——— Dialer keypad: digits with letter hints ——— */}
        <div
          className="hig-rise mx-auto mt-5 grid w-full max-w-[320px] grid-cols-3 gap-3"
          style={{ animationDelay: "120ms" }}
        >
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
            <button
              key={digit}
              aria-label={digit}
              onClick={() => handleDigit(digit)}
              disabled={isSigningIn || pin.length >= PIN_LENGTH}
              className="flex aspect-square touch-manipulation flex-col items-center justify-center rounded-full bg-(--hig-card) text-(--hig-label) shadow-(--hig-card-shadow) transition-all duration-100 active:scale-95 active:bg-(--hig-accent) active:text-white disabled:opacity-30"
            >
              <span className="text-[32px] leading-9">{digit}</span>
              <span className="h-2.5 text-[9px] font-medium uppercase tracking-widest text-(--hig-label-tertiary)">
                {LETTER_HINTS[digit] ?? ""}
              </span>
            </button>
          ))}

          <button
            onClick={handleClear}
            disabled={isSigningIn}
            className="flex aspect-square touch-manipulation items-center justify-center rounded-full text-[18px] text-(--hig-label-tertiary) transition-all duration-100 active:scale-95 active:opacity-60 disabled:opacity-30"
          >
            Clear
          </button>

          <button
            aria-label="0"
            onClick={() => handleDigit("0")}
            disabled={isSigningIn || pin.length >= PIN_LENGTH}
            className="flex aspect-square touch-manipulation flex-col items-center justify-center rounded-full bg-(--hig-card) text-(--hig-label) shadow-(--hig-card-shadow) transition-all duration-100 active:scale-95 active:bg-(--hig-accent) active:text-white disabled:opacity-30"
          >
            <span className="text-[32px] leading-9">0</span>
            <span className="h-2.5" />
          </button>

          <button
            onClick={handleBackspace}
            disabled={isSigningIn}
            className="flex aspect-square touch-manipulation items-center justify-center rounded-full text-(--hig-label-tertiary) transition-all duration-100 active:scale-95 active:opacity-60 disabled:opacity-30"
            aria-label="Delete last digit"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-7 w-7"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 12 L9.5 6.5 M4 12 L9.5 17.5 M4 12 H20" />
            </svg>
          </button>
        </div>
      </div>

      {/* ——— Footer trust pill (Stitch's footer, grounded in truth) ——— */}
      <div
        className="hig-rise flex justify-center pb-6 pt-3"
        style={{ animationDelay: "160ms" }}
      >
        <div className="flex items-center gap-1.5 rounded-full bg-(--hig-fill) px-3 py-1.5 text-[11px] font-medium text-(--hig-label-secondary)">
          <svg
            viewBox="0 0 24 24"
            className="h-3 w-3 text-(--hig-accent)"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="4" y="11" width="16" height="9" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          Single-user studio device
        </div>
      </div>
    </div>
  );
}
