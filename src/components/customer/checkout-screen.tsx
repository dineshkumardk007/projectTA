'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Banknote, CreditCard, MapPin, ShoppingBag, Smartphone, Users, Zap } from 'lucide-react';
import { Card, Textarea } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useCart } from '@/components/customer/cart-store';
import { useLocation } from '@/components/customer/location-store';
import { formatMinor } from '@/lib/domain/money';
import { describeTravelSync, formatClockTime } from '@/lib/domain/prep-time';
import { cn } from '@/lib/cn';

/**
 * Checkout.
 *
 * The screen answers one question above all others: *when can I pick this up?*
 * That answer is the largest thing on the page, and it comes from the server so
 * it is the same number the merchant will see.
 */

type Quote = {
  shop: {
    id: string;
    name: string;
    slug: string;
    addressLine: string;
    city: string;
    acceptsCashOnPickup: boolean;
    acceptsOnlinePayment: boolean;
    acceptsUpi: boolean;
    allowUpiDeposit: boolean;
    upiDepositPercent: number;
    upiDepositMinor: number;
  };
  orderability: { canOrder: boolean; label: string; reason?: string };
  lines: {
    productId: string;
    name: string;
    quantity: number;
    unitPriceMinor: number;
    lineTotalMinor: number;
    options: { groupName: string; optionName: string }[];
  }[];
  subtotalMinor: number;
  totalMinor: number;
  prep: { minutes: number; rangeLow: number; rangeHigh: number; queueMinutes: number };
  estimatedReadyAt: string;
  ordersAhead: number;
  travelMinutes: number | null;
  distanceKm: number | null;
};

