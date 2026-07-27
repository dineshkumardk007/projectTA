import { db } from '@/lib/db';
import { DomainError, ok, route } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { ACTIVE_STATUSES } from '@/lib/domain/order-status';

/**
 * Live order state, polled by the customer's tracker.
 *
 * Access is checked against the order's own `customerId` — the id in the URL
 * being unguessable is not treated as authorisation.
 */
export const GET = route(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const user = await requireUser();

  const order = await db.order.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      status: true,
      customerId: true,
      shopId: true,
      placedAt: true,
      estimatedReadyAt: true,
      readyAt: true,
      paymentStatus: true,
      paymentMethod: true,
      totalMinor: true,
      waitMinutesSaved: true,
      shop: { select: { name: true, phone: true } },
    },
  });

  if (!order) throw new DomainError('That order could not be found.', 404);

  const isCustomer = order.customerId === user.id;
  if (!isCustomer && user.role !== 'ADMIN') {
    // Shop staff reach orders through the merchant endpoints, which scope by
    // shop; this one is the customer's view.
    throw new DomainError('You do not have access to this order.', 403);
  }

  const ordersAhead = ACTIVE_STATUSES.includes(order.status)
    ? await db.order.count({
        where: { shopId: order.shopId, status: { in: ACTIVE_STATUSES }, placedAt: { lt: order.placedAt } },
      })
    : 0;

  return ok({
    id: order.id,
    code: order.code,
    status: order.status,
    estimatedReadyAt: order.estimatedReadyAt,
    readyAt: order.readyAt,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    totalMinor: order.totalMinor,
    waitMinutesSaved: order.waitMinutesSaved,
    ordersAhead,
    shopName: order.shop.name,
    shopPhone: order.shop.phone,
  });
});
