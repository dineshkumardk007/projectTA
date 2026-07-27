import { Zap, MapPin, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import type { Orderability } from '@/lib/domain/shop-availability';
import { formatDistance } from '@/lib/providers/maps';

/**
 * Status is never colour-only: each badge carries a dot *and* a word, so it
 * still reads correctly in greyscale or for a colour-blind user.
 */

const DOT_TONE = {
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
  neutral: 'bg-ink-400',
} as const;

const BADGE_TONE = {
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  neutral: 'neutral',
} as const;

export function ShopStatusBadge({
  orderability,
  className,
}: {
  orderability: Orderability;
  className?: string;
}) {
  return (
    <Badge tone={BADGE_TONE[orderability.tone]} className={className}>
      <span aria-hidden className={cn('size-2 rounded-full', DOT_TONE[orderability.tone])} />
      {orderability.label}
    </Badge>
  );
}

/**
 * The single most important number in the product — how long until I can
 * collect this. Rendered identically everywhere it appears.
 */
export function PreparationTimeBadge({
  rangeLow,
  rangeHigh,
  emphasis = 'normal',
  className,
}: {
  rangeLow: number;
  rangeHigh: number;
  emphasis?: 'normal' | 'strong';
  className?: string;
}) {
  const text = rangeLow === rangeHigh ? `${rangeLow} min` : `${rangeLow}–${rangeHigh} min`;

  if (emphasis === 'strong') {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-brand-50 px-3.5 py-2',
          'text-sm font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-200',
          className,
        )}
      >
        <Zap aria-hidden className="size-4" />
        Ready in {text}
      </div>
    );
  }

  return (
    <Badge tone="brand" className={className}>
      <Zap aria-hidden className="size-3.5" />
      Ready {text}
    </Badge>
  );
}

export function DistanceBadge({ km, className }: { km: number | null; className?: string }) {
  if (km == null) return null;
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium text-muted', className)}>
      <MapPin aria-hidden className="size-3.5" />
      {formatDistance(km)}
    </span>
  );
}

export function EtaBadge({ minutes, className }: { minutes: number | null; className?: string }) {
  if (minutes == null) return null;
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium text-muted', className)}>
      <Clock aria-hidden className="size-3.5" />
      {minutes} min away
    </span>
  );
}
