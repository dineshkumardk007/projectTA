'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { ShopStatus } from '@prisma/client';
import { Card } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';

/**
 * One-tap shop status.
 *
 * Changing it immediately changes what customers are promised, so the control
 * reports the new preparation estimate back ("10 min → 20 min"). Without that
 * feedback a merchant cannot tell what tapping "Very busy" actually did.
 */

const OPTIONS: { value: ShopStatus; label: string; hint: string; dot: string; ring: string }[] = [
  { value: 'OPEN', label: 'Open', hint: 'Normal preparation times', dot: 'bg-success-500', ring: 'border-success-500 bg-success-50 dark:bg-success-500/15' },
  { value: 'BUSY', label: 'Busy', hint: 'Estimates increase ~60%', dot: 'bg-warning-500', ring: 'border-warning-500 bg-warning-50 dark:bg-warning-500/15' },
  { value: 'VERY_BUSY', label: 'Very busy', hint: 'Estimates more than double', dot: 'bg-danger-500', ring: 'border-danger-500 bg-danger-50 dark:bg-danger-500/15' },
  { value: 'PAUSED', label: 'Pause orders', hint: 'No new orders accepted', dot: 'bg-ink-400', ring: 'border-ink-400 bg-surface-muted' },
];

export function ShopStatusControl({
  shopId,
  initialStatus,
  currentPrepMinutes,
}: {
  shopId: string;
  initialStatus: ShopStatus;
  currentPrepMinutes: number;
}) {
  const [status, setStatus] = React.useState<ShopStatus>(initialStatus);
  const [prepMinutes, setPrepMinutes] = React.useState(currentPrepMinutes);
  const [pending, setPending] = React.useState<ShopStatus | null>(null);
  const [change, setChange] = React.useState<{ from: number; to: number } | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  async function apply(next: ShopStatus) {
    if (next === status) return;
    setPending(next);
    const previous = status;
    setStatus(next);

    try {
      const response = await fetch(`/api/merchant/shops/${shopId}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const data = (await response.json()) as {
        error?: string;
        prepMinutes?: number;
        previousPrepMinutes?: number;
      };

      if (!response.ok) {
        setStatus(previous);
        toast(data.error ?? 'We could not update the shop status.', 'error');
        return;
      }

      if (data.prepMinutes != null && data.previousPrepMinutes != null) {
        setPrepMinutes(data.prepMinutes);
        setChange({ from: data.previousPrepMinutes, to: data.prepMinutes });
      }
      router.refresh();
    } catch {
      setStatus(previous);
      toast('We could not reach the server.', 'error');
    } finally {
      setPending(null);
    }
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-bold">Shop status</h2>
        <p className="text-sm text-muted">
          Customers see <span className="font-bold text-foreground">~{prepMinutes} min</span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {OPTIONS.map((option) => {
          const active = status === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => apply(option.value)}
              disabled={pending !== null}
              aria-pressed={active}
              className={cn(
                'rounded-[var(--radius-field)] border p-3 text-left transition-colors disabled:opacity-60',
                active ? option.ring : 'border-border bg-surface hover:bg-surface-muted',
              )}
            >
              <span className="flex items-center gap-2">
                <span aria-hidden className={cn('size-2.5 rounded-full', option.dot)} />
                <span className="text-sm font-bold">{option.label}</span>
              </span>
              <span className="mt-0.5 block text-xs text-muted">{option.hint}</span>
            </button>
          );
        })}
      </div>

      {change && change.from !== change.to ? (
        <p
          role="status"
          className="mt-3 rounded-[var(--radius-field)] bg-surface-muted px-3 py-2 text-sm font-semibold"
        >
          Preparation time updated · {change.from} min → {change.to} min
        </p>
      ) : null}
    </Card>
  );
}
