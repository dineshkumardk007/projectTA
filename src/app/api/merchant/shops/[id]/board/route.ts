import { db } from '@/lib/db';
import { ok, route } from '@/lib/api';
import { requireShopAccess, requireUser } from '@/lib/auth/guards';
import { ACTIVE_STATUSES } from '@/lib/domain/order-status';

/**
 * Live order board data, polled by the merchant dashboard every few seconds.
 *
 * A counter needs to notice a new order without watching the screen, so this
 * endpoint is kept deliberately cheap. Everything below the authorisation check
 * goes out in **one round trip**: at one poll every six seconds per device, an
 * extra sequential query is not paid once, it is paid six hundred times an hour
 * on a connection that may be a phone on mobile data.
 */
export const GET = route(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const user = await requireUser(['MERCHANT', 'STAFF', 'ADMIN']);
  const { shop } = await requireShopAccess(id, user);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [orders, todayStats, collectedToday] = await Promise.all([
    db.order.findMany({
      where: {
        shopId: shop.id,
        OR: [
          { status: { in: [...ACTIVE_STATUSES, 'READY'] } },
          { closedAt: { gte: startOfDay } },
        ],
      },
      orderBy: { placedAt: 'asc' },
      include: {
        items: { select: { id: true, nameSnapshot: true, quantity: true, selectedOptions: true } },
        customer: { select: { name: true, phone: true } },
        payments: {
          where: { status: 'AWAITING_VERIFICATION' },
          select: { customerReference: true, status: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    }),
    db.order.aggregate({
      where: { shopId: shop.id, placedAt: { gte: startOfDay } },
      _count: { _all: true },
      _sum: { totalMinor: true },
    }),
    // "How many collected today" and "how much did that earn" share a filter, so
    // they are one aggregate rather than a count followed by a sum.
    db.order.aggregate({
      where: { shopId: shop.id, status: 'PICKED_UP', pickedUpAt: { gte: startOfDay } },
      _count: { _all: true },
      _sum: { totalMinor: true },
    }),
  ]);

  return ok({
    shop: { id: shop.id, name: shop.name, status: shop.status, basePrepMinutes: shop.basePrepMinutes },
    orders: orders.map((order) => ({
      id: order.id,
      code: order.code,
      status: order.status,
      placedAt: order.placedAt,
      estimatedReadyAt: order.estimatedReadyAt,
      totalMinor: order.totalMinor,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      promisedPrepMinutes: order.promisedPrepMinutes,
      customerEtaMinutes: order.customerEtaMinutes,
      customerArrivedAt: order.customerArrivedAt,
      customerName: order.customer.name,
      customerPhone: order.customer.phone,
      customerNote: order.customerNote,
      amountPaidMinor: order.amountPaidMinor,
      amountDueOnlineMinor: order.amountDueOnlineMinor,
      // The reference the customer typed after paying by UPI, so the counter has
      // something to search for in their own app.
      pendingUpiReference:
        order.payments.find((p) => p.status === 'AWAITING_VERIFICATION')?.customerReference ?? null,
      isCustomList: order.isCustomList,
      customListText: order.customListText,
      slipImageUrl: order.slipImageUrl,
      items: order.items.map((item) => ({
        id: item.id,
        name: item.nameSnapshot,
        quantity: item.quantity,
        options: (item.selectedOptions as { optionName: string }[] | null) ?? [],
      })),
    })),
    stats: {
      ordersToday: todayStats._count._all,
      orderedValueToday: todayStats._sum.totalMinor ?? 0,
      completedToday: collectedToday._count._all,
      salesToday: collectedToday._sum.totalMinor ?? 0,
    },
  });
});
