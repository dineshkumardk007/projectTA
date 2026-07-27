import { z } from 'zod';
import { db } from '@/lib/db';
import { ok, route } from '@/lib/api';
import { requireShopAccess, requireUser } from '@/lib/auth/guards';

const createSchema = z.object({
  shopId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).optional(),
  priceMinor: z.number().int().min(0).max(10_000_00),
  prepMinutes: z.number().int().min(0).max(180),
  unitLabel: z.string().trim().max(40).optional(),
  menuCategoryId: z.string().min(1).nullable().optional(),
  isPopular: z.boolean().optional(),
});

export const POST = route(async (request: Request) => {
  const user = await requireUser(['MERCHANT', 'STAFF', 'ADMIN']);
  const body = createSchema.parse(await request.json());

  await requireShopAccess(body.shopId, user);

  // A menu section from another shop must never be attachable to this product.
  let menuCategoryId: string | null = null;
  if (body.menuCategoryId) {
    const section = await db.menuCategory.findFirst({
      where: { id: body.menuCategoryId, shopId: body.shopId },
      select: { id: true },
    });
    menuCategoryId = section?.id ?? null;
  }

  const product = await db.product.create({
    data: {
      shopId: body.shopId,
      name: body.name,
      description: body.description,
      priceMinor: body.priceMinor,
      prepMinutes: body.prepMinutes,
      unitLabel: body.unitLabel ?? '',
      menuCategoryId,
      isPopular: body.isPopular ?? false,
    },
  });

  return ok({ id: product.id }, 201);
});
