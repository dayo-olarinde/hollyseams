"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";

const PIN_LENGTH = 4;

/**
 * PIN Login page — Apple HIG theme (experiment).
 *
 * Follows the playbook tokens:
 * - System font stack via the `.hig` class on the auth layout
 * - Type ramp: Large Title 34/41 wordmark, Body 17/22 welcome, Footnote 13 error
 * - 8pt grid: 20px side margins, 12px gaps, 24–40px section rhythm
 * - One accent (system Blue #007AFF / #0A84FF) used only for the keypad
 *   press state and the loading spinner; everything else is label/gray
 * - Touch targets: keypad keys are 80px circles (≥ 44px minimum)
 * - Light + dark both intentional (iOS white / black backgrounds)
 * - Motion: 260ms fade + 10px rise on the standard ease, staggered;
 *   reduced-motion handled globally in globals.css
 *
 * Wired to the real backend:
 * - POST /api/v1/auth/login with { pin: "1234" }
 * - Sets httpOnly sessionId cookie on success
 * - Returns 401 for invalid PIN, 429 for rate limit
 */
export default function LoginPage() {
  const { login, error, clearError, isLoading } = useAuth();
  const [pin, setPin] = useState("");
  const [isShaking, setIsShaking] = useState(false);
  const dotsRef = useRef<HTMLDivElement>(null);

  const handleSubmit = useCallback(
    async (pinValue: string) => {
      const success = await login(pinValue);
      if (!success) {
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

      const newPin = pin + digit;
      setPin(newPin);

      if (newPin.length === PIN_LENGTH) {
        setTimeout(() => handleSubmit(newPin), 100);
      }
    },
    [pin, clearError, handleSubmit],
  );

  const handleClear = useCallback(() => {
    setPin("");
    clearError();
  }, [clearError]);

  const handleBackspace = useCallback(() => {
    setPin((prev) => prev.slice(0, -1));
    clearError();
  }, [clearError]);

  // Keyboard support
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
    <div className="w-full max-w-[340px] select-none text-center">
      {/* Wordmark — Large Title 34/41, semibold, tightened tracking */}
      <div className="hig-rise" style={{ animationDelay: "0ms" }}>
        <h1 className="text-[34px] font-semibold leading-[41px] tracking-[-0.02em]">
          HollySeams
        </h1>
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--hig-label-tertiary)]">
          Tailor Studio
        </p>
      </div>

      {/* Welcome — Body 17/22, secondary label */}
      <p
        className="hig-rise mt-10 text-[17px] leading-[22px] text-[var(--hig-label-secondary)]"
        style={{ animationDelay: "40ms" }}
      >
        Welcome back — enter your PIN to continue
      </p>

      {/* PIN dots — 20px, 12px gap */}
      <div
        ref={dotsRef}
        role="group"
        aria-label="PIN entry"
        className={`hig-rise mt-10 flex justify-center gap-3 ${
          isShaking ? "animate-shake" : ""
        }`}
        style={{ animationDelay: "80ms" }}
      >
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <div
            key={i}
            className={`h-5 w-5 rounded-full border-2 transition-colors duration-150 ${
              i < pin.length
                ? "border-[var(--hig-label)] bg-[var(--hig-label)]"
                : "border-[var(--hig-dot-empty)]"
            }`}
          />
        ))}
      </div>

      {/* Error / loading slot — fixed height so nothing jumps */}
      <div
        className="hig-rise mt-6 flex h-5 items-center justify-center"
        style={{ animationDelay: "80ms" }}
      >
        {isLoading ? (
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--hig-accent-soft)] border-t-[var(--hig-accent)]"
            aria-label="Signing in"
          />
        ) : (
          error && (
            <p
              className="text-[13px] font-medium leading-[18px] text-[#FF3B30] dark:text-[#FF453A]"
              role="alert"
              aria-live="assertive"
            >
              {error}
            </p>
          )
        )}
      </div>

      {/* Keypad — 80px circular keys, 12px gaps; press state is the accent */}
      <div
        className="hig-rise mx-auto mt-6 grid w-full max-w-[264px] grid-cols-3 gap-3"
        style={{ animationDelay: "120ms" }}
      >
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <button
            key={digit}
            aria-label={digit}
            onClick={() => handleDigit(digit)}
            disabled={isLoading || pin.length >= PIN_LENGTH}
            className="flex aspect-square items-center justify-center rounded-full bg-[var(--hig-fill)] text-[28px] text-[var(--hig-label)] transition-all duration-100 active:scale-95 active:bg-[var(--hig-accent)] active:text-white disabled:opacity-30"
          >
            {digit}
          </button>
        ))}

        <button
          onClick={handleClear}
          disabled={isLoading}
          className="flex aspect-square items-center justify-center rounded-full text-[17px] text-[var(--hig-label-tertiary)] transition-all duration-100 active:scale-95 active:opacity-60 disabled:opacity-30"
        >
          Clear
        </button>

        <button
          aria-label="0"
          onClick={() => handleDigit("0")}
          disabled={isLoading || pin.length >= PIN_LENGTH}
          className="flex aspect-square items-center justify-center rounded-full bg-[var(--hig-fill)] text-[28px] text-[var(--hig-label)] transition-all duration-100 active:scale-95 active:bg-[var(--hig-accent)] active:text-white disabled:opacity-30"
        >
          0
        </button>

        <button
          onClick={handleBackspace}
          disabled={isLoading}
          className="flex aspect-square items-center justify-center rounded-full text-[var(--hig-label-tertiary)] transition-all duration-100 active:scale-95 active:opacity-60 disabled:opacity-30"
          aria-label="Delete last digit"
        >          {/* Back-delete chevron only — no ×, so it reads as a single glyph */}
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6"
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
  );
}