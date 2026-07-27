import { z } from 'zod';
import { db } from '@/lib/db';
import { DomainError, clientKey, ok, rateLimit, route } from '@/lib/api';
import { requireShopAccess, requireUser } from '@/lib/auth/guards';
import { parsePickupToken } from '@/lib/services/pickup';

/**
 * Pickup verification — the counter's lookup step.
 *
 * Three ways in, one authorisation model:
 *   • `token`     — scanned from the customer's QR (signed, unforgeable)
 *   • `code`      — the order number read off a screen or spoken aloud
 *   • `pickupCode`— the six-character fallback when the phone is dead
 *
 * Every path is scoped to a shop the caller actually works at, and code lookups
 * are rate limited so the endpoint cannot be used to enumerate live orders.
 *
 * This only *finds and validates* the order. Marking it collected is a separate
 * explicit action, so a mis-scan never silently closes someone's order.
 */
const schema = z
  .object({
    shopId: z.string().min(1),
    token: z.string().min(1).optional(),
    code: z.string().trim().min(1).max(12).optional(),
    pickupCode: z.string().trim().min(4).max(12).optional(),
  })
  .refine((value) => value.token || value.code || value.pickupCode, {
    message: 'Scan a QR code or enter an order number.',
  });

export const POST = route(async (request: Request) => {
  const user = await requireUser(['MERCHANT', 'STAFF', 'ADMIN']);
  const body = schema.parse(await request.json());

  await requireShopAccess(body.shopId, user);
  rateLimit(clientKey(request, `pickup:${body.shopId}`), 60, 60_000);

  let orderId: string | null = null;
  let method: 'QR' | 'ORDER_CODE' | 'MANUAL' = 'MANUAL';

  if (body.token) {
    const parsed = parsePickupToken(body.token);
    if (!parsed) throw new DomainError('That QR code is not valid for Takeaway.', 422, 'bad_token');

    // The signature proves the token was issued by us; the pickup code must
    // still match the order it claims, so an old token cannot be replayed onto
    // a different order.
    const order = await db.order.findFirst({
      where: { id: parsed.orderId, pickupCode: parsed.pickupCode, shopId: body.shopId },
      select: { id: true },
    });
    if (!order) throw new DomainError('That code does not match an order at this shop.', 404, 'not_found');

    orderId = order.id;
    method = 'QR';
  } else if (body.code) {
    const order = await db.order.findFirst({
      where: { shopId: body.shopId, code: { equals: body.code.toUpperCase(), mode: 'insensitive' } },
      orderBy: { placedAt: 'desc' },
      select: { id: true },
    });
    if (!order) throw new DomainError(`No order ${body.code.toUpperCase()} at this shop today.`, 404, 'not_found');

    orderId = order.id;
    method = 'ORDER_CODE';
  } else if (body.pickupCode) {
    const order = await db.order.findFirst({
      where: { shopId: body.shopId, pickupCode: body.pickupCode.toUpperCase() },
      select: { id: true },
    });
    if (!order) throw new DomainError('That pickup code does not match an order at this shop.', 404, 'not_found');

    orderId = order.id;
    method = 'MANUAL';
  }

  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId! },
    include: {
      items: { select: { id: true, nameSnapshot: true, quantity: true, selectedOptions: true } },
      customer: { select: { name: true, phone: true } },
    },
  });

  return ok({
    method,
    order: {
      id: order.id,
      code: order.code,
      status: order.status,
      totalMinor: order.totalMinor,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      customerName: order.customer.name,
      customerPhone: order.customer.phone,
      // Told plainly, because "already picked up" and "not ready yet" need very
      // different responses at a counter.
      collectable: order.status === 'READY',
      hint:
        order.status === 'READY'
          ? 'Ready to hand over.'
          : order.status === 'PICKED_UP'
            ? 'This order has already been collected.'
            : `This order is ${order.status.toLowerCase().replace('_', ' ')} — it is not ready to hand over yet.`,
      items: order.items.map((item) => ({
        id: item.id,
        name: item.nameSnapshot,
        quantity: item.quantity,
        options: (item.selectedOptions as { optionName: string }[] | null) ?? [],
      })),
    },
  });
});
