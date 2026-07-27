import 'server-only';
import crypto from 'node:crypto';
import { Prisma, type OrderStatus, type PaymentMethod, type PrismaClient } from '@prisma/client';
import { db } from '@/lib/db';
import { DomainError } from '@/lib/api';
import { ACTIVE_STATUSES, assertTransition, InvalidTransitionError } from '@/lib/domain/order-status';
import { estimatePrepMinutes } from '@/lib/domain/prep-time';
import { shopLocalDate } from '@/lib/domain/local-date';
import { amountDueOnline } from '@/lib/services/upi';
import { getOrderability } from '@/lib/domain/shop-availability';
import { notify, notifyShopTeam } from '@/lib/services/notifications';
import { resolveOrderSource } from '@/lib/services/attribution';
import { formatMinor } from '@/lib/domain/money';
import { formatClockTime } from '@/lib/domain/prep-time';

/**
 * Everything that mutates an order lives here.
 *
 * Two invariants this module owns:
 *   1. **Price is server-authoritative.** The client sends product ids and
 *      quantities; every rupee is recomputed from the database.
 *   2. **Status changes are serialised.** Transitions run inside a transaction
 *      that re-reads the current status, so concurrent taps from two staff
 *      phones cannot both succeed.
 */

type Tx = Prisma.TransactionClient | PrismaClient;

export type CartSelection = { groupId: string; optionIds: string[] };
export type CartLine = { productId: string; quantity: number; selections: CartSelection[] };

export type PricedOption = { groupName: string; optionName: string; priceDeltaMinor: number };

export type PricedLine = {
  productId: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  prepMinutes: number;
  options: PricedOption[];
};

export type PricedCart = {
  lines: PricedLine[];
  subtotalMinor: number;
  totalMinor: number;
  /** One entry per unit ordered — feeds the preparation estimator. */
  itemPrepMinutes: number[];
};

/**
 * Recomputes a cart from the database, rejecting anything a customer should not
 * be able to order. Used by both the checkout preview and order placement, so
 * the price quoted is by construction the price charged.
 */
export async function priceCart(shopId: string, lines: CartLine[], client: Tx = db): Promise<PricedCart> {
  if (lines.length === 0) throw new DomainError('Your cart is empty.', 422);

  const products = await client.product.findMany({
    where: { id: { in: lines.map((l) => l.productId) }, shopId },
    include: { optionGroups: { include: { options: true } } },
  });

  const byId = new Map(products.map((p) => [p.id, p]));
  const priced: PricedLine[] = [];
  const itemPrepMinutes: number[] = [];
  let subtotalMinor = 0;

  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product) {
      throw new DomainError('One of the items is no longer on this menu. Please review your cart.', 409, 'item_missing');
    }
    if (product.availability !== 'AVAILABLE') {
      throw new DomainError(`${product.name} is not available right now. Please remove it from your cart.`, 409, 'item_unavailable');
    }

    const chosen: PricedOption[] = [];
    let optionDeltaMinor = 0;
    let optionPrepDelta = 0;

    for (const group of product.optionGroups) {
      const selection = line.selections.find((s) => s.groupId === group.id);
      const optionIds = selection?.optionIds ?? [];

      if (optionIds.length < group.minSelect) {
        throw new DomainError(`Choose a ${group.name.toLowerCase()} for ${product.name}.`, 422, 'option_required');
      }
      if (optionIds.length > group.maxSelect) {
        throw new DomainError(
          `You can choose at most ${group.maxSelect} from ${group.name} for ${product.name}.`,
          422,
          'option_limit',
        );
      }

      for (const optionId of optionIds) {
        const option = group.options.find((o) => o.id === optionId);
        if (!option) throw new DomainError(`That choice is no longer available for ${product.name}.`, 409);
        if (!option.isAvailable) {
          throw new DomainError(`${option.name} is not available right now.`, 409, 'option_unavailable');
        }
        chosen.push({ groupName: group.name, optionName: option.name, priceDeltaMinor: option.priceDeltaMinor });
        optionDeltaMinor += option.priceDeltaMinor;
        optionPrepDelta += option.prepDeltaMinutes;
      }
    }

    // Reject selections pointing at groups that do not belong to this product.
    const validGroupIds = new Set(product.optionGroups.map((g) => g.id));
    if (line.selections.some((s) => s.optionIds.length > 0 && !validGroupIds.has(s.groupId))) {
      throw new DomainError('Those options do not belong to this item.', 422);
    }

    const unitPriceMinor = product.priceMinor + optionDeltaMinor;
    const lineTotalMinor = unitPriceMinor * line.quantity;
    const prepMinutes = product.prepMinutes + optionPrepDelta;

    subtotalMinor += lineTotalMinor;
    priced.push({
      productId: product.id,
      name: product.name,
      quantity: line.quantity,
      unitPriceMinor,
      lineTotalMinor,
      prepMinutes,
      options: chosen,
    });

    for (let i = 0; i < line.quantity; i += 1) itemPrepMinutes.push(prepMinutes);
  }

  // No platform fee or tax in the MVP — the total is the subtotal. Kept as a
  // separate field so adding one later does not change any call site.
  return { lines: priced, subtotalMinor, totalMinor: subtotalMinor, itemPrepMinutes };
}

