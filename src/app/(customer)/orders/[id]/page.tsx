import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/guards';
import { ACTIVE_STATUSES } from '@/lib/domain/order-status';
import { buildPickupToken, renderPickupQr } from '@/lib/services/pickup';
import { OrderTracker } from '@/components/customer/order-tracker';
import { ReorderButton } from '@/components/customer/reorder-button';
import { Card } from '@/components/ui/primitives';
import { formatMinor } from '@/lib/domain/money';

export const dynamic = 'force-dynamic';

/**
 * Never say "paid" before the money is confirmed. A UPI order sits in
 * AWAITING_VERIFICATION on nothing more than the customer's word, and telling
 * them it is paid at that point would be a lie about money.
 */
function describePayment(order: {
  paymentMethod: string;
  paymentStatus: string;
  totalMinor: number;
  amountPaidMinor: number;
}): string {
  if (order.paymentMethod === 'CASH_ON_PICKUP') return 'Paying at the counter';

  switch (order.paymentStatus) {
    case 'PAID':
      return 'Paid in full';
    case 'PARTIALLY_PAID':
      return `${formatMinor(order.amountPaidMinor)} paid · ${formatMinor(
        Math.max(0, order.totalMinor - order.amountPaidMinor),
      )} at the counter`;
    case 'AWAITING_VERIFICATION':
      return 'Waiting for the shop to confirm your payment';
    case 'REFUNDED':
      return 'Refunded';
    case 'FAILED':
      return 'Payment did not go through';
    default:
      return 'Payment pending';
  }
}
export const metadata: Metadata = { title: 'Track your order' };

type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function OrderPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { id } = await params;
  const search = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect(`/signin?next=/orders/${id}`);

  const order = await db.order.findUnique({
    where: { id },
    include: {
      items: true,
      shop: { select: { name: true, phone: true, latitude: true, longitude: true, addressLine: true, city: true } },
    },
  });

  if (!order) notFound();
  // The order id being unguessable is not authorisation — check ownership.
  if (order.customerId !== user.id && user.role !== 'ADMIN') notFound();

  const ordersAhead = ACTIVE_STATUSES.includes(order.status)
    ? await db.order.count({
        where: { shopId: order.shopId, status: { in: ACTIVE_STATUSES }, placedAt: { lt: order.placedAt } },
      })
    : 0;

  const qrDataUrl = await renderPickupQr(buildPickupToken(order.id, order.pickupCode));

  return (
    <div className="space-y-4">
      <OrderTracker
        justPlaced={search.placed === '1'}
        qrDataUrl={qrDataUrl}
        pickupCode={order.pickupCode}
        arrivedAt={order.customerArrivedAt?.toISOString() ?? null}
        shopLatitude={order.shop.latitude}
        shopLongitude={order.shop.longitude}
        initial={{
          id: order.id,
          code: order.code,
          status: order.status,
          estimatedReadyAt: order.estimatedReadyAt.toISOString(),
          readyAt: order.readyAt?.toISOString() ?? null,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          totalMinor: order.totalMinor,
          waitMinutesSaved: order.waitMinutesSaved,
          ordersAhead,
          shopName: order.shop.name,
          shopPhone: order.shop.phone,
        }}
      />

      <Card className="p-4">
        <h2 className="mb-3 font-bold">Order summary</h2>
        <ul className="space-y-3">
          {order.items.map((item) => {
            const options = (item.selectedOptions as { groupName: string; optionName: string }[] | null) ?? [];
            return (
              <li key={item.id} className="flex gap-3">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-muted text-xs font-bold">
                  {item.quantity}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{item.nameSnapshot}</span>
                  {options.length > 0 ? (
                    <span className="block text-xs text-muted">{options.map((o) => o.optionName).join(', ')}</span>
                  ) : null}
                </span>
                <span className="text-sm font-semibold">{formatMinor(item.lineTotalMinor)}</span>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 flex items-center justify-between border-t border-border pt-3 font-extrabold">
          <span>Total</span>
          <span>{formatMinor(order.totalMinor)}</span>
        </div>

        <p className="mt-3 text-xs text-muted">
          {describePayment(order)}
          {' · '}
          Pickup at {order.shop.addressLine}, {order.shop.city}
        </p>

        {/* The moment a customer is most likely to want the same thing again is
            right after collecting it. */}
        {['PICKED_UP', 'CANCELLED', 'REJECTED', 'EXPIRED'].includes(order.status) ? (
          <div className="mt-4 border-t border-border pt-4">
            <ReorderButton orderId={order.id} className="w-full" size="lg" variant="primary" />
          </div>
        ) : null}

        {order.customerNote ? (
          <p className="mt-3 rounded-[var(--radius-field)] bg-surface-muted px-3 py-2 text-sm">
            <span className="font-semibold">Your note: </span>
            {order.customerNote}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
