'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Clock, Copy, QrCode, Smartphone } from 'lucide-react';
import { Card, FieldError, Input, Label } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { formatMinor } from '@/lib/domain/money';
import { cn } from '@/lib/cn';

/**
 * Pay-by-UPI panel.
 *
 * The money goes straight from the customer's UPI app to the shop's bank
 * account — nothing passes through this platform, which is why there is no
 * commission and no gateway to set up.
 *
 * The consequence is visible in this component's design: after tapping through
 * to their UPI app, the customer has to come back and tell us the reference,
 * because nothing else will. The copy is careful never to say "paid" before the
 * shop has confirmed it — claiming otherwise would be lying about money.
 */

type UpiIntent = {
  amountMinor: number;
  totalMinor: number;
  balanceAtCounterMinor: number;
  payeeName: string;
  upiId: string;
  uri: string;
  appLinks: { app: string; label: string; href: string }[];
  qrDataUrl: string;
  note: string;
};

type PaymentState = 'PENDING' | 'AWAITING_VERIFICATION' | 'PARTIALLY_PAID' | 'PAID';

export function UpiPaymentCard({
  orderId,
  paymentStatus,
  shopName,
}: {
  orderId: string;
  paymentStatus: PaymentState;
  shopName: string;
}) {
  const [intent, setIntent] = React.useState<UpiIntent | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [reference, setReference] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showQr, setShowQr] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const needsPayment = paymentStatus === 'PENDING';

  React.useEffect(() => {
    if (!needsPayment) return;

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/orders/${orderId}/upi`);
        const data = (await response.json()) as UpiIntent & { error?: string };
        if (cancelled) return;
        if (!response.ok) {
          setLoadError(data.error ?? 'We could not prepare the payment link.');
          return;
        }
        setIntent(data);
      } catch {
        if (!cancelled) setLoadError('We could not reach the server.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orderId, needsPayment]);

  async function submitReference(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch(`/api/orders/${orderId}/upi`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reference }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? 'We could not record that reference.');
        return;
      }

      toast(`${shopName} will confirm your payment shortly.`);
      router.refresh();
    } catch {
      setError('We could not reach the server.');
    } finally {
      setSubmitting(false);
    }
  }

  if (paymentStatus === 'AWAITING_VERIFICATION') {
    return (
      <Card className="border-warning-500/40 bg-warning-50 p-4 dark:bg-warning-500/10">
        <div className="flex items-start gap-3">
          <Clock aria-hidden className="mt-0.5 size-5 shrink-0 text-warning-600" />
          <div>
            <p className="font-bold text-warning-700 dark:text-warning-100">Waiting for the shop to confirm</p>
            <p className="mt-0.5 text-sm text-warning-700/90 dark:text-warning-100/90">
              We have sent your reference to {shopName}. They will check it in their UPI app and start preparing
              once the money shows up.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (paymentStatus === 'PARTIALLY_PAID') {
    return (
      <Card className="bg-success-50 p-4 dark:bg-success-500/10">
        <div className="flex items-start gap-3">
          <Check aria-hidden className="mt-0.5 size-5 shrink-0 text-success-600" />
          <div>
            <p className="font-bold text-success-700 dark:text-success-100">Deposit confirmed</p>
            <p className="mt-0.5 text-sm text-success-700/90 dark:text-success-100/90">
              {shopName} has your deposit. Pay the rest at the counter when you collect.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (paymentStatus === 'PAID') return null;

  if (loadError) {
    return (
      <Card className="p-4">
        <p role="alert" className="text-sm font-medium text-danger-600">
          {loadError}
        </p>
        <p className="mt-1 text-sm text-muted">You can still pay in cash at the counter.</p>
      </Card>
    );
  }

  if (!intent) {
    return <div className="h-48 animate-pulse rounded-[var(--radius-card)] bg-surface-muted" />;
  }

  return (
    <Card className="overflow-hidden">
      <div className="bg-brand-500 px-5 py-4 text-white">
        <p className="text-xs font-bold uppercase tracking-wide text-white/80">Pay now by UPI</p>
        <p className="mt-1 text-3xl font-extrabold tabular-nums">{formatMinor(intent.amountMinor)}</p>
        {intent.balanceAtCounterMinor > 0 ? (
          <p className="mt-1 text-sm text-white/90">
            {formatMinor(intent.balanceAtCounterMinor)} to pay at the counter when you collect
          </p>
        ) : null}
      </div>

      <div className="space-y-4 p-4">
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-bold">
            <Smartphone aria-hidden className="size-4 text-muted" />
            Open your UPI app
          </p>
          <div className="grid grid-cols-2 gap-2">
            {intent.appLinks.map((link) => (
              <a
                key={link.app}
                href={link.href}
                className={cn(
                  'flex h-12 items-center justify-center rounded-[var(--radius-field)] border px-3 text-sm font-bold transition-colors',
                  link.app === 'any'
                    ? 'border-brand-500 bg-brand-500 text-white hover:bg-brand-600'
                    : 'border-border bg-surface hover:bg-surface-muted',
                )}
              >
                {link.label}
              </a>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            Paying <span className="font-semibold text-foreground">{intent.payeeName}</span> directly ·{' '}
            {intent.upiId}
          </p>
        </div>

        {/* Desktop browsers cannot open a upi:// link, so the QR is the only
            way through there — and it is handy on mobile too if the buttons
            fail to resolve. */}
        <div>
          <button
            type="button"
            onClick={() => setShowQr((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-semibold text-brand-600"
          >
            <QrCode aria-hidden className="size-4" />
            {showQr ? 'Hide QR code' : 'Show QR code to scan from another phone'}
          </button>

          {showQr ? (
            <div className="mt-3 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL. */}
              <img
                src={intent.qrDataUrl}
                alt={`UPI QR code to pay ${formatMinor(intent.amountMinor)} to ${intent.payeeName}`}
                width={200}
                height={200}
                className="mx-auto size-48 rounded-[var(--radius-field)] bg-white p-2 shadow-[var(--shadow-card)]"
              />
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(intent.upiId);
                  toast('UPI ID copied');
                }}
                className="mx-auto mt-2 flex items-center gap-1.5 text-xs font-semibold text-brand-600"
              >
                <Copy aria-hidden className="size-3.5" />
                Copy UPI ID
              </button>
            </div>
          ) : null}
        </div>

        {/* The manual step the absence of a callback forces on us. */}
        <form onSubmit={submitReference} className="border-t border-border pt-4">
          <Label htmlFor="upi-reference">After paying, enter the UPI reference</Label>
          <p className="mb-2 text-xs text-muted">
            Your payment app shows it as &ldquo;UPI transaction ID&rdquo;, &ldquo;UTR&rdquo; or &ldquo;Reference
            no&rdquo;. {shopName} checks it against their own app before preparing.
          </p>
          <div className="flex gap-2">
            <Input
              id="upi-reference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="e.g. 412345678901"
              inputMode="numeric"
              autoComplete="off"
              className="flex-1"
            />
            <Button type="submit" size="lg" loading={submitting} disabled={reference.trim().length === 0}>
              Submit
            </Button>
          </div>
          <FieldError>{error}</FieldError>
        </form>
      </div>
    </Card>
  );
}
