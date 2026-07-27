'use client';

import * as React from 'react';
import { Check, Info, X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Lightweight toast layer.
 *
 * Toasts confirm actions ("Added to cart", "Order accepted") without stealing
 * focus. They live in an `aria-live` region so screen-reader users hear the
 * same confirmation sighted users see.
 */

type ToastTone = 'success' | 'error' | 'info';

type Toast = { id: number; tone: ToastTone; message: string };

const ToastContext = React.createContext<{
  toast: (message: string, tone?: ToastTone) => void;
} | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>.');
  return ctx;
}

const TONE_STYLES: Record<ToastTone, string> = {
  success: 'bg-success-600 text-white',
  error: 'bg-danger-600 text-white',
  info: 'bg-ink-900 text-white dark:bg-ink-700',
};

const TONE_ICONS: Record<ToastTone, React.ElementType> = {
  success: Check,
  error: AlertTriangle,
  info: Info,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const nextId = React.useRef(0);

  const dismiss = React.useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    (message: string, tone: ToastTone = 'success') => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, tone, message }]);
      setTimeout(() => dismiss(id), 3800);
    },
    [dismiss],
  );

  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex flex-col items-center gap-2 px-3"
      >
        {toasts.map((t) => {
          const Icon = TONE_ICONS[t.tone];
          return (
            <div
              key={t.id}
              className={cn(
                'animate-rise pointer-events-auto flex w-full max-w-sm items-center gap-2.5',
                'rounded-[var(--radius-field)] px-4 py-3 text-sm font-semibold shadow-[var(--shadow-raised)]',
                TONE_STYLES[t.tone],
              )}
            >
              <Icon aria-hidden className="size-4 shrink-0" />
              <span className="flex-1">{t.message}</span>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="rounded p-0.5 opacity-70 hover:opacity-100"
                aria-label="Dismiss notification"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
