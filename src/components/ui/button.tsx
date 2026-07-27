import { Slot } from '@/components/ui/slot';
import { cn } from '@/lib/cn';
import { Loader2 } from 'lucide-react';
import * as React from 'react';

/**
 * The one button in the system.
 *
 * `size="action"` is the merchant-dashboard size: 56px tall, full width. A
 * counter staffer taps these hundreds of times a day with wet hands on a phone
 * propped against a till, so they are deliberately much larger than a typical
 * web button.
 */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline';
type Size = 'sm' | 'md' | 'lg' | 'action' | 'icon';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 shadow-sm disabled:bg-brand-300',
  secondary:
    'bg-surface-muted text-foreground hover:bg-ink-200/70 active:bg-ink-300/60 dark:hover:bg-ink-700/40',
  ghost: 'bg-transparent text-foreground hover:bg-surface-muted active:bg-ink-200/60',
  outline: 'border border-border bg-surface text-foreground hover:bg-surface-muted',
  danger: 'bg-danger-500 text-white hover:bg-danger-600 active:bg-danger-700 disabled:bg-danger-500/50',
  success:
    'bg-success-600 text-white hover:bg-success-700 active:bg-success-700 disabled:bg-success-600/50',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5 rounded-[var(--radius-field)]',
  md: 'h-11 px-4 text-sm gap-2 rounded-[var(--radius-field)]',
  lg: 'h-13 px-6 text-base gap-2 rounded-[var(--radius-field)]',
  action: 'h-14 px-5 w-full text-base gap-2 rounded-[var(--radius-field)]',
  icon: 'h-11 w-11 rounded-full',
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** Render as the single child element instead of a `<button>` (for links). */
  asChild?: boolean;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading = false, asChild = false, children, disabled, ...props },
  ref,
) {
  const classes = cn(
    'inline-flex select-none items-center justify-center font-semibold',
    'transition-[background-color,transform,box-shadow] duration-150',
    'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60',
    VARIANTS[variant],
    SIZES[size],
    className,
  );

  // `Slot` merges onto exactly one child, so the loading spinner is only added
  // in the real-<button> branch — an `asChild` button is a link and never busy.
  if (asChild) {
    return (
      <Slot ref={ref} className={classes} {...props}>
        {children}
      </Slot>
    );
  }

  return (
    <button
      ref={ref}
      // Communicate busy-ness to assistive tech, not just visually.
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={classes}
      {...props}
    >
      {loading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
});