export async function countActiveOrders(shopId: string, client: Tx = db): Promise<number> {
  return client.order.count({ where: { shopId, status: { in: ACTIVE_STATUSES } } });
}

/**
 * Human-readable, shop-scoped order code that resets daily ("A101", "A102", …).
 *
 * Allocated by a **single atomic UPDATE … RETURNING**, not a read followed by a
 * write. That distinction matters: PostgreSQL's default READ COMMITTED isolation
 * lets two concurrent transactions read the same `dailySequence`, derive the same
 * code, and race — one of them then dies on the `@@unique([shopId, code])`
 * constraint and the customer loses their order. Which is precisely what happens
 * during the 8am rush this product exists to serve.
 *
 * One statement takes a row lock for its duration, so concurrent callers queue
 * behind each other and each gets a distinct number.
 */
async function nextOrderCode(
  shopId: string,
  timeZone: string,
  tx: Prisma.TransactionClient,
): Promise<{ code: string; codeDate: string }> {
  const codeDate = shopLocalDate(timeZone);

  const rows = await tx.$queryRaw<{ dailySequence: number; orderCodePrefix: string }[]>`
    UPDATE "Shop"
       SET "dailySequence" = CASE WHEN "dailySequenceOn" = ${codeDate} THEN "dailySequence" + 1 ELSE 101 END,
           "dailySequenceOn" = ${codeDate}
     WHERE "id" = ${shopId}
    RETURNING "dailySequence", "orderCodePrefix"
  `;

  const row = rows[0];
  if (!row) throw new DomainError('That shop could not be found.', 404);

  return { code: `${row.orderCodePrefix}${row.dailySequence}`, codeDate };
}


/** Six characters, no ambiguous glyphs — this gets read aloud at a noisy counter. */
function generatePickupCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(6))
    .map((byte) => alphabet[byte % alphabet.length])
    .join('');
}

export type PlaceOrderInput = {
  customerId: string;
  shopId: string;
  lines: CartLine[];
  paymentMethod: PaymentMethod;
  customerNote?: string;
  customerLocation?: { latitude: number; longitude: number };
  customerEtaMinutes?: number | null;
  isCustomList?: boolean;
  customListText?: string;
  slipImageUrl?: string;
};

