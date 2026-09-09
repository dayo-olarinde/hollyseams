"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";

const PIN_LENGTH = 4;

/**
 * PIN Login page
 *
 * Uses the approved Concept 3 (Modern Signature) logo:
 * - Instrument Serif wordmark with italic "ySeams"
 * - Thread line flowing beneath
 * - "Tailor Studio" tagline
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
    <div className="w-full max-w-[340px] text-center">
      {/* Logo — Concept 3: Modern Signature */}
      <div className="mx-auto mb-10" aria-label="HollySeams">
        <div className="relative inline-block">
          <span className="font-heading text-[42px] leading-none tracking-tight text-ink">
            <span>Holl</span>
            <span className="italic">ySeams</span>
          </span>
          {/* Thread line */}
          <svg
            className="absolute bottom-[2px] left-[-4px] right-[-4px] h-3 w-[calc(100%+8px)]"
            viewBox="0 0 200 12"
            fill="none"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d="M0 6 C20 6 35 2 55 4 C75 6 90 10 110 6 C130 2 145 4 165 6 C180 8 190 6 200 6"
              stroke="currentColor"
              strokeWidth="0.7"
              className="text-ink"
              opacity="0.18"
            />
            <circle
              cx="198"
              cy="6"
              r="1.2"
              fill="currentColor"
              className="text-ink"
              opacity="0.18"
            />
          </svg>
        </div>
        <p className="mt-5 font-body text-[8.5px] font-medium tracking-[0.45em] uppercase text-stone opacity-90">
          Tailor Studio
        </p>
      </div>

      {/* Welcome message */}
      <p className="mb-8 font-body text-[16px] text-stone">
        Welcome back — enter your PIN to continue
      </p>

      {/* PIN dots */}
      <div
        ref={dotsRef}
        role="group"
        aria-label="PIN entry"
        className={`mb-4 flex justify-center gap-[28px] ${isShaking ? "animate-shake" : ""}`}
      >
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <div
            key={i}
            className={`h-[18px] w-[18px] rounded-full border-[2px] transition-all duration-200 ${
              i < pin.length
                ? "border-teal bg-teal"
                : "border-teal-border bg-transparent"
            }`}
          />
        ))}
      </div>

      {/* Error message */}
      <div className="mb-4 h-[18px]">
        {error && (
          <p
            className="text-[15px] font-medium text-error"
            role="alert"
            aria-live="assertive"
          >
            {error}
          </p>
        )}
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-[10px]">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <button
            key={digit}
            aria-label={digit}
            onClick={() => handleDigit(digit)}
            disabled={isLoading || pin.length >= PIN_LENGTH}
            className="aspect-square rounded-[14px] border border-teal-border bg-surface-card text-[20px] font-medium text-ink transition-all duration-100 hover:border-teal active:scale-[0.94] active:bg-teal-light disabled:opacity-30"
          >
            {digit}
          </button>
        ))}

        <button
          onClick={handleClear}
          disabled={isLoading}
          className="rounded-[14px] bg-transparent text-[16px] font-medium text-stone transition-colors hover:text-teal active:scale-[0.94] disabled:opacity-30"
        >
          Clear
        </button>

        <button
          aria-label="0"
          onClick={() => handleDigit("0")}
          disabled={isLoading || pin.length >= PIN_LENGTH}
          className="aspect-square rounded-[14px] border border-[#E4EAEA] bg-surface-card text-[20px] font-medium text-ink transition-all duration-100 hover:border-teal active:scale-[0.94] active:bg-teal-light disabled:opacity-30"
        >
          0
        </button>

        <button
          onClick={handleBackspace}
          disabled={isLoading}
          className="rounded-[14px] bg-transparent text-[28px] text-stone transition-colors hover:text-teal active:scale-[0.94] disabled:opacity-30"
          aria-label="Delete last digit"
        >
          &#9003;
        </button>
      </div>
    </div>
  );
}
