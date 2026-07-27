'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Camera, CameraOff, CheckCircle2, Keyboard, XCircle } from 'lucide-react';
import { Card, Input, Label } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { formatMinor } from '@/lib/domain/money';
import { cn } from '@/lib/cn';

/**
 * Counter pickup verification.
 *
 * The camera is a convenience, never a requirement: the manual order-number
 * entry sits alongside it with equal prominence, because counters lose camera
 * permission, phones die, and QR codes get smudged. Both paths hit the same
 * server-side check.
 *
 * html5-qrcode is loaded dynamically so a merchant who never opens this screen
 * never downloads the decoder.
 */

type VerifiedOrder = {
  id: string;
  code: string;
  status: string;
  totalMinor: number;
  paymentMethod: 'CASH_ON_PICKUP' | 'ONLINE';
  paymentStatus: string;
  customerName: string;
  customerPhone: string | null;
  collectable: boolean;
  hint: string;
  items: { id: string; name: string; quantity: number; options: { optionName: string }[] }[];
};

const SCANNER_ELEMENT_ID = 'takeaway-qr-reader';

export function PickupScanner({ shopId }: { shopId: string }) {
  const [mode, setMode] = React.useState<'idle' | 'scanning'>('idle');
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ order: VerifiedOrder; method: string } | null>(null);
  const [lookupError, setLookupError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  const scannerRef = React.useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  const verify = React.useCallback(
    async (payload: { token?: string; code?: string; pickupCode?: string }) => {
      setPending(true);
      setLookupError(null);
      try {
        const response = await fetch('/api/merchant/pickup/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ shopId, ...payload }),
        });
        const data = (await response.json()) as { error?: string; order?: VerifiedOrder; method?: string };

        if (!response.ok || !data.order) {
          setLookupError(data.error ?? 'We could not find that order.');
          setResult(null);
          return;
        }

        setResult({ order: data.order, method: data.method ?? 'MANUAL' });
      } catch {
        setLookupError('We could not reach the server.');
      } finally {
        setPending(false);
      }
    },
    [shopId],
  );

  const stopScanner = React.useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {
        // Already stopped — nothing to do.
      }
      scannerRef.current = null;
    }
    setMode('idle');
  }, []);

  async function startScanner() {
    setCameraError(null);
    setMode('scanning');

    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
      scannerRef.current = scanner as unknown as { stop: () => Promise<void>; clear: () => void };

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          // One scan is enough — stop immediately so the same code is not read
          // ten times while the staff member reads the screen.
          void stopScanner();
          void verify({ token: decodedText });
        },
        () => {
          // Per-frame decode misses are normal; ignore them.
        },
      );
    } catch {
      setCameraError(
        'We could not open the camera. Check the browser permission, or enter the order number instead.',
      );
      setMode('idle');
    }
  }

  React.useEffect(() => () => void stopScanner(), [stopScanner]);

  async function confirmPickup(order: VerifiedOrder, method: string) {
    setConfirming(true);
    try {
      const response = await fetch(`/api/merchant/orders/${order.id}/transition`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to: 'PICKED_UP', verificationMethod: method }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast(data.error ?? 'We could not confirm this pickup.', 'error');
        return;
      }
      toast(`Order ${order.code} handed over`);
      setResult(null);
      router.refresh();
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">Scan the customer&rsquo;s QR</h2>
          {mode === 'scanning' ? (
            <Button size="sm" variant="ghost" onClick={stopScanner}>
              <CameraOff aria-hidden className="size-4" />
              Stop
            </Button>
          ) : null}
        </div>

        <div
          id={SCANNER_ELEMENT_ID}
          className={cn(
            'overflow-hidden rounded-[var(--radius-field)] bg-ink-900',
            mode === 'scanning' ? 'block' : 'hidden',
          )}
        />

        {mode === 'idle' ? (
          <Button size="action" onClick={startScanner}>
            <Camera aria-hidden className="size-4" />
            Open the camera
          </Button>
        ) : null}

        {cameraError ? (
          <p role="alert" className="mt-3 text-sm font-medium text-danger-600">
            {cameraError}
          </p>
        ) : null}
      </Card>

      <Card className="p-4">
        <h2 className="mb-1 flex items-center gap-2 font-bold">
          <Keyboard aria-hidden className="size-4 text-muted" />
          Or enter it by hand
        </h2>
        <p className="mb-3 text-sm text-muted">
          Works when the customer&rsquo;s phone is dead or the code will not scan.
        </p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const code = String(form.get('code') ?? '').trim();
            if (code) void verify({ code });
          }}
          className="flex gap-2"
        >
          <div className="flex-1">
            <Label htmlFor="order-code" className="sr-only">
              Order number
            </Label>
            <Input
              id="order-code"
              name="code"
              placeholder="Order number, e.g. A102"
              autoComplete="off"
              autoCapitalize="characters"
              className="uppercase"
            />
          </div>
          <Button type="submit" size="lg" loading={pending}>
            Find
          </Button>
        </form>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const pickupCode = String(form.get('pickupCode') ?? '').trim();
            if (pickupCode) void verify({ pickupCode });
          }}
          className="mt-3 flex gap-2"
        >
          <div className="flex-1">
            <Label htmlFor="pickup-code" className="sr-only">
              Pickup code
            </Label>
            <Input
              id="pickup-code"
              name="pickupCode"
              placeholder="6-character pickup code"
              autoComplete="off"
              autoCapitalize="characters"
              className="uppercase"
            />
          </div>
          <Button type="submit" size="lg" variant="outline" loading={pending}>
            Find
          </Button>
        </form>
      </Card>

      {lookupError ? (
        <Card className="flex gap-3 border-danger-500/40 p-4">
          <XCircle aria-hidden className="mt-0.5 size-5 shrink-0 text-danger-600" />
          <p role="alert" className="text-sm font-semibold text-danger-700 dark:text-danger-100">
            {lookupError}
          </p>
        </Card>
      ) : null}

      {result ? (
        <Card className={cn('animate-pop p-4', result.order.collectable && 'border-success-500/40')}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-2xl font-extrabold">{result.order.code}</p>
              <p className="text-sm text-muted">{result.order.customerName}</p>
            </div>
            <span
              className={cn(
                'flex size-10 items-center justify-center rounded-full',
                result.order.collectable
                  ? 'bg-success-50 text-success-600 dark:bg-success-500/15'
                  : 'bg-warning-50 text-warning-600 dark:bg-warning-500/15',
              )}
            >
              {result.order.collectable ? (
                <CheckCircle2 aria-hidden className="size-5" />
              ) : (
                <XCircle aria-hidden className="size-5" />
              )}
            </span>
          </div>

          <p
            className={cn(
              'mt-3 rounded-[var(--radius-field)] px-3 py-2 text-sm font-semibold',
              result.order.collectable
                ? 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-100'
                : 'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-100',
            )}
          >
            {result.order.hint}
          </p>

          <ul className="mt-3 space-y-1.5">
            {result.order.items.map((item) => (
              <li key={item.id} className="flex gap-2.5 text-sm">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-muted text-xs font-bold">
                  {item.quantity}
                </span>
                <span>
                  <span className="font-semibold">{item.name}</span>
                  {item.options.length > 0 ? (
                    <span className="block text-xs text-muted">
                      {item.options.map((o) => o.optionName).join(', ')}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>

          {result.order.paymentMethod === 'CASH_ON_PICKUP' && result.order.collectable ? (
            <p className="mt-3 rounded-[var(--radius-field)] bg-brand-50 px-3 py-2.5 text-center font-bold text-brand-700 dark:bg-brand-900/30 dark:text-brand-100">
              Collect {formatMinor(result.order.totalMinor)} in cash
            </p>
          ) : null}

          <div className="mt-4 space-y-2">
            {result.order.collectable ? (
              <Button
                size="action"
                variant="success"
                loading={confirming}
                onClick={() => confirmPickup(result.order, result.method)}
              >
                Confirm pickup
              </Button>
            ) : null}
            <Button variant="ghost" className="w-full" onClick={() => setResult(null)}>
              Clear
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
