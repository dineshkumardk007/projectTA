import { z } from 'zod';
import { db } from '@/lib/db';
import { DomainError, ok, route } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { getPaymentProvider } from '@/lib/providers/payments';
import { notify, notifyShopTeam } from '@/lib/services/notifications';
import { formatMinor } from '@/lib/domain/money';

/**
 * Online payment for an order.
 *
 * POST creates a provider intent; PUT confirms it. Confirmation is only ever
 * accepted after the provider's own signature verifies — a client claiming
 * success is not evidence of payment.
 */

export const POST = route(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const user = await requireUser(['CUSTOMER']);

  const order = await db.order.findUnique({
    where: { id },
    select: { id: true, code: true, customerId: true, totalMinor: true, paymentMethod: true, paymentStatus: true, status: true },
  });

  if (!order) throw new DomainError('That order could not be found.', 404);
  if (order.customerId !== user.id) throw new DomainError('You do not have access to this order.', 403);
  if (order.paymentMethod !== 'ONLINE') throw new DomainError('This order is paid at the counter.', 409);
  if (order.paymentStatus === 'PAID') throw new DomainError('This order is already paid.', 409, 'already_paid');
  if (['CANCELLED', 'REJECTED', 'EXPIRED'].includes(order.status)) {
    throw new DomainError('This order is closed and cannot be paid.', 409);
  }

  const provider = getPaymentProvider();
  const intent = await provider.createIntent({
    orderId: order.id,
    amountMinor: order.totalMinor,
    description: `Takeaway order ${order.code}`,
  });

  await db.payment.create({
    data: {
      orderId: order.id,
      provider: provider.name,
      providerRef: intent.reference,
      method: 'ONLINE',
      amountMinor: intent.amountMinor,
      status: 'PENDING',
    },
  });

  return ok({ reference: intent.reference, amountMinor: intent.amountMinor, clientPayload: intent.clientPayload });
});

const confirmSchema = z.object({
  reference: z.string().min(1),
  signature: z.string().optional(),
  raw: z.record(z.string(), z.unknown()).optional(),
});

export const PUT = route(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const user = await requireUser(['CUSTOMER']);
  const body = confirmSchema.parse(await request.json());

  const order = await db.order.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      customerId: true,
      shopId: true,
      totalMinor: true,
      paymentStatus: true,
      shop: { select: { name: true } },
    },
  });

  if (!order) throw new DomainError('That order could not be found.', 404);
  if (order.customerId !== user.id) throw new DomainError('You do not have access to this order.', 403);

  // Re-confirming an already-paid order is a no-op rather than a double charge.
  if (order.paymentStatus === 'PAID') return ok({ paymentStatus: 'PAID', alreadyPaid: true });

  const payment = await db.payment.findFirst({
    where: { orderId: order.id, providerRef: body.reference },
  });
  if (!payment) throw new DomainError('That payment reference does not belong to this order.', 404);

  const provider = getPaymentProvider();
  const confirmation = await provider.confirm({
    reference: body.reference,
    signature: body.signature,
    raw: body.raw,
  });

  if (!confirmation.succeeded) {
    await db.$transaction([
      db.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', failureReason: confirmation.failureReason },
      }),
      db.order.update({ where: { id: order.id }, data: { paymentStatus: 'FAILED' } }),
    ]);

    await notify({
      userId: order.customerId,
      orderId: order.id,
      type: 'PAYMENT_FAILED',
      title: `Payment failed for order ${order.code}`,
      body: confirmation.failureReason ?? 'Your payment did not go through. Please try again.',
      href: `/orders/${order.id}`,
    });

    throw new DomainError(confirmation.failureReason ?? 'Payment failed.', 402, 'payment_failed');
  }

  await db.$transaction([
    db.payment.update({
      where: { id: payment.id },
      data: { status: 'PAID', providerRef: confirmation.reference },
    }),
    db.order.update({ where: { id: order.id }, data: { paymentStatus: 'PAID' } }),
  ]);

  await notify({
    userId: order.customerId,
    orderId: order.id,
    type: 'PAYMENT_SUCCEEDED',
    title: `Payment received for order ${order.code}`,
    body: `${formatMinor(order.totalMinor)} paid. ${order.shop.name} can now start preparing.`,
    href: `/orders/${order.id}`,
  });

  await notifyShopTeam(order.shopId, {
    orderId: order.id,
    type: 'PAYMENT_SUCCEEDED',
    title: `Order ${order.code} is paid`,
    body: 'You can accept and start preparing this order.',
    href: '/merchant/orders',
  });

  return ok({ paymentStatus: 'PAID' });
});
