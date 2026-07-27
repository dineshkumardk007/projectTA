import { z } from 'zod';
import { db } from '@/lib/db';
import { DomainError, ok, route } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { haversineKm } from '@/lib/providers/maps';
import { notifyShopTeam } from '@/lib/services/notifications';

/**
 * "I'm here" — records when the customer actually reached the shop.
 *
 * This is what turns the platform's headline metric from an inference into a
 * measurement: without an arrival time we can only observe how long the food
 * sat, which is not the same as how long the customer waited.
 *
 * It also has immediate operational value — the counter can see who is standing
 * in front of them, and a shop that has not started yet knows to hurry.
 */
const schema = z.object({
  /** Present when the tap came from automatic geofence detection. */
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  automatic: z.boolean().default(false),
});

/** Beyond this the client is not close enough for an automatic arrival. */
const GEOFENCE_KM = 0.15;

export const POST = route(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const user = await requireUser(['CUSTOMER']);
  const body = schema.parse(await request.json().catch(() => ({})));

  const order = await db.order.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      status: true,
      customerId: true,
      shopId: true,
      customerArrivedAt: true,
      shop: { select: { latitude: true, longitude: true } },
    },
  });

  if (!order) throw new DomainError('That order could not be found.', 404);
  if (order.customerId !== user.id) throw new DomainError('You do not have access to this order.', 403);

  if (!['PLACED', 'ACCEPTED', 'PREPARING', 'READY'].includes(order.status)) {
    throw new DomainError('This order is already closed.', 409);
  }

  // Arrival is recorded once. A second tap is a no-op rather than an error, so
  // the button can stay tappable without punishing an impatient customer.
  if (order.customerArrivedAt) {
    return ok({ arrivedAt: order.customerArrivedAt, alreadyRecorded: true });
  }

  // An automatic report must actually be near the shop. A manual tap is taken at
  // face value — the customer is the authority on whether they are standing
  // there, and location may be switched off.
  if (body.automatic) {
    if (body.latitude == null || body.longitude == null) {
      throw new DomainError('Location is required for automatic arrival.', 422);
    }
    const distanceKm = haversineKm({ latitude: body.latitude, longitude: body.longitude }, order.shop);
    if (distanceKm > GEOFENCE_KM) {
      throw new DomainError('You do not appear to be at the shop yet.', 409, 'too_far');
    }
  }

  const arrivedAt = new Date();
  await db.order.update({ where: { id: order.id }, data: { customerArrivedAt: arrivedAt } });

  // Only worth interrupting the counter when the food is not out yet.
  if (order.status !== 'READY') {
    await notifyShopTeam(order.shopId, {
      orderId: order.id,
      type: 'SYSTEM',
      title: `Customer waiting for ${order.code}`,
      body: 'The customer has arrived and this order is not ready yet.',
      href: '/merchant/orders',
    });
  }

  return ok({ arrivedAt, alreadyRecorded: false });
});
