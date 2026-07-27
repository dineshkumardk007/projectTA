'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, Circle, CreditCard, Loader2, PartyPopper, Phone, MapPin, XCircle } from 'lucide-react';
import type { OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { Card } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ArrivalControl } from '@/components/customer/arrival-control';
import { UpiPaymentCard } from '@/components/customer/upi-payment-card';
import { TRACKER_STEPS, customerCancellation, trackerProgress } from '@/lib/domain/order-status';
import { formatClockTime } from '@/lib/domain/prep-time';
import { formatMinor } from '@/lib/domain/money';
import { cn } from '@/lib/cn';

/**
 * Live order tracking.
 *
 * State is polled rather than pushed. A websocket would be lower latency, but
 * polling survives flaky mobile networks, proxies and a phone waking from
 * sleep — and "ready" arriving 5 seconds late is invisible, whereas a socket
 * that silently died is not. The interval backs off once the order is ready and
 * stops entirely once it is closed.
 */

export type TrackedOrder = {
  id: string;
  code: string;
  status: OrderStatus;
  estimatedReadyAt: string;
  readyAt: string | null;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  totalMinor: number;
  waitMinutesSaved: number | null;
  ordersAhead: number;
  shopName: string;
  shopPhone: string;
};

const CLOSED: OrderStatus[] = ['PICKED_UP', 'REJECTED', 'CANCELLED', 'EXPIRED'];

/**
 * Online payment step.
 *
 * The shop is not allowed to accept an unpaid online order, so until this
 * completes the customer's order is not in the kitchen — the card says so
 * plainly rather than leaving them wondering why nothing is happening.
 *
 * With the mock provider this completes in one round trip. With a real gateway
 * the `clientPayload` is handed to that provider's SDK here instead.
 */
function PayNowCard({ order, onPaid }: { order: TrackedOrder; onPaid: () => void }) {
  const [paying, setPaying] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  async function pay() {
    setPaying(true);
    try {
      const intentResponse = await fetch(`/api/orders/${order.id}/pay`, { method: 'POST' });
      const intent = (await intentResponse.json()) as {
        error?: string;
        reference?: string;
        clientPayload?: Record<string, string>;
      };

      if (!intentResponse.ok || !intent.reference) {
        toast(intent.error ?? 'We could not start the payment.', 'error');
        return;
      }

      const confirmResponse = await fetch(`/api/orders/${order.id}/pay`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reference: intent.reference,
          signature: intent.clientPayload?.signature,
        }),
      });
      const confirmation = (await confirmResponse.json()) as { error?: string };

      if (!confirmResponse.ok) {
        toast(confirmation.error ?? 'Your payment did not go through.', 'error');
        return;
      }

      toast('Payment received. The shop can start preparing.');
      onPaid();
      router.refresh();
    } catch {
      toast('We could not reach the payment service.', 'error');
    } finally {
      setPaying(false);
    }
  }

  return (
    <Card className="border-warning-500/40 bg-warning-50 p-4 dark:bg-warning-500/10">
      <div className="flex items-start gap-3">
        <CreditCard aria-hidden className="mt-0.5 size-5 shrink-0 text-warning-600" />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-warning-700 dark:text-warning-100">Payment needed</p>
          <p className="mt-0.5 text-sm text-warning-700/90 dark:text-warning-100/90">
            {order.shopName} starts preparing as soon as this is paid.
          </p>
        </div>
      </div>
      <Button size="action" className="mt-3" loading={paying} onClick={pay}>
        Pay {formatMinor(order.totalMinor)} now
      </Button>
    </Card>
  );
}

