import { requireUser } from '@/lib/auth/guards';
import { clientKey, ok, rateLimit, route } from '@/lib/api';
import { placeOrder } from '@/lib/services/orders';
import { placeOrderSchema } from '@/lib/validation';
import { getMapsProvider } from '@/lib/providers/maps.server';
import { db } from '@/lib/db';

/** Place a pre-order. */
export const POST = route(async (request: Request) => {
  const user = await requireUser(['CUSTOMER']);
  rateLimit(clientKey(request, `order:${user.id}`), 10, 60_000);

  const body = placeOrderSchema.parse(await request.json());

  // Travel-time synchronisation: work out how far away the customer is so the
  // merchant can see it on the order card and decide when to start cooking.
  let customerEtaMinutes: number | null = null;
  if (body.customerLocation) {
    const shop = await db.shop.findUnique({
      where: { id: body.shopId },
      select: { latitude: true, longitude: true },
    });
    if (shop) {
      const travel = await getMapsProvider().estimateTravel(body.customerLocation, shop, 'walking');
      customerEtaMinutes = travel.durationMinutes;
    }
  }

  const order = await placeOrder({
    customerId: user.id,
    shopId: body.shopId,
    lines: body.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      selections: item.selections,
    })),
    paymentMethod: body.paymentMethod,
    customerNote: body.customerNote,
    customerLocation: body.customerLocation,
    customerEtaMinutes,
  });

  return ok(
    {
      id: order.id,
      code: order.code,
      status: order.status,
      totalMinor: order.totalMinor,
      estimatedReadyAt: order.estimatedReadyAt,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
    },
    201,
  );
});
