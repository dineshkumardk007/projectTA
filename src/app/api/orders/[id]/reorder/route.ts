import { db } from '@/lib/db';
import { DomainError, ok, route } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';

/**
 * Rebuilds a cart from a past order.
 *
 * Prices, availability and option names are read fresh rather than replayed
 * from the old order — a customer reordering yesterday's tea should get today's
 * price, and anything no longer on the menu is reported rather than silently
 * dropped.
 */
export const POST = route(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const user = await requireUser(['CUSTOMER']);

  const order = await db.order.findUnique({
    where: { id },
    include: {
      shop: { select: { id: true, slug: true, name: true, isActive: true, isVerified: true } },
      items: true,
    },
  });

  if (!order) throw new DomainError('That order could not be found.', 404);
  if (order.customerId !== user.id) throw new DomainError('You do not have access to this order.', 403);
  if (!order.shop.isActive || !order.shop.isVerified) {
    throw new DomainError('That shop is no longer available.', 409);
  }

  /**
   * Resolve each historical line back to a live menu item.
   *
   * `productId` is the primary key to match on, but it is deliberately not the
   * only one: `OrderItem.productId` is `onDelete: SetNull`, so a merchant who
   * removes and re-adds an item — or rebuilds their menu — orphans every past
   * order that contained it. Matching the snapshotted name within the same shop
   * as a fallback keeps "order again" working across that, which is exactly the
   * case a daily regular would hit.
   */
  const products = await db.product.findMany({
    where: { shopId: order.shop.id },
    include: { optionGroups: { include: { options: true } } },
  });

  const byId = new Map(products.map((p) => [p.id, p]));
  // Name lookup is case-insensitive and prefers an available item, so a
  // duplicate name that is out of stock does not shadow one that is orderable.
  const byName = new Map<string, (typeof products)[number]>();
  for (const product of products) {
    const key = product.name.trim().toLowerCase();
    const existing = byName.get(key);
    if (!existing || (existing.availability !== 'AVAILABLE' && product.availability === 'AVAILABLE')) {
      byName.set(key, product);
    }
  }

  const items: {
    productId: string;
    name: string;
    unitPriceMinor: number;
    prepMinutes: number;
    quantity: number;
    selections: { groupId: string; groupName: string; optionIds: string[]; optionNames: string[] }[];
  }[] = [];
  const skipped: string[] = [];

  for (const item of order.items) {
    const product =
      (item.productId ? byId.get(item.productId) : undefined) ??
      byName.get(item.nameSnapshot.trim().toLowerCase());

    if (!product || product.availability !== 'AVAILABLE') {
      skipped.push(item.nameSnapshot);
      continue;
    }

    const previousOptions = (item.selectedOptions as { groupName: string; optionName: string }[] | null) ?? [];
    const selections: { groupId: string; groupName: string; optionIds: string[]; optionNames: string[] }[] = [];
    let unitPriceMinor = product.priceMinor;
    let prepMinutes = product.prepMinutes;
    let optionsIntact = true;

    for (const group of product.optionGroups) {
      const wanted = previousOptions.filter((o) => o.groupName === group.name).map((o) => o.optionName);
      const matched = group.options.filter((o) => wanted.includes(o.name) && o.isAvailable);

      if (matched.length < Math.min(wanted.length, group.maxSelect)) optionsIntact = false;

      // A group that is now required but whose old choice is gone falls back to
      // the first available option rather than producing an invalid cart.
      if (matched.length < group.minSelect) {
        const fallback = group.options.find((o) => o.isAvailable);
        if (!fallback) {
          optionsIntact = false;
          break;
        }
        matched.push(fallback);
      }

      if (matched.length === 0) continue;

      for (const option of matched) {
        unitPriceMinor += option.priceDeltaMinor;
        prepMinutes += option.prepDeltaMinutes;
      }

      selections.push({
        groupId: group.id,
        groupName: group.name,
        optionIds: matched.map((o) => o.id),
        optionNames: matched.map((o) => o.name),
      });
    }

    if (!optionsIntact && selections.length === 0) {
      skipped.push(item.nameSnapshot);
      continue;
    }

    items.push({
      productId: product.id,
      name: product.name,
      unitPriceMinor,
      prepMinutes,
      quantity: item.quantity,
      selections,
    });
  }

  if (items.length === 0) {
    throw new DomainError('Nothing from that order is available right now.', 409, 'nothing_available');
  }

  return ok({
    shop: { id: order.shop.id, slug: order.shop.slug, name: order.shop.name },
    items,
    skipped,
  });
});
