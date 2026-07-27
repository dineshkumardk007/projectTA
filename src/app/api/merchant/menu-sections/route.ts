import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { DomainError, ok, route } from '@/lib/api';
import { requireShopAccess, requireUser } from '@/lib/auth/guards';

const createSchema = z.object({
  shopId: z.string().min(1),
  name: z.string().trim().min(1).max(40),
});

/** Menu sections ("Popular", "Tea", "Snacks") for a shop. */
export const POST = route(async (request: Request) => {
  const user = await requireUser(['MERCHANT', 'STAFF', 'ADMIN']);
  const body = createSchema.parse(await request.json());

  await requireShopAccess(body.shopId, user);

  const existing = await db.menuCategory.count({ where: { shopId: body.shopId } });

  try {
    const section = await db.menuCategory.create({
      data: { shopId: body.shopId, name: body.name, sortOrder: existing },
    });
    return ok({ id: section.id, name: section.name }, 201);
  } catch (error) {
    // @@unique([shopId, name]) — a friendlier message than a 500.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new DomainError('You already have a section with that name.', 409, 'duplicate');
    }
    throw error;
  }
});