export async function placeOrder(input: PlaceOrderInput) {
  const source = await resolveOrderSource(input.shopId);

  const shop = await db.shop.findUnique({
    where: { id: input.shopId },
    include: { operatingHours: true },
  });
  if (!shop) throw new DomainError('That shop could not be found.', 404);

  const isCustomList = Boolean(input.isCustomList);
  if (isCustomList && !shop.allowCustomList) {
    throw new DomainError('This shop does not accept custom list orders.', 400, 'custom_list_disabled');
  }

  const activeOrders = await countActiveOrders(shop.id);
  const orderability = getOrderability({
    status: shop.status,
    isActive: shop.isActive,
    isVerified: shop.isVerified,
    hours: shop.operatingHours,
    atCapacity: shop.maxActiveOrders > 0 && activeOrders >= shop.maxActiveOrders,
  });

  if (!orderability.canOrder) {
    throw new DomainError(orderability.reason ?? 'This shop is not accepting orders right now.', 409, 'shop_unavailable');
  }

  if (input.paymentMethod === 'CASH_ON_PICKUP' && !shop.acceptsCashOnPickup) {
    throw new DomainError('This shop requires payment before preparation.', 422, 'payment_method');
  }

  // Fraud guard. A customer with repeated uncollected cash orders may still
  // order — they just have to pay first, so the shop is not left holding cooked
  // food nobody comes for. The message says what to do next and does not accuse
  // anyone of anything.
  if (input.paymentMethod === 'CASH_ON_PICKUP') {
    const profile = await db.customerProfile.findUnique({
      where: { userId: input.customerId },
      select: { isCashOnPickupBlocked: true },
    });
    if (profile?.isCashOnPickupBlocked) {
      throw new DomainError(
        'Please pay online for this order. Contact support if you think this is a mistake.',
        403,
        'cash_on_pickup_blocked',
      );
    }
  }
  if (input.paymentMethod === 'ONLINE' && !shop.acceptsOnlinePayment) {
    throw new DomainError('This shop does not accept online payment yet.', 422, 'payment_method');
  }
  if (['UPI_FULL', 'UPI_DEPOSIT'].includes(input.paymentMethod) && !shop.upiId) {
    throw new DomainError('This shop has not set up UPI payment yet.', 422, 'upi_not_configured');
  }
  if (input.paymentMethod === 'UPI_DEPOSIT' && !shop.allowUpiDeposit) {
    throw new DomainError('This shop requires the full amount up front.', 422, 'payment_method');
  }

  const cart = isCustomList
    ? { lines: [], subtotalMinor: 0, totalMinor: 0, itemPrepMinutes: [shop.basePrepMinutes] }
    : await priceCart(shop.id, input.lines);

  const estimate = estimatePrepMinutes({
    itemPrepMinutes: cart.itemPrepMinutes,
    basePrepMinutes: shop.basePrepMinutes,
    activeOrderCount: activeOrders,
    status: shop.status,
  });

  const estimatedReadyAt = new Date(Date.now() + estimate.minutes * 60_000);

  const order = await db.$transaction(async (tx) => {
    const { code, codeDate } = await nextOrderCode(shop.id, shop.timeZone, tx);

    const created = await tx.order.create({
      data: {
        code,
        codeDate,
        customerId: input.customerId,
        shopId: shop.id,
        status: 'PLACED',
        source,
        subtotalMinor: cart.subtotalMinor,
        totalMinor: cart.totalMinor,
        isCustomList,
        customListText: isCustomList ? (input.customListText ?? null) : null,
        slipImageUrl: isCustomList ? (input.slipImageUrl ?? null) : null,
        paymentMethod: input.paymentMethod,
        // Cash orders need no payment record until pickup; everything else starts
        // PENDING and is only prepared once payment is established.
        paymentStatus: input.paymentMethod === 'CASH_ON_PICKUP' ? 'NOT_REQUIRED' : 'PENDING',
        // Computed from the shop's own deposit percentage, never from the
        // client — otherwise a customer could nominate their own deposit.
        amountDueOnlineMinor: amountDueOnline(input.paymentMethod, cart.totalMinor, shop),
        promisedPrepMinutes: estimate.minutes,
        estimatedReadyAt,
        customerEtaMinutes: input.customerEtaMinutes ?? null,
        customerLatitude: input.customerLocation?.latitude ?? null,
        customerLongitude: input.customerLocation?.longitude ?? null,
        baselineWaitMinutes: shop.baselineWaitMinutes,
        customerNote: input.customerNote,
        pickupCode: generatePickupCode(),
        items: {
          create: cart.lines.map((line) => ({
            productId: line.productId,
            nameSnapshot: line.name,
            unitPriceMinor: line.unitPriceMinor,
            quantity: line.quantity,
            lineTotalMinor: line.lineTotalMinor,
            prepMinutes: line.prepMinutes,
            selectedOptions: line.options as unknown as Prisma.InputJsonValue,
          })),
        },
        statusEvents: {
          create: { toStatus: 'PLACED', actorUserId: input.customerId, note: 'Order placed' },
        },
      },
      include: { items: true, shop: { select: { name: true, slug: true } } },
    });

    await tx.customerProfile.updateMany({
      where: { userId: input.customerId },
      data: { ordersPlaced: { increment: 1 } },
    });

    return created;
  });

  await notify({
    userId: input.customerId,
    orderId: order.id,
    type: 'ORDER_PLACED',
    title: `Order ${order.code} placed`,
    body: `${order.shop.name} will confirm shortly. Estimated ready by ${formatClockTime(estimatedReadyAt)}.`,
    href: `/orders/${order.id}`,
  });

  await notifyShopTeam(shop.id, {
    orderId: order.id,
    type: 'NEW_ORDER_FOR_SHOP',
    title: `New order ${order.code}`,
    body: `${order.items.length} item(s) · ${formatMinor(order.totalMinor)}`,
    href: '/merchant/orders',
  });

  return order;
}

