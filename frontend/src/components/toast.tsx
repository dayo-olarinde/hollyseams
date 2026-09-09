"use client";

/**
 * Toast — tailor-themed confirmation toasts (Midnight Indigo).
 *
 * A tiny context-based toast system: `useToast()` returns `show({ title,
 * detail })` and the provider renders the queue anchored to the phone-width
 * column, just above the tab bar. Styling follows the design system —
 * Fraunces italic headline (the wordmark voice), flat colours, glow via
 * shadows, and a stitched (dashed) ring that nods to the sewing motif.
 * Toasts auto-dismiss after 3.6s or on ✕.
 */
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface ToastInput {
  title: string;
  detail?: string;
}

interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<{ show: (t: ToastInput) => void } | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const AUTO_DISMISS_MS = 3600;
const MAX_VISIBLE = 2;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const show = useCallback((input: ToastInput) => {
    const id = ++nextId.current;
    setItems((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), { id, ...input }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, AUTO_DISMISS_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}

      {/* fixed to the phone-width column like the FAB + tab bar */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[108px] z-[60]">
        <div className="mx-auto w-full max-w-[430px] space-y-2 px-4">
          {items.map((t) => (
            <div
              key={t.id}
              role="status"
              className="pointer-events-auto flex animate-toast-in items-center gap-3 rounded-2xl border border-white/10 bg-[#0D1526] px-4 py-3 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.9),0_0_40px_-24px_rgba(91,124,250,0.5)]"
            >
              {/* stitched ring + check — the sewing motif */}
              <span
                className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-dashed border-mint/50 bg-mint/10"
                aria-hidden="true"
              >
                <span className="absolute inset-[3px] rounded-full border border-mint/15" />
                <svg viewBox="0 0 24 24" fill="none" stroke="#3ED598" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-[15px] w-[15px]">
                  <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-heading text-[14px] italic leading-tight text-ink">{t.title}</p>
                {t.detail && (
                  <p className="mt-0.5 truncate text-[10.5px] leading-snug text-ink-soft">{t.detail}</p>
                )}
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
                className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/5 text-[8px] text-stone transition-colors hover:text-ink"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}