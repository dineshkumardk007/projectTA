import Link from 'next/link';
import { ChevronRight, PartyPopper, Timer } from 'lucide-react';
import type { OrderStatus } from '@prisma/client';
import { cn } from '@/lib/cn';
import { formatClockTime } from '@/lib/domain/prep-time';

/**
 * Persistent reminder of an order in flight, shown at the top of the home page.
 *
 * The READY state is visually distinct and celebratory — that moment is the
 * entire point of the product, so it should be impossible to miss.
 */
export function ActiveOrderBanner({
  order,
}: {
  order: { id: string; code: string; status: OrderStatus; shopName: string; estimatedReadyAt: Date };
}) {
  const ready = order.status === 'READY';

  const message =
    order.status === 'PLACED'
      ? 'Waiting for the shop to confirm'
      : order.status === 'ACCEPTED'
        ? `Ready by about ${formatClockTime(order.estimatedReadyAt)}`
        : order.status === 'PREPARING'
          ? `Being prepared — ready by about ${formatClockTime(order.estimatedReadyAt)}`
          : 'Collect it at the counter';

  return (
    <Link
      href={`/orders/${order.id}`}
      className={cn(
        'flex items-center gap-3 rounded-[var(--radius-card)] px-4 py-3.5 shadow-[var(--shadow-card)] transition-transform active:scale-[0.99]',
        ready ? 'animate-ready-glow bg-success-600 text-white' : 'bg-surface text-foreground',
      )}
    >
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full',
          ready ? 'bg-white/20' : 'bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300',
        )}
      >
        {ready ? <PartyPopper aria-hidden className="size-5" /> : <Timer aria-hidden className="size-5" />}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold leading-tight">
          {ready ? `Order ${order.code} is ready!` : `Order ${order.code} · ${order.shopName}`}
        </span>
        <span className={cn('block truncate text-xs leading-tight', ready ? 'text-white/85' : 'text-muted')}>
          {message}
        </span>
      </span>

      <ChevronRight aria-hidden className={cn('size-5 shrink-0', ready ? 'text-white/80' : 'text-muted')} />
    </Link>
  );
}
