import { db } from '@/lib/db';
import { ok, route } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';

export const POST = route(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const user = await requireUser(['CUSTOMER']);

  await db.favoriteShop.upsert({
    where: { userId_shopId: { userId: user.id, shopId: id } },
    update: {},
    create: { userId: user.id, shopId: id },
  });

  return ok({ favorite: true });
});

export const DELETE = route(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const user = await requireUser(['CUSTOMER']);

  await db.favoriteShop.deleteMany({ where: { userId: user.id, shopId: id } });
  return ok({ favorite: false });
});
