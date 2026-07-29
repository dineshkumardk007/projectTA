import { z } from 'zod';
import { db } from '@/lib/db';
import { DomainError, ok, route } from '@/lib/api';
import { requireShopAccess, requireUser } from '@/lib/auth/guards';
import { shopLocalDate } from '@/lib/domain/local-date';
import { isPlatformImageUrl } from '@/lib/domain/image-url';
import { platformImageOrigins } from '@/lib/providers/storage';

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(300).nullable().optional(),
  /** Restricted to images this platform stored — see `domain/image-url`. */
  imageUrl: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .refine(
      (value) => isPlatformImageUrl(value, platformImageOrigins()),
      'Upload an image rather than linking to one.',
    ),
  priceMinor: z.number().int().min(0).max(10_000_00).optional(),
  prepMinutes: z.number().int().min(0).max(180).optional(),
  unitLabel: z.string().trim().max(40).optional(),
  availability: z.enum(['AVAILABLE', 'OUT_OF_STOCK', 'TEMPORARILY_UNAVAILABLE']).optional(),
  isPopular: z.boolean().optional(),
  /**
   * Today's special. The client sends a boolean; the server resolves it to the
   * shop's local date so the flag expires on its own overnight. Letting a client
   * post a date would let it pin a special indefinitely.
   */
  isTodaysSpecial: z.boolean().optional(),
  specialNote: z.string().trim().max(80).nullable().optional(),
});

/** Edit a product, including the one-tap availability and special toggles. */
export const PATCH = route(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const user = await requireUser(['MERCHANT', 'STAFF', 'ADMIN']);

  const product = await db.product.findUnique({
    where: { id },
    select: { id: true, shopId: true, shop: { select: { timeZone: true } } },
  });
  if (!product) throw new DomainError('That item could not be found.', 404);

  await requireShopAccess(product.shopId, user);

  const { isTodaysSpecial, ...fields } = patchSchema.parse(await request.json());

  const updated = await db.product.update({
    where: { id: product.id },
    data: {
      ...fields,
      ...(isTodaysSpecial === undefined
        ? {}
        : isTodaysSpecial
          ? { specialOn: shopLocalDate(product.shop.timeZone) }
          : { specialOn: '', specialNote: null }),
    },
  });

  return ok({
    id: updated.id,
    name: updated.name,
    priceMinor: updated.priceMinor,
    prepMinutes: updated.prepMinutes,
    availability: updated.availability,
    isPopular: updated.isPopular,
    isTodaysSpecial: updated.specialOn === shopLocalDate(product.shop.timeZone),
    specialNote: updated.specialNote,
  });
});

export const DELETE = route(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const user = await requireUser(['MERCHANT', 'ADMIN']);

  const product = await db.product.findUnique({ where: { id }, select: { id: true, shopId: true } });
  if (!product) throw new DomainError('That item could not be found.', 404);

  await requireShopAccess(product.shopId, user);

  // Order history keeps name/price snapshots, so removing a product never
  // rewrites what a customer was charged.
  await db.product.delete({ where: { id: product.id } });
  return ok({ deleted: true });
});
