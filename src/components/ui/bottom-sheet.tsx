'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Mobile-first modal that slides up from the bottom edge and becomes a centred
 * dialog on larger screens.
 *
 * Built on `<dialog>` so focus trapping, Escape-to-close and inertness of the
 * page behind come from the platform rather than from hand-rolled key handlers.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  React.useEffect(() => {
    // Keep the page behind from scrolling under the sheet on touch devices.
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // Clicking the backdrop (i.e. the dialog element itself) dismisses.
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      aria-labelledby="sheet-title"
      className={cn(
        'w-full max-w-lg bg-transparent p-0 backdrop:bg-ink-900/50 backdrop:backdrop-blur-[2px]',
        'm-0 mt-auto sm:m-auto',
        'max-h-[92dvh] sm:max-h-[86dvh]',
      )}
    >
      <div
        className={cn(
          'flex max-h-[92dvh] flex-col overflow-hidden bg-surface text-foreground sm:max-h-[86dvh]',
          'rounded-t-[var(--radius-sheet)] sm:rounded-[var(--radius-sheet)]',
          'animate-rise',
        )}
      >
        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="sheet-title" className="text-lg font-bold leading-tight">
              {title}
            </h2>
            {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-muted"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>

        {footer ? (
          <div className="border-t border-border px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>
        ) : null}
      </div>
    </dialog>
  );
}