export function CheckoutScreen({ customerName }: { customerName: string }) {
  const router = useRouter();
  const { cart, itemCount, clear, hydrated } = useCart();
  const { coords, status: locationStatus } = useLocation();
  const { toast } = useToast();

  const [quote, setQuote] = React.useState<Quote | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [placing, setPlacing] = React.useState(false);
  const [paymentMethod, setPaymentMethod] = React.useState<
    'CASH_ON_PICKUP' | 'ONLINE' | 'UPI_FULL' | 'UPI_DEPOSIT'
  >('CASH_ON_PICKUP');
  const [note, setNote] = React.useState('');

  const shareLocation = locationStatus === 'granted' && coords ? coords : undefined;

  const loadQuote = React.useCallback(async () => {
    if (!cart || cart.items.length === 0) return;
    setLoadError(null);

    try {
      const response = await fetch('/api/checkout/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          shopId: cart.shopId,
          items: cart.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            selections: item.selections.map((s) => ({ groupId: s.groupId, optionIds: s.optionIds })),
          })),
          customerLocation: shareLocation,
        }),
      });

      const data = (await response.json()) as Quote & { error?: string };
      if (!response.ok) {
        setLoadError(data.error ?? 'We could not price this order.');
        return;
      }

      setQuote(data);
      // Default to whichever method the shop actually supports, preferring the
      // one with least friction for the customer.
      setPaymentMethod(
        data.shop.acceptsCashOnPickup
          ? 'CASH_ON_PICKUP'
          : data.shop.acceptsUpi && data.shop.allowUpiDeposit
            ? 'UPI_DEPOSIT'
            : data.shop.acceptsUpi
              ? 'UPI_FULL'
              : 'ONLINE',
      );
    } catch {
      setLoadError('We could not reach the server. Check your connection and try again.');
    }
  }, [cart, shareLocation]);

  React.useEffect(() => {
    // Fetching from the server once the client-side cart has hydrated.
    // `loadQuote` is async, so nothing is set synchronously here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (hydrated) void loadQuote();
  }, [hydrated, loadQuote]);

  if (!hydrated) {
    return <div className="h-96 animate-pulse rounded-[var(--radius-card)] bg-surface-muted" />;
  }

  if (!cart || itemCount === 0) {
    return (
      <EmptyState
        icon={<ShoppingBag aria-hidden className="size-7" />}
        title="Nothing to check out"
        description="Add something from a nearby shop first."
        action={
          <Button asChild>
            <Link href="/shops">Browse shops</Link>
          </Button>
        }
      />
    );
  }

  if (loadError) {
    return (
      <div className="space-y-3">
        <ErrorState
          title="We could not confirm this order"
          description={loadError}
          onRetry={() => void loadQuote()}
        />
        <Button asChild variant="outline" className="w-full">
          <Link href="/cart">Back to cart</Link>
        </Button>
      </div>
    );
  }

  if (!quote) {
    return <div className="h-96 animate-pulse rounded-[var(--radius-card)] bg-surface-muted" />;
  }

  const readyAt = new Date(quote.estimatedReadyAt);
  const travel = describeTravelSync(quote.travelMinutes, quote.prep.minutes);
  const blocked = !quote.orderability.canOrder;

  async function placeOrder() {
    if (!cart || blocked) return;
    setPlacing(true);

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          shopId: cart.shopId,
          items: cart.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            selections: item.selections.map((s) => ({ groupId: s.groupId, optionIds: s.optionIds })),
          })),
          paymentMethod,
          customerNote: note.trim() || undefined,
          customerLocation: shareLocation,
        }),
      });

      const data = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !data.id) {
        toast(data.error ?? 'We could not place your order.', 'error');
        // The most likely cause is something changing while the customer read
        // the screen, so re-quote to show them what is different now.
        void loadQuote();
        return;
      }

      clear();
      router.push(`/orders/${data.id}?placed=1`);
    } catch {
      toast('We could not reach the server. Your order was not placed.', 'error');
    } finally {
      setPlacing(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">Confirm your order</h1>

      {blocked ? (
        <Card className="flex gap-3 border-warning-500/40 bg-warning-50 p-4 dark:bg-warning-500/10">
          <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-warning-600" />
          <div>
            <p className="font-bold text-warning-700 dark:text-warning-100">
              {quote.shop.name} cannot take this order right now
            </p>
            <p className="mt-1 text-sm text-warning-700/90 dark:text-warning-100/90">
              {quote.orderability.reason ?? 'Please try again shortly.'}
            </p>
          </div>
        </Card>
      ) : null}

      {/* The headline answer. */}
      <Card className="overflow-hidden">
        <div className="bg-brand-500 px-5 py-5 text-white">
          <p className="text-xs font-bold uppercase tracking-wide text-white/80">Estimated ready by</p>
          <p className="mt-1 text-4xl font-extrabold tabular-nums">{formatClockTime(readyAt)}</p>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-white/90">
            <Zap aria-hidden className="size-4" />
            Preparation {quote.prep.rangeLow}–{quote.prep.rangeHigh} minutes
          </p>
        </div>

        <div className="space-y-3 p-4">
          {quote.ordersAhead > 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Users aria-hidden className="size-4 shrink-0" />
              {quote.ordersAhead} {quote.ordersAhead === 1 ? 'order is' : 'orders are'} ahead of you
              {quote.prep.queueMinutes > 0 ? ` (about ${quote.prep.queueMinutes} min of the estimate)` : ''}
            </p>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Users aria-hidden className="size-4 shrink-0" />
              No queue right now
            </p>
          )}

          <div
            className={cn(
              'rounded-[var(--radius-field)] px-3.5 py-3',
              travel.verdict === 'perfect'
                ? 'bg-success-50 dark:bg-success-500/10'
                : travel.verdict === 'wait-for-order'
                  ? 'bg-warning-50 dark:bg-warning-500/10'
                  : 'bg-surface-muted',
            )}
          >
            <p className="text-sm font-bold">{travel.headline}</p>
            <p className="mt-0.5 text-sm text-muted">{travel.detail}</p>
          </div>
        </div>
      </Card>

      {/* Items */}
      <Card className="p-4">
        <h2 className="mb-3 font-bold">Your items</h2>
        <ul className="space-y-3">
          {quote.lines.map((line) => (
            <li key={`${line.productId}-${line.options.map((o) => o.optionName).join('-')}`} className="flex gap-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-muted text-xs font-bold">
                {line.quantity}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{line.name}</span>
                {line.options.length > 0 ? (
                  <span className="block text-xs text-muted">
                    {line.options.map((o) => o.optionName).join(', ')}
                  </span>
                ) : null}
              </span>
              <span className="text-sm font-semibold">{formatMinor(line.lineTotalMinor)}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-base font-extrabold">
          <span>Total</span>
          <span>{formatMinor(quote.totalMinor)}</span>
        </div>
      </Card>

      {/* Pickup */}
      <Card className="p-4">
        <h2 className="mb-2 font-bold">Pickup</h2>
        <p className="flex gap-2 text-sm text-muted">
          <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="block font-semibold text-foreground">{quote.shop.name}</span>
            {quote.shop.addressLine}, {quote.shop.city}
            {quote.distanceKm != null ? ` · ${quote.distanceKm} km away` : ''}
          </span>
        </p>
        <p className="mt-3 text-sm text-muted">
          Collected by <span className="font-semibold text-foreground">{customerName}</span>
        </p>
      </Card>

      {/* Payment */}
      <Card className="p-4">
        <h2 className="mb-3 font-bold">Payment</h2>
        <div className="space-y-2">
          {quote.shop.acceptsCashOnPickup ? (
            <PaymentOption
              icon={<Banknote aria-hidden className="size-5" />}
              label="Pay at the counter"
              hint="Cash or UPI when you collect"
              checked={paymentMethod === 'CASH_ON_PICKUP'}
              onSelect={() => setPaymentMethod('CASH_ON_PICKUP')}
            />
          ) : null}
          {/* Direct UPI — the customer pays the shop's own UPI ID, so there is
              no gateway and the shop keeps the whole amount. */}
          {quote.shop.acceptsUpi && quote.shop.allowUpiDeposit ? (
            <PaymentOption
              icon={<Smartphone aria-hidden className="size-5" />}
              label={`Pay ${formatMinor(quote.shop.upiDepositMinor)} now by UPI`}
              hint={`${quote.shop.upiDepositPercent}% now to reserve it · ${formatMinor(
                quote.totalMinor - quote.shop.upiDepositMinor,
              )} at the counter`}
              checked={paymentMethod === 'UPI_DEPOSIT'}
              onSelect={() => setPaymentMethod('UPI_DEPOSIT')}
            />
          ) : null}
          {quote.shop.acceptsUpi ? (
            <PaymentOption
              icon={<Smartphone aria-hidden className="size-5" />}
              label={`Pay ${formatMinor(quote.totalMinor)} now by UPI`}
              hint="Opens Google Pay, PhonePe, Paytm or any UPI app"
              checked={paymentMethod === 'UPI_FULL'}
              onSelect={() => setPaymentMethod('UPI_FULL')}
            />
          ) : null}
          {quote.shop.acceptsOnlinePayment ? (
            <PaymentOption
              icon={<CreditCard aria-hidden className="size-5" />}
              label="Card / net banking"
              hint="The shop starts preparing as soon as payment clears"
              checked={paymentMethod === 'ONLINE'}
              onSelect={() => setPaymentMethod('ONLINE')}
            />
          ) : null}
        </div>

        {paymentMethod === 'UPI_DEPOSIT' || paymentMethod === 'UPI_FULL' ? (
          <p className="mt-3 rounded-[var(--radius-field)] bg-surface-muted px-3 py-2.5 text-xs text-muted">
            You pay {quote.shop.name} directly from your UPI app. After paying, enter the reference number so the
            shop can confirm it and start preparing.
          </p>
        ) : null}
      </Card>

      {/* Note */}
      <Card className="p-4">
        <label htmlFor="note" className="mb-1.5 block font-bold">
          Note for the shop <span className="font-normal text-muted">(optional)</span>
        </label>
        <Textarea
          id="note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={280}
          placeholder="Anything the shop should know — e.g. less sugar, arriving a bit late"
        />
      </Card>

      <div className="sticky bottom-20 z-30">
        <Button size="action" loading={placing} disabled={blocked} onClick={placeOrder} className="shadow-[var(--shadow-raised)]">
          {blocked ? 'Shop unavailable' : `Place order · ${formatMinor(quote.totalMinor)}`}
        </Button>
      </div>

      <p className="pb-2 text-center text-xs text-muted">
        You can cancel free of charge until the shop starts preparing your order.
      </p>
    </div>
  );
}

function PaymentOption({
  icon,
  label,
  hint,
  checked,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-[var(--radius-field)] border p-3.5 transition-colors',
        checked ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30' : 'border-border bg-surface hover:bg-surface-muted',
      )}
    >
      <input
        type="radio"
        name="paymentMethod"
        checked={checked}
        onChange={onSelect}
        className="size-4 accent-brand-500"
      />
      <span className="text-muted">{icon}</span>
      <span className="flex-1">
        <span className="block text-sm font-bold">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </label>
  );
}