export type TransitionInput = {
  orderId: string;
  to: OrderStatus;
  actor: 'CUSTOMER' | 'SHOP' | 'SYSTEM';
  actorUserId?: string;
  note?: string;
  finalTotalMinor?: number;
  /** Set on READY→PICKED_UP. */
  verificationMethod?: 'QR' | 'ORDER_CODE' | 'MANUAL';
};

const TIMESTAMP_FIELD: Partial<Record<OrderStatus, 'acceptedAt' | 'preparingAt' | 'readyAt' | 'pickedUpAt'>> = {
  ACCEPTED: 'acceptedAt',
  PREPARING: 'preparingAt',
  READY: 'readyAt',
  PICKED_UP: 'pickedUpAt',
};

/**
 * Moves an order to a new status, or fails loudly.
 *
 * The read-and-write happen in one transaction so the "is this transition
 * legal?" check cannot be invalidated between checking and writing.
 */
export async function transitionOrder(input: TransitionInput) {
  const result = await db.$transaction(async (tx) => {
    const current = await tx.order.findUnique({
      where: { id: input.orderId },
      select: {
        id: true,
        code: true,
        status: true,
        customerId: true,
        shopId: true,
        placedAt: true,
        readyAt: true,
        baselineWaitMinutes: true,
        customerArrivedAt: true,
        estimatedReadyAt: true,
        preparingAt: true,
        acceptedAt: true,
        paymentMethod: true,
        paymentStatus: true,
        totalMinor: true,
        amountPaidMinor: true,
        shop: { select: { name: true } },
      },
    });
    if (!current) throw new DomainError('That order could not be found.', 404);

    try {
      assertTransition(current.status, input.to, input.actor);
    } catch (error) {
      if (error instanceof InvalidTransitionError) {
        throw new DomainError(error.message, 409, 'invalid_transition');
      }
      throw error;
    }

    // An online order must be paid before the shop commits kitchen time to it.
    if (input.to === 'ACCEPTED' && current.paymentMethod === 'ONLINE' && current.paymentStatus !== 'PAID') {
      throw new DomainError('This order has not been paid yet. Wait for payment to complete.', 409, 'unpaid');
    }

    // UPI is uncheckable by machine, so the gate is a human at the shop having
    // confirmed the money. AWAITING_VERIFICATION explicitly does not count —
    // that is only the customer's word.
    if (
      input.to === 'ACCEPTED' &&
      ['UPI_FULL', 'UPI_DEPOSIT'].includes(current.paymentMethod) &&
      !['PAID', 'PARTIALLY_PAID'].includes(current.paymentStatus)
    ) {
      throw new DomainError(
        current.paymentStatus === 'AWAITING_VERIFICATION'
          ? 'Confirm you have received this UPI payment before accepting the order.'
          : 'This order has not been paid yet.',
        409,
        'unpaid',
      );
    }

    const now = new Date();
    const data: Prisma.OrderUpdateInput = { status: input.to };

    if (input.finalTotalMinor != null && input.finalTotalMinor >= 0) {
      data.subtotalMinor = input.finalTotalMinor;
      data.totalMinor = input.finalTotalMinor;
    }

    const timestampField = TIMESTAMP_FIELD[input.to];
    if (timestampField) data[timestampField] = now;

    if (input.to === 'REJECTED') data.rejectionReason = input.note;
    if (input.to === 'CANCELLED') data.cancellationReason = input.note;

    if (input.to === 'READY') {
      const startedAt = current.preparingAt ?? current.acceptedAt ?? current.placedAt;
      data.actualPrepMinutes = Math.max(1, Math.round((now.getTime() - startedAt.getTime()) / 60_000));
    }

    if (input.to === 'PICKED_UP') {
      data.verifiedAt = now;
      data.verificationMethod = input.verificationMethod ?? 'MANUAL';
      data.closedAt = now;

      // The north-star metric.
      //
      // What we are claiming is "the customer did not stand in a queue", so the
      // quantity that matters is how long *the customer* waited — from reaching
      // the shop to walking away with the order. That needs an arrival time.
      //
      // Without one, the only available proxy is how long the food sat between
      // READY and collection, which measures the wrong thing in both directions:
      // a customer who turns up ten minutes late looks like they queued for ten
      // minutes, and one who arrives early and waits looks like they waited not
      // at all. The proxy is still recorded so no order is dropped from the
      // numbers, but `waitMeasured` marks which figures are real, and the admin
      // dashboard reports the two separately.
      const measured = current.customerArrivedAt != null;
      const waitedFrom = current.customerArrivedAt ?? current.readyAt ?? now;
      const waitedMinutes = Math.max(0, Math.round((now.getTime() - waitedFrom.getTime()) / 60_000));

      data.waitMeasured = measured;
      data.waitMinutesSaved = Math.max(
        0,
        current.baselineWaitMinutes - Math.min(waitedMinutes, current.baselineWaitMinutes),
      );

      // Whatever was not settled online is collected in cash at the counter, so
      // handing the order over is the moment the order becomes fully paid. This
      // covers a plain cash order and the balance left on a UPI deposit alike.
      if (current.paymentMethod === 'CASH_ON_PICKUP' || current.paymentStatus === 'PARTIALLY_PAID') {
        data.paymentStatus = 'PAID';
        data.amountPaidMinor = current.totalMinor;
      }
    }

    if (['REJECTED', 'CANCELLED', 'EXPIRED'].includes(input.to)) {
      data.closedAt = now;
    }

    const updated = await tx.order.update({
      where: { id: current.id },
      data: {
        ...data,
        statusEvents: {
          create: {
            fromStatus: current.status,
            toStatus: input.to,
            actorUserId: input.actorUserId,
            note: input.note,
          },
        },
      },
      include: { shop: { select: { name: true } } },
    });

    // Reliability counters, used later to decide who may pay cash on pickup.
    if (input.to === 'PICKED_UP') {
      await tx.customerProfile.updateMany({
        where: { userId: current.customerId },
        data: { ordersCompleted: { increment: 1 } },
      });
    } else if (input.to === 'CANCELLED') {
      await tx.customerProfile.updateMany({
        where: { userId: current.customerId },
        data: { ordersCancelled: { increment: 1 } },
      });
    } else if (input.to === 'EXPIRED') {
      await tx.customerProfile.updateMany({
        where: { userId: current.customerId },
        data: { ordersAbandoned: { increment: 1 } },
      });
    }

    return updated;
  });

  // A shop that rejects or cancels a prepaid order must not keep the money.
  // Done after the transaction because it calls an external provider — a slow
  // gateway must not hold a database transaction open.
  if (['REJECTED', 'CANCELLED'].includes(result.status) && result.paymentStatus === 'PAID') {
    try {
      const { refundOrder } = await import('@/lib/services/refunds');
      await refundOrder(result.id, { reason: input.note ?? `Order ${result.status.toLowerCase()}` });
    } catch (error) {
      // The order is already correctly closed; a failed refund is an operational
      // problem to chase, not a reason to leave the order in limbo.
      console.error('[orders] automatic refund failed', error);
    }
  }

  await sendTransitionNotification(result.id, result.code, result.status, result.customerId, result.shop.name, input.note);
  return result;
}

