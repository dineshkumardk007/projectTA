import { z } from 'zod';
import { db } from '@/lib/db';
import { DomainError, ok, route } from '@/lib/api';
import { requireShopAccess, requireUser } from '@/lib/auth/guards';

const optionSchema = z.object({
  name: z.string().trim().min(1).max(60),
  priceDeltaMinor: z.number().int().min(-100_000).max(1_000_000).default(0),
  prepDeltaMinutes: z.number().int().min(0).max(60).default(0),
  isAvailable: z.boolean().default(true),
});

const patchSchema = z
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

async function loadGroup(groupId: string) {
  const user = await requireUser(['MERCHANT', 'STAFF', 'ADMIN']);

  const group = await db.productOptionGroup.findUnique({
    where: { id: groupId },
    select: { id: true, product: { select: { shopId: true } } },
  });
  if (!group) throw new DomainError('That option group could not be found.', 404);

  await requireShopAccess(group.product.shopId, user);
  return group;
}

/**
 * Replaces a group's options wholesale.
 *
 * Options are rewritten rather than diffed because order items snapshot the
 * option name and price at the time of ordering, so replacing rows cannot
 * rewrite anyone's order history.
 */
export const PATCH = route(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const group = await loadGroup(id);
  const body = patchSchema.parse(await request.json());

  await db.$transaction([
    db.productOption.deleteMany({ where: { groupId: group.id } }),
    db.productOptionGroup.update({
      where: { id: group.id },
      data: {
        name: body.name,
        minSelect: body.minSelect,
        maxSelect: body.maxSelect,
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
    }),
  ]);

  return ok({ id: group.id });
});

export const DELETE = route(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const group = await loadGroup(id);

  await db.productOptionGroup.delete({ where: { id: group.id } });
  return ok({ deleted: true });
});
