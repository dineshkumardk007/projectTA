import { z } from 'zod';
import { db } from '@/lib/db';
import { DomainError, ok, route } from '@/lib/api';
import { requireShopAccess, requireUser } from '@/lib/auth/guards';

/**
 * Option groups for a product.
 *
 * One model covers customisation and add-ons — a required pick-one group and an
 * optional pick-many group differ only by min/max. The editor writes the whole
 * group and its options in one call, because a half-saved group (a group with no
 * options, or a required group whose only option was removed) would make the
 * product unorderable.
 */

const optionSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(60),
  priceDeltaMinor: z.number().int().min(-100_000).max(1_000_000).default(0),
  prepDeltaMinutes: z.number().int().min(0).max(60).default(0),
  isAvailable: z.boolean().default(true),
});

const groupSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    minSelect: z.number().int().min(0).max(10),
    maxSelect: z.number().int().min(1).max(10),
    options: z.array(optionSchema).min(1, 'Add at least one choice.').max(20),
  })
  .refine((group) => group.maxSelect >= group.minSelect, {
    message: 'The maximum must be at least the minimum.',
  })
  .refine((group) => group.options.length >= group.minSelect, {
    message: 'There are fewer choices than the minimum you require.',
  });

async function assertProductAccess(productId: string, userId?: string) {
  const user = await requireUser(['MERCHANT', 'STAFF', 'ADMIN']);
  void userId;

  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, shopId: true },
  });
  if (!product) throw new DomainError('That item could not be found.', 404);

  await requireShopAccess(product.shopId, user);
  return product;
}

export const POST = route(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const product = await assertProductAccess(id);
  const body = groupSchema.parse(await request.json());

  const existing = await db.productOptionGroup.count({ where: { productId: product.id } });

  const group = await db.productOptionGroup.create({
    data: {
      productId: product.id,
      name: body.name,
      minSelect: body.minSelect,
      maxSelect: body.maxSelect,
      sortOrder: existing,
      options: {
        create: body.options.map((option, index) => ({
          name: option.name,
          priceDeltaMinor: option.priceDeltaMinor,
          prepDeltaMinutes: option.prepDeltaMinutes,
          isAvailable: option.isAvailable,
          sortOrder: index,
        })),
      },
    },
    include: { options: true },
  });

  return ok({ id: group.id }, 201);
});