async function sendTransitionNotification(
  orderId: string,
  code: string,
  status: OrderStatus,
  customerId: string,
  shopName: string,
  note?: string,
) {
  const href = `/orders/${orderId}`;

  const messages: Partial<Record<OrderStatus, { type: Parameters<typeof notify>[0]['type']; title: string; body: string }>> = {
    ACCEPTED: {
      type: 'ORDER_ACCEPTED',
      title: `${shopName} accepted order ${code}`,
      body: 'Your order is confirmed. We will tell you the moment it is ready.',
    },
    PREPARING: {
      type: 'ORDER_PREPARING',
      title: `Order ${code} is being prepared`,
      body: 'Good time to start heading over.',
    },
    READY: {
      type: 'ORDER_READY',
      title: `Order ${code} is ready`,
      body: `Collect it at ${shopName}. Show your QR code or order number at the counter.`,
    },
    PICKED_UP: {
      type: 'ORDER_PICKED_UP',
      title: `Order ${code} collected`,
      body: 'Thanks for ordering ahead. See you next time.',
    },
    REJECTED: {
      type: 'ORDER_REJECTED',
      title: `${shopName} could not take order ${code}`,
      body: note ?? 'The shop could not accept this order. Any payment will be refunded.',
    },
    CANCELLED: {
      type: 'ORDER_CANCELLED',
      title: `Order ${code} cancelled`,
      body: note ?? 'This order has been cancelled.',
    },
    EXPIRED: {
      type: 'ORDER_CANCELLED',
      title: `Order ${code} expired`,
      body: 'This order was not collected and has been closed.',
    },
  };

  const message = messages[status];
  if (message) {
    await notify({ userId: customerId, orderId, ...message, href });
  }
}

