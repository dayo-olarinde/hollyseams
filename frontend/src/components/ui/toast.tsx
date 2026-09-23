"use client";

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

      <div className="pointer-events-none fixed inset-x-0 top-0 z-60">
        <div className="mx-auto w-full sm:max-w-107.5 space-y-2 px-4 pt-[calc(10px+env(safe-area-inset-top))]">
          {items.map((t) => (
            <div
              key={t.id}
              role="status"
              className="hig pointer-events-auto flex animate-toast-in items-center gap-3 rounded-2xl border border-(--hig-separator) bg-(--hig-card) px-4 py-3 shadow-(--hig-bar-shadow)"
            >
              <span
                className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-(--hig-success) bg-(--hig-success-tint)"
                aria-hidden="true"
              >
                <span className="absolute inset-0.75 rounded-full border border-(--hig-success) opacity-20" />
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--hig-success)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-3.75 w-3.75">
                  <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium leading-tight text-(--hig-label)">{t.title}</p>
                {t.detail && (
                  <p className="mt-1 truncate text-[12.5px] leading-snug text-(--hig-label-secondary)">{t.detail}</p>
                )}
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-(--hig-separator) text-[8px] text-(--hig-label-tertiary) transition-colors hover:text-(--hig-label)"
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