import 'server-only';
import type { PaymentMethod } from '@prisma/client';
import { db } from '@/lib/db';
import { DomainError } from '@/lib/api';
import { buildUpiAppLinks, buildUpiUri, depositForTotal, isValidUpiId, normaliseUpiReference } from '@/lib/domain/upi';
import { notify, notifyShopTeam } from '@/lib/services/notifications';
import { formatMinor } from '@/lib/domain/money';
import QRCode from 'qrcode';

/**
 * Direct UPI collection.
 *
 * Money moves from the customer's UPI app straight into the shop's account. The
 * platform is not in the flow at all — it holds no funds, charges no commission
 * and needs no gateway onboarding.
 *
 * The cost of that is the absence of any callback. Nothing tells this server
 * that a payment happened, so the flow is deliberately built around that gap
 * rather than papering over it:
 *
 *   1. Customer opens the deep link and pays in their own app.
 *   2. Customer types the UPI reference back into the site. This records a
 *      *claim* — status becomes AWAITING_VERIFICATION, never PAID.
 *   3. Someone at the shop sees the claim, checks their own UPI app, and
 *      confirms. Only that marks money as received.
 *
 * Step 3 is not optional and cannot be skipped by the client. Treating step 2
 * as payment would let anyone type twelve digits and collect free food.
 */

/** Everything the client needs to render the pay screen. */
export type UpiPaymentIntent = {
  amountMinor: number;
  /** Full order value, so the UI can show what is left to pay at the counter. */
  totalMinor: number;
  balanceAtCounterMinor: number;
  payeeName: string;
  upiId: string;
  uri: string;
  appLinks: { app: string; label: string; href: string }[];
  qrDataUrl: string;
  note: string;
};

function resolvePayee(shop: { name: string; upiId: string | null; upiPayeeName: string | null }) {
  if (!shop.upiId || !isValidUpiId(shop.upiId)) {
    throw new DomainError('This shop has not set up UPI payment yet.', 409, 'upi_not_configured');
  }
  return { upiId: shop.upiId.trim(), payeeName: (shop.upiPayeeName || shop.name).trim() };
}

/**
 * How much a given payment method expects up front.
 *
 * Computed server-side from the shop's own deposit percentage — a client that
 * asks to pay ₹1 towards a ₹500 order must not be able to.
 */
export function amountDueOnline(
  method: PaymentMethod,
  totalMinor: number,
  shop: { upiDepositPercent: number },
): number {
  if (method === 'UPI_FULL') return totalMinor;
  if (method === 'UPI_DEPOSIT') return depositForTotal(totalMinor, shop.upiDepositPercent);
  return 0;
}

/** Builds the pay screen for an order that owes money online. */
export async function buildOrderUpiIntent(orderId: string, customerId: string): Promise<UpiPaymentIntent> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      code: true,
      customerId: true,
      status: true,
      totalMinor: true,
      amountDueOnlineMinor: true,
      amountPaidMinor: true,
      paymentMethod: true,
      paymentStatus: true,
      shop: { select: { name: true, upiId: true, upiPayeeName: true } },
    },
  });

  if (!order) throw new DomainError('That order could not be found.', 404);
  if (order.customerId !== customerId) throw new DomainError('You do not have access to this order.', 403);
  if (!['UPI_FULL', 'UPI_DEPOSIT'].includes(order.paymentMethod)) {
    throw new DomainError('This order is not being paid by UPI.', 409);
  }
  if (['CANCELLED', 'REJECTED', 'EXPIRED'].includes(order.status)) {
    throw new DomainError('This order is closed.', 409);
  }

  const outstanding = order.amountDueOnlineMinor - order.amountPaidMinor;
  if (outstanding <= 0) {
    throw new DomainError('Nothing is outstanding on this order.', 409, 'already_paid');
  }

  const { upiId, payeeName } = resolvePayee(order.shop);
  const note = `Order ${order.code}`;

  const linkInput = { upiId, payeeName, amountMinor: outstanding, note, reference: order.code };
  const uri = buildUpiUri(linkInput);

  return {
    amountMinor: outstanding,
    totalMinor: order.totalMinor,
    balanceAtCounterMinor: Math.max(0, order.totalMinor - order.amountDueOnlineMinor),
    payeeName,
    upiId,
    uri,
    appLinks: buildUpiAppLinks(linkInput),
    // Desktop browsers cannot open a `upi://` link at all, so the QR is the
    // only route there — scan it with the phone that has the UPI app.
    qrDataUrl: await QRCode.toDataURL(uri, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 512,
      color: { dark: '#0f172a', light: '#ffffff' },
    }),
    note,
  };
}

/**
 * Records the customer's claim that they have paid.
 *
 * This never marks an order PAID. It moves it to AWAITING_VERIFICATION and
 * tells the shop there is something to check.
 */
