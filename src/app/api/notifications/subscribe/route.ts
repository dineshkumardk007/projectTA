import { z } from 'zod';
import { db } from '@/lib/db';
import { ok, route } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});

export const POST = route(async (request: Request) => {
  const user = await requireUser();
  const body = subscribeSchema.parse(await request.json());

  await db.pushSubscription.upsert({
    where: { endpoint: body.endpoint },
    // A shared device can move between accounts; re-point the subscription
    // rather than leaving it delivering to the previous user.
    update: { userId: user.id, p256dh: body.p256dh, auth: body.auth },
    create: { userId: user.id, endpoint: body.endpoint, p256dh: body.p256dh, auth: body.auth },
  });

  return ok({ subscribed: true });
});

export const DELETE = route(async (request: Request) => {
  const user = await requireUser();
  const { endpoint } = z.object({ endpoint: z.string().url() }).parse(await request.json());

  await db.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
  return ok({ subscribed: false });
});