/**
 * Merchant-reported delay (section 58). Pushes the promised time back and tells
 * the customer honestly rather than letting the estimate quietly go stale.
 */
export async function delayOrder(orderId: string, extraMinutes: number, actorUserId: string) {
  if (extraMinutes < 1 || extraMinutes > 120) {
    throw new DomainError('Enter a delay between 1 and 120 minutes.', 422);
  }

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, code: true, status: true, customerId: true, estimatedReadyAt: true, promisedPrepMinutes: true },
  });
  if (!order) throw new DomainError('That order could not be found.', 404);
  if (!['PLACED', 'ACCEPTED', 'PREPARING'].includes(order.status)) {
    throw new DomainError('This order can no longer be delayed.', 409);
  }

  const updatedReadyAt = new Date(order.estimatedReadyAt.getTime() + extraMinutes * 60_000);

  const updated = await db.order.update({
    where: { id: order.id },
    data: {
      estimatedReadyAt: updatedReadyAt,
      promisedPrepMinutes: order.promisedPrepMinutes + extraMinutes,
      statusEvents: {
        create: {
          fromStatus: order.status,
          toStatus: order.status,
          actorUserId,
          note: `Delayed by ${extraMinutes} min`,
        },
      },
    },
  });

  await notify({
    userId: order.customerId,
    orderId: order.id,
    type: 'ORDER_DELAYED',
    title: `Order ${order.code} is running late`,
    body: `Delayed by about ${extraMinutes} min. Updated ready time: ${formatClockTime(updatedReadyAt)}.`,
    href: `/orders/${order.id}`,
  });

  return updated;
}

/**
 * Queue position — "2 orders are ahead of you".
 *
 * Only a count is ever exposed; nothing about who the other customers are.
 */
export async function queuePosition(shopId: string, placedAt: Date): Promise<number> {
  return db.order.count({
    where: { shopId, status: { in: ACTIVE_STATUSES }, placedAt: { lt: placedAt } },
  });
}