export function OrderTracker({
  initial,
  qrDataUrl,
  pickupCode,
  shopLatitude,
  shopLongitude,
  justPlaced,
  arrivedAt,
}: {
  initial: TrackedOrder;
  qrDataUrl: string;
  pickupCode: string;
  shopLatitude: number;
  shopLongitude: number;
  justPlaced: boolean;
  arrivedAt: string | null;
}) {
  const [order, setOrder] = React.useState(initial);
  const [cancelling, setCancelling] = React.useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const closed = CLOSED.includes(order.status);

  React.useEffect(() => {
    if (closed) return;

    // Poll faster while the customer is waiting for the shop to move, slower
    // once the order is ready and the answer is no longer changing.
    const intervalMs = order.status === 'READY' ? 20_000 : 8_000;

    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/orders/${order.id}`, { cache: 'no-store' });
        if (!response.ok) return;
        const next = (await response.json()) as TrackedOrder;

        setOrder((current) => {
          if (next.status !== current.status) {
            if (next.status === 'READY') toast('Your order is ready for pickup!', 'success');
            if (next.status === 'PICKED_UP') toast('Order collected. Enjoy!', 'success');
            // Refresh the server components so history and banners stay in sync.
            router.refresh();
          }
          return next;
        });
      } catch {
        // A failed poll is not worth showing — the next one will likely work.
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [order.id, order.status, closed, router, toast]);

  const currentStep = trackerProgress(order.status);
  const policy = customerCancellation(order.status);

  async function cancel() {
    setCancelling(true);
    try {
      const response = await fetch(`/api/orders/${order.id}/cancel`, { method: 'POST' });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast(data.error ?? 'We could not cancel this order.', 'error');
        return;
      }
      toast('Order cancelled.');
      router.refresh();
      setOrder((current) => ({ ...current, status: 'CANCELLED' }));
    } catch {
      toast('We could not reach the server.', 'error');
    } finally {
      setCancelling(false);
    }
  }

  if (order.status === 'REJECTED' || order.status === 'CANCELLED' || order.status === 'EXPIRED') {
    return (
      <div className="space-y-4">
        <Card className="p-6 text-center">
          <span className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-danger-50 text-danger-600 dark:bg-danger-500/15">
            <XCircle aria-hidden className="size-7" />
          </span>
          <h1 className="text-xl font-extrabold">
            Order {order.code} {order.status === 'REJECTED' ? 'was not accepted' : order.status.toLowerCase()}
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {order.status === 'REJECTED'
              ? `${order.shopName} could not take this order.`
              : 'This order is closed.'}
            {order.paymentStatus === 'REFUNDED' ? ' Your payment has been refunded.' : ''}
          </p>
        </Card>
        <Button asChild variant="outline" className="w-full">
          <Link href="/shops">Find another shop</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {justPlaced && order.status === 'PLACED' ? (
        <p
          role="status"
          className="rounded-[var(--radius-field)] bg-success-50 px-4 py-3 text-sm font-semibold text-success-700 dark:bg-success-500/15 dark:text-success-100"
        >
          Order placed. {order.shopName} will confirm in a moment.
        </p>
      ) : null}

      {order.paymentMethod === 'ONLINE' && order.paymentStatus !== 'PAID' && !closed ? (
        <PayNowCard order={order} onPaid={() => setOrder((c) => ({ ...c, paymentStatus: 'PAID' }))} />
      ) : null}

      {/* Direct UPI: the customer pays the shop, then reports the reference.
          Shown until the shop confirms, and for a deposit until the balance is
          collected at the counter. */}
      {['UPI_FULL', 'UPI_DEPOSIT'].includes(order.paymentMethod) && order.paymentStatus !== 'PAID' && !closed ? (
        <UpiPaymentCard
          orderId={order.id}
          shopName={order.shopName}
          paymentStatus={order.paymentStatus as 'PENDING' | 'AWAITING_VERIFICATION' | 'PARTIALLY_PAID' | 'PAID'}
        />
      ) : null}

      {/* Ready state — the moment the product exists for. */}
      {order.status === 'READY' ? (
        <Card className="animate-pop overflow-hidden border-success-500/40">
          <div className="bg-success-600 px-5 py-5 text-center text-white">
            <PartyPopper aria-hidden className="mx-auto mb-2 size-8" />
            <h1 className="text-2xl font-extrabold">Your order is ready!</h1>
            <p className="mt-1 text-sm text-white/90">Collect it at {order.shopName}</p>
          </div>

          <div className="p-5 text-center">
            <p className="text-sm font-semibold text-muted">Show this at the counter</p>
            <p className="mt-1 text-3xl font-extrabold tracking-tight">{order.code}</p>

            {/* eslint-disable-next-line @next/next/no-img-element -- generated
                data URL, nothing for the image optimiser to do. */}
            <img
              src={qrDataUrl}
              alt={`QR code for order ${order.code}`}
              width={200}
              height={200}
              className="mx-auto mt-4 size-48 rounded-[var(--radius-field)] bg-white p-2 shadow-[var(--shadow-card)]"
            />

            <p className="mt-4 text-xs text-muted">
              No camera at the counter? Read out your pickup code:
              <span className="ml-1 font-mono text-sm font-bold tracking-widest text-foreground">{pickupCode}</span>
            </p>

            {order.paymentMethod === 'CASH_ON_PICKUP' ? (
              <p className="mt-3 rounded-[var(--radius-field)] bg-surface-muted px-3 py-2 text-sm font-semibold">
                Pay {formatMinor(order.totalMinor)} at the counter
              </p>
            ) : null}
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="bg-brand-500 px-5 py-5 text-white">
            <p className="text-xs font-bold uppercase tracking-wide text-white/80">Order {order.code}</p>
            <p className="mt-1 text-3xl font-extrabold tabular-nums">
              {formatClockTime(new Date(order.estimatedReadyAt))}
            </p>
            <p className="mt-1 text-sm text-white/90">Estimated ready time · {order.shopName}</p>
          </div>

          {order.ordersAhead > 0 ? (
            <p className="border-b border-border px-5 py-3 text-sm text-muted">
              <span className="font-semibold text-foreground">{order.ordersAhead}</span>{' '}
              {order.ordersAhead === 1 ? 'order is' : 'orders are'} ahead of you
            </p>
          ) : null}
        </Card>
      )}

      {/* Step tracker */}
      <Card className="p-5">
        <h2 className="sr-only">Order progress</h2>
        <ol className="space-y-0">
          {TRACKER_STEPS.map((step, index) => {
            const done = index < currentStep;
            const active = index === currentStep;
            const isLast = index === TRACKER_STEPS.length - 1;

            return (
              <li key={step.status} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                      done && 'border-success-600 bg-success-600 text-white',
                      active && 'border-brand-500 bg-brand-500 text-white',
                      !done && !active && 'border-border bg-surface text-ink-300',
                    )}
                  >
                    {done ? (
                      <Check aria-hidden className="size-4" />
                    ) : active ? (
                      <Loader2 aria-hidden className="size-3.5 animate-spin" />
                    ) : (
                      <Circle aria-hidden className="size-2 fill-current" />
                    )}
                  </span>
                  {!isLast ? (
                    <span
                      aria-hidden
                      className={cn('my-1 w-0.5 flex-1 rounded-full', done ? 'bg-success-600' : 'bg-border')}
                    />
                  ) : null}
                </div>

                <div className={cn('pb-5', isLast && 'pb-0')}>
                  <p
                    className={cn(
                      'text-sm font-bold leading-7',
                      done && 'text-foreground',
                      active && 'text-brand-600',
                      !done && !active && 'text-muted',
                    )}
                  >
                    {done ? step.done : step.label}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>

      {order.status === 'PICKED_UP' && order.waitMinutesSaved != null && order.waitMinutesSaved > 0 ? (
        <Card className="bg-success-50 p-5 text-center dark:bg-success-500/10">
          <p className="text-sm font-semibold text-success-700 dark:text-success-100">
            You saved about
          </p>
          <p className="text-3xl font-extrabold text-success-700 dark:text-success-100">
            {order.waitMinutesSaved} minutes
          </p>
          <p className="mt-1 text-xs text-success-700/80 dark:text-success-100/80">
            compared with waiting in the queue at this shop
          </p>
        </Card>
      ) : null}

      {!closed ? (
        <ArrivalControl
          orderId={order.id}
          shopLatitude={shopLatitude}
          shopLongitude={shopLongitude}
          initialArrivedAt={arrivedAt}
        />
      ) : null}

      <div className="grid gap-2" data-testid="order-actions">
        <Button asChild variant="outline">
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${shopLatitude},${shopLongitude}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MapPin aria-hidden className="size-4" />
            Directions to {order.shopName}
          </a>
        </Button>
        <Button asChild variant="ghost">
          <a href={`tel:${order.shopPhone}`}>
            <Phone aria-hidden className="size-4" />
            Call the shop
          </a>
        </Button>

        {policy.allowed ? (
          <Button variant="ghost" className="text-danger-600" loading={cancelling} onClick={cancel}>
            Cancel this order
          </Button>
        ) : !closed ? (
          <p className="px-2 text-center text-xs text-muted">{policy.reason}</p>
        ) : null}
      </div>
    </div>
  );
}
