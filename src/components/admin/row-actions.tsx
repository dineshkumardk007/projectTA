'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

/** Small inline PATCH helpers used by the admin tables. */

function useAction() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = React.useState(false);

  const run = React.useCallback(
    async (url: string, body: Record<string, unknown>, successMessage: string) => {
      setPending(true);
      try {
        const response = await fetch(url, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
          toast(data.error ?? 'That change could not be applied.', 'error');
          return;
        }
        toast(successMessage);
        router.refresh();
      } catch {
        toast('We could not reach the server.', 'error');
      } finally {
        setPending(false);
      }
    },
    [router, toast],
  );

  return { run, pending };
}

export function MerchantVerificationActions({
  merchantId,
  status,
}: {
  merchantId: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';
}) {
  const { run, pending } = useAction();
  const url = `/api/admin/merchants/${merchantId}`;

  return (
    <div className="flex flex-wrap gap-2">
      {status !== 'VERIFIED' ? (
        <Button
          size="sm"
          loading={pending}
          onClick={() => run(url, { verificationStatus: 'VERIFIED' }, 'Merchant verified — their shops are live.')}
        >
          Verify
        </Button>
      ) : null}
      {status === 'PENDING' ? (
        <Button
          size="sm"
          variant="outline"
          loading={pending}
          onClick={() =>
            run(
              url,
              { verificationStatus: 'REJECTED', note: 'We could not verify these business details.' },
              'Merchant rejected.',
            )
          }
        >
          Reject
        </Button>
      ) : null}
      {status === 'VERIFIED' ? (
        <Button
          size="sm"
          variant="ghost"
          className="text-danger-600"
          loading={pending}
          onClick={() =>
            run(url, { verificationStatus: 'SUSPENDED', note: 'Account suspended.' }, 'Merchant suspended.')
          }
        >
          Suspend
        </Button>
      ) : null}
    </div>
  );
}

export function ShopVisibilityAction({ shopId, isActive }: { shopId: string; isActive: boolean }) {
  const { run, pending } = useAction();

  return (
    <Button
      size="sm"
      variant={isActive ? 'ghost' : 'primary'}
      className={isActive ? 'text-danger-600' : undefined}
      loading={pending}
      onClick={() =>
        run(
          `/api/admin/shops/${shopId}`,
          { isActive: !isActive },
          isActive ? 'Shop hidden from customers.' : 'Shop is visible again.',
        )
      }
    >
      {isActive ? 'Hide' : 'Show'}
    </Button>
  );
}

/**
 * Baseline queue wait — the divisor behind "waiting time saved".
 *
 * Admin-only because a merchant could otherwise inflate the platform's headline
 * metric simply by claiming their queue is very long.
 */
export function BaselineWaitAction({
  shopId,
  value,
}: {
  shopId: string;
  value: number;
}) {
  const { run, pending } = useAction();
  const [minutes, setMinutes] = React.useState(value);

  return (
    <div className="flex items-center gap-1.5">
      <label className="sr-only" htmlFor={`baseline-${shopId}`}>
        Typical queue wait in minutes
      </label>
      <input
        id={`baseline-${shopId}`}
        type="number"
        min={1}
        max={180}
        value={minutes}
        onChange={(event) => setMinutes(Number(event.target.value))}
        className="h-9 w-16 rounded-[var(--radius-field)] border border-border bg-surface px-2 text-sm tabular-nums"
      />
      <Button
        size="sm"
        variant="outline"
        disabled={minutes === value}
        loading={pending}
        onClick={() =>
          run(`/api/admin/shops/${shopId}`, { baselineWaitMinutes: minutes }, 'Baseline queue wait updated.')
        }
      >
        Set
      </Button>
    </div>
  );
}

/**
 * The fraud guard toggle.
 *
 * A blocked customer is not banned — they can still order, they just pay first.
 * The wording says exactly that, because an admin reading "Block" at speed will
 * otherwise assume it locks the account.
 */
export function CashOnPickupAction({ userId, isBlocked }: { userId: string; isBlocked: boolean }) {
  const { run, pending } = useAction();

  return (
    <Button
      size="sm"
      variant={isBlocked ? 'outline' : 'ghost'}
      className={isBlocked ? undefined : 'text-danger-600'}
      loading={pending}
      onClick={() =>
        run(
          `/api/admin/users/${userId}`,
          { isCashOnPickupBlocked: !isBlocked },
          isBlocked
            ? 'Cash on pickup allowed again.'
            : 'Cash on pickup blocked — this customer must now pay before collection.',
        )
      }
    >
      {isBlocked ? 'Allow cash on pickup' : 'Block cash on pickup'}
    </Button>
  );
}

export function UserActiveAction({ userId, isActive }: { userId: string; isActive: boolean }) {
  const { run, pending } = useAction();

  return (
    <Button
      size="sm"
      variant={isActive ? 'ghost' : 'primary'}
      className={isActive ? 'text-danger-600' : undefined}
      loading={pending}
      onClick={() =>
        run(
          `/api/admin/users/${userId}`,
          { isActive: !isActive },
          isActive ? 'Account deactivated and signed out everywhere.' : 'Account reactivated.',
        )
      }
    >
      {isActive ? 'Deactivate' : 'Reactivate'}
    </Button>
  );
}