export async function submitUpiReference(orderId: string, customerId: string, reference: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      code: true,
      customerId: true,
      shopId: true,
      totalMinor: true,
      amountDueOnlineMinor: true,
      amountPaidMinor: true,
      paymentMethod: true,
      paymentStatus: true,
    },
  });

  if (!order) throw new DomainError('That order could not be found.', 404);
  if (order.customerId !== customerId) throw new DomainError('You do not have access to this order.', 403);
  if (order.paymentStatus === 'PAID') {
    throw new DomainError('This order is already paid in full.', 409, 'already_paid');
  }

  const outstanding = order.amountDueOnlineMinor - order.amountPaidMinor;
  if (outstanding <= 0) throw new DomainError('Nothing is outstanding on this order.', 409, 'already_paid');

  const normalised = normaliseUpiReference(reference);

  // The same reference twice on one order is a double-submit, not a second
  // payment — treat it as idempotent rather than stacking duplicate claims.
  const existing = await db.payment.findFirst({
    where: { orderId: order.id, customerReference: normalised },
    select: { id: true },
  });
  if (existing) {
    return { alreadySubmitted: true, paymentId: existing.id };
  }

  const payment = await db.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: {
        orderId: order.id,
        provider: 'upi',
        method: order.paymentMethod,
        amountMinor: outstanding,
        status: 'AWAITING_VERIFICATION',
        customerReference: normalised,
      },
    });

    await tx.order.update({
      where: { id: order.id },
      data: { paymentStatus: 'AWAITING_VERIFICATION' },
    });

    return created;
  });

  await notifyShopTeam(order.shopId, {
    orderId: order.id,
    type: 'SYSTEM',
    title: `Check payment for order ${order.code}`,
    body: `Customer says they paid ${formatMinor(outstanding)} by UPI (ref ${normalised}). Confirm it in your UPI app.`,
    href: '/merchant/orders',
  });

  return { alreadySubmitted: false, paymentId: payment.id };
}

/**
 * The shop confirming money actually arrived. The only path to PAID for UPI.
 *
 * Splits into PARTIALLY_PAID when a deposit clears but the counter balance is
 * still outstanding, so the merchant screen can keep showing what to collect.
 */
export async function confirmUpiPayment(input: {
  orderId: string;
  paymentId?: string;
  actorUserId: string;
  received: boolean;
  note?: string;
}) {
  const order = await db.order.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      code: true,
      customerId: true,
      totalMinor: true,
      amountDueOnlineMinor: true,
      amountPaidMinor: true,
      paymentMethod: true,
      paymentStatus: true,
      shop: { select: { name: true } },
      payments: {
        where: { status: 'AWAITING_VERIFICATION' },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!order) throw new DomainError('That order could not be found.', 404);

  const payment = input.paymentId
    ? order.payments.find((p) => p.id === input.paymentId)
    : order.payments[0];

  if (!payment) {
    throw new DomainError('There is no payment awaiting confirmation on this order.', 409, 'nothing_to_confirm');
  }

  if (!input.received) {
    await db.$transaction([
      db.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          failureReason: input.note ?? 'Shop could not find this payment.',
          verifiedAt: new Date(),
          verifiedByUserId: input.actorUserId,
        },
      }),
      db.order.update({ where: { id: order.id }, data: { paymentStatus: 'PENDING' } }),
    ]);

    await notify({
      userId: order.customerId,
      orderId: order.id,
      type: 'PAYMENT_FAILED',
      title: `Payment not found for order ${order.code}`,
      body:
        input.note ??
        `${order.shop.name} could not find that payment. Please check the reference, or pay at the counter.`,
      href: `/orders/${order.id}`,
    });

    return { confirmed: false };
  }

  const paidTotal = order.amountPaidMinor + payment.amountMinor;
  const fullySettled = paidTotal >= order.totalMinor;

  await db.$transaction([
    db.payment.update({
      where: { id: payment.id },
      data: { status: 'PAID', verifiedAt: new Date(), verifiedByUserId: input.actorUserId },
    }),
    db.order.update({
      where: { id: order.id },
      data: {
        amountPaidMinor: paidTotal,
        // A confirmed deposit is genuinely paid money, but the order is not
        // settled until the counter balance is collected at pickup.
        paymentStatus: fullySettled ? 'PAID' : 'PARTIALLY_PAID',
      },
    }),
  ]);

  const balance = Math.max(0, order.totalMinor - paidTotal);
  await notify({
    userId: order.customerId,
    orderId: order.id,
    type: 'PAYMENT_SUCCEEDED',
    title: `${order.shop.name} confirmed your payment`,
    body:
      balance > 0
        ? `${formatMinor(payment.amountMinor)} received. ${formatMinor(balance)} to pay at the counter.`
        : `${formatMinor(payment.amountMinor)} received. Nothing left to pay.`,
    href: `/orders/${input.orderId}`,
  });

  return { confirmed: true, amountPaidMinor: paidTotal, balanceMinor: balance };
}
