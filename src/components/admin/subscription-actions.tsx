'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { SubscriptionTier } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/primitives';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { useToast } from '@/components/ui/toast';
import { SUBSCRIPTION_PLANS } from '@/lib/domain/subscription-plans';
import { formatMinor } from '@/lib/domain/money';

/**
 * Phase 1 activation controls.
 *
 * Built around what actually happens: a merchant sends ₹399 by UPI, messages a
 * screenshot, and wants their shop back on the list before the evening rush. The
 * primary path is therefore one button — "Activate +30 days" — with the payment
 * reference collected in the same sheet rather than on a separate screen.
 */

function useAdminAction() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = React.useState(false);

  const run = React.useCallback(
    async (url: string, body: Record<string, unknown>, successMessage: string, method = 'PATCH') => {
      setPending(true);
      try {
        const response = await fetch(url, {
          method,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
          toast(data.error ?? 'That change could not be applied.', 'error');
          return false;
        }
        toast(successMessage);
        router.refresh();
        return true;
      } catch {
        toast('We could not reach the server.', 'error');
        return false;
      } finally {
        setPending(false);
      }
    },
    [router, toast],
  );

  return { run, pending };
}

export function SubscriptionActions({
  merchantId,
  businessName,
  tier,
  isOnAPlan,
}: {
  merchantId: string;
  businessName: string;
  tier: SubscriptionTier | null;
  isOnAPlan: boolean;
}) {
  const { run, pending } = useAdminAction();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [selectedTier, setSelectedTier] = React.useState<SubscriptionTier>(tier ?? 'STARTER');
  const [days, setDays] = React.useState(30);
  const [reference, setReference] = React.useState('');
  const [note, setNote] = React.useState('');
  const [recordPayment, setRecordPayment] = React.useState(true);

  const url = `/api/admin/subscriptions/${merchantId}`;
  const plan = SUBSCRIPTION_PLANS.find((p) => p.tier === selectedTier) ?? SUBSCRIPTION_PLANS[0];

  async function submit() {
    const applied = await run(
      url,
      {
        action: 'activate',
        tier: selectedTier,
        days,
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
        recordPayment,
      },
      `${businessName} activated for ${days} days.`,
    );
    if (applied) {
      setSheetOpen(false);
      setReference('');
      setNote('');
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" loading={pending} onClick={() => setSheetOpen(true)}>
          Activate +30 days
        </Button>

        <Button
          size="sm"
          variant="outline"
          loading={pending}
          onClick={() =>
            run(
              url,
              {
                action: 'activate',
                days: 7,
                // A grace week collects nothing, so it must not appear in the
                // payment log as revenue.
                recordPayment: false,
                note: 'Goodwill extension (+7 days, no payment)',
              },
              `${businessName} extended by 7 days.`,
            )
          }
        >
          Extend +7
        </Button>

        {!isOnAPlan ? (
          <Button
            size="sm"
            variant="ghost"
            loading={pending}
            onClick={() => run(url, { action: 'trial' }, `${businessName} started on a 14-day trial.`)}
          >
            Start trial
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="text-danger-600"
            loading={pending}
            onClick={() =>
              run(url, { action: 'expire' }, `${businessName} marked expired — their shops are hidden.`)
            }
          >
            Mark expired
          </Button>
        )}
      </div>

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={`Record payment — ${businessName}`}
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor={`tier-${merchantId}`}>Plan</Label>
            <Select
              id={`tier-${merchantId}`}
              value={selectedTier}
              onChange={(event) => setSelectedTier(event.target.value as SubscriptionTier)}
            >
              {SUBSCRIPTION_PLANS.map((option) => (
                <option key={option.tier} value={option.tier}>
                  {option.name} — {formatMinor(option.priceMinor)}/month
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-muted">{plan.summary}</p>
          </div>

          <div>
            <Label htmlFor={`days-${merchantId}`}>Days to add</Label>
            <Input
              id={`days-${merchantId}`}
              type="number"
              min={1}
              max={366}
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            />
            <p className="mt-1 text-xs text-muted">
              Added to whatever is left on the current period, so paying early never loses days.
            </p>
          </div>

          <div>
            <Label htmlFor={`ref-${merchantId}`}>UPI reference / receipt number</Label>
            <Input
              id={`ref-${merchantId}`}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="123456789012"
              inputMode="numeric"
            />
          </div>

          <div>
            <Label htmlFor={`note-${merchantId}`}>Note</Label>
            <Input
              id={`note-${merchantId}`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={`Paid ${formatMinor(plan.priceMinor)} via UPI`}
            />
          </div>

          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={recordPayment}
              onChange={(event) => setRecordPayment(event.target.checked)}
              className="mt-0.5 size-4 accent-[var(--color-brand-500)]"
            />
            <span>
              Record {formatMinor(plan.priceMinor)} in the payment log
              <span className="block text-xs text-muted">
                Uncheck for a free extension — it will still add the days, but will not count as revenue.
              </span>
            </span>
          </label>

          <Button size="action" loading={pending} onClick={submit}>
            Activate for {days} days
          </Button>
        </div>
      </BottomSheet>
    </>
  );
}

/** Change the plan without touching the period. */
export function TierSelect({
  merchantId,
  tier,
}: {
  merchantId: string;
  tier: SubscriptionTier;
}) {
  const { run, pending } = useAdminAction();

  return (
    <>
      <label className="sr-only" htmlFor={`plan-${merchantId}`}>
        Plan
      </label>
      <select
        id={`plan-${merchantId}`}
        disabled={pending}
        value={tier}
        onChange={(event) =>
          run(
            `/api/admin/subscriptions/${merchantId}`,
            { action: 'tier', tier: event.target.value },
            'Plan changed.',
          )
        }
        className="h-9 rounded-[var(--radius-field)] border border-border bg-surface px-2 text-sm"
      >
        {SUBSCRIPTION_PLANS.map((plan) => (
          <option key={plan.tier} value={plan.tier}>
            {plan.name}
          </option>
        ))}
      </select>
    </>
  );
}

/** Sell a boost on a merchant's behalf, from the admin console. */
export function BoostSaleForm({ shops }: { shops: { id: string; name: string; city: string }[] }) {
  const { run, pending } = useAdminAction();
  const [shopId, setShopId] = React.useState(shops[0]?.id ?? '');
  const [durationDays, setDurationDays] = React.useState<1 | 3 | 7>(1);
  const [slotType, setSlotType] = React.useState('SEARCH_PINNED');
  const [paymentRef, setPaymentRef] = React.useState('');

  if (shops.length === 0) {
    return <p className="text-sm text-muted">No verified shops to boost yet.</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
      <div>
        <Label htmlFor="boost-shop">Shop</Label>
        <Select id="boost-shop" value={shopId} onChange={(event) => setShopId(event.target.value)}>
          {shops.map((shop) => (
            <option key={shop.id} value={shop.id}>
              {shop.name} — {shop.city}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="boost-duration">Duration</Label>
        <Select
          id="boost-duration"
          value={String(durationDays)}
          onChange={(event) => setDurationDays(Number(event.target.value) as 1 | 3 | 7)}
        >
          <option value="1">1 day — ₹99</option>
          <option value="3">3 days — ₹249</option>
          <option value="7">7 days — ₹499</option>
        </Select>
      </div>

      <div>
        <Label htmlFor="boost-slot">Slot</Label>
        <Select id="boost-slot" value={slotType} onChange={(event) => setSlotType(event.target.value)}>
          <option value="SEARCH_PINNED">Pinned in search</option>
          <option value="CATEGORY_TOP">Top of category</option>
          <option value="HOME_HERO">Home hero</option>
        </Select>
      </div>

      <div>
        <Label htmlFor="boost-ref">UPI reference</Label>
        <Input
          id="boost-ref"
          value={paymentRef}
          onChange={(event) => setPaymentRef(event.target.value)}
          placeholder="Optional"
        />
      </div>

      <div className="flex items-end">
        <Button
          loading={pending}
          onClick={() =>
            run(
              '/api/admin/boosts',
              { shopId, durationDays, slotType, paymentRef: paymentRef.trim() || undefined },
              'Boost activated.',
              'POST',
            )
          }
        >
          Boost
        </Button>
      </div>
    </div>
  );
}

export function BoostToggle({ boostId, isActive }: { boostId: string; isActive: boolean }) {
  const { run, pending } = useAdminAction();

  return (
    <Button
      size="sm"
      variant={isActive ? 'ghost' : 'outline'}
      className={isActive ? 'text-danger-600' : undefined}
      loading={pending}
      onClick={() =>
        run(
          `/api/admin/boosts/${boostId}`,
          { isActive: !isActive },
          isActive ? 'Boost stopped.' : 'Boost resumed.',
        )
      }
    >
      {isActive ? 'Stop' : 'Resume'}
    </Button>
  );
}
