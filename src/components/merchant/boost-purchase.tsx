'use client';

import * as React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Check, Rocket } from 'lucide-react';
import type { BoostSlotType } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Card, Input, Label } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { BOOST_PACKAGES, BOOST_SLOTS } from '@/lib/domain/boost-plans';
import { formatMinor } from '@/lib/domain/money';
import { cn } from '@/lib/cn';

/**
 * "Boost my shop today".
 *
 * Written for a shop owner deciding between customers, so the whole thing is one
 * screen: pick a length, pay, type the reference. No cart, no checkout step and
 * no account setup — the moment this needs a second page it stops being an
 * impulse purchase and becomes a decision to postpone.
 */
export function BoostPurchase({
  shopId,
  shopName,
  payment,
}: {
  shopId: string;
  shopName: string;
  payment: {
    configured: boolean;
    upiId: string;
    payeeName: string;
    supportPhone: string;
    qrByDuration: Record<number, string | null>;
    linksByDuration: Record<number, { app: string; label: string; href: string }[]>;
  };
}) {
  const [durationDays, setDurationDays] = React.useState<1 | 3 | 7>(1);
  const [slotType, setSlotType] = React.useState<BoostSlotType>('SEARCH_PINNED');
  const [reference, setReference] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const pkg = BOOST_PACKAGES.find((option) => option.durationDays === durationDays) ?? BOOST_PACKAGES[0];
  const qr = payment.qrByDuration[durationDays] ?? null;
  const links = payment.linksByDuration[durationDays] ?? [];

  async function activate() {
    setPending(true);
    try {
      const response = await fetch('/api/merchant/boosts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          shopId,
          durationDays,
          slotType,
          paymentRef: reference.trim() || undefined,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast(data.error ?? 'That boost could not be activated.', 'error');
        return;
      }
      toast(`${shopName} is featured for the next ${durationDays} day${durationDays === 1 ? '' : 's'}.`);
      setReference('');
      router.refresh();
    } catch {
      toast('We could not reach the server.', 'error');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-sm font-bold">How long?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {BOOST_PACKAGES.map((option) => {
            const selected = option.durationDays === durationDays;
            return (
              <button
                key={option.durationDays}
                type="button"
                aria-pressed={selected}
                onClick={() => setDurationDays(option.durationDays)}
                className={cn(
                  'rounded-[var(--radius-card)] border p-4 text-left transition-colors',
                  selected
                    ? 'border-brand-400 bg-brand-50 ring-2 ring-brand-500/20 dark:bg-brand-900/30'
                    : 'border-border bg-surface hover:bg-surface-muted',
                )}
              >
                <span className="flex items-center justify-between">
                  <span className="text-sm font-bold">{option.label}</span>
                  {selected ? <Check aria-hidden className="size-4 text-brand-600" /> : null}
                </span>
                <span className="mt-1 block text-2xl font-extrabold tabular-nums">
                  {formatMinor(option.priceMinor)}
                </span>
                <span className="mt-0.5 block text-xs text-muted">{option.note}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-bold">Where?</legend>
        <div className="space-y-2">
          {BOOST_SLOTS.map((slot) => (
            <label
              key={slot.slotType}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-[var(--radius-field)] border p-3 transition-colors',
                slotType === slot.slotType
                  ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/30'
                  : 'border-border hover:bg-surface-muted',
              )}
            >
              <input
                type="radio"
                name="slot"
                value={slot.slotType}
                checked={slotType === slot.slotType}
                onChange={() => setSlotType(slot.slotType)}
                className="mt-0.5 size-4 accent-[var(--color-brand-500)]"
              />
              <span>
                <span className="block text-sm font-semibold">{slot.label}</span>
                <span className="block text-xs text-muted">{slot.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Card className="p-4">
        <h3 className="text-sm font-bold">Pay {formatMinor(pkg.priceMinor)}</h3>
        {payment.configured ? (
          <div className="mt-3 grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
            {qr ? (
              <Image
                src={qr}
                alt={`UPI QR code to pay ${formatMinor(pkg.priceMinor)} to ${payment.payeeName}`}
                width={150}
                height={150}
                className="rounded-[var(--radius-field)] border border-border bg-white p-2"
                unoptimized
              />
            ) : null}
            <div>
              <p className="text-sm">
                Send {formatMinor(pkg.priceMinor)} to <span className="font-bold">{payment.upiId}</span>, then
                enter the UPI reference below.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {links.slice(0, 3).map((link) => (
                  <Button key={link.app} asChild size="sm" variant="outline">
                    <a href={link.href}>{link.label}</a>
                  </Button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Payment details are not configured yet
            {payment.supportPhone ? ` — message us on ${payment.supportPhone}` : ''}. You can still activate
            a boost and settle it with us afterwards.
          </p>
        )}

        <div className="mt-4">
          <Label htmlFor="boost-reference">UPI reference number</Label>
          <Input
            id="boost-reference"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="123456789012"
            inputMode="numeric"
          />
          <p className="mt-1 text-xs text-muted">
            Optional, but it is what lets us match your payment if anything is queried later.
          </p>
        </div>

        <Button size="action" className="mt-4" loading={pending} onClick={activate}>
          <Rocket aria-hidden className="size-4" />
          Feature {shopName} for {pkg.label.toLowerCase()}
        </Button>
        <p className="mt-2 text-xs text-muted">
          A boost moves your shop to the top of search and browse for customers nearby. It does not change
          your opening hours, and it cannot show your shop while you are closed.
        </p>
      </Card>
    </div>
  );
}
