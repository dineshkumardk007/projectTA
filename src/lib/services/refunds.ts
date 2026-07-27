import 'server-only';
import { db } from '@/lib/db';
import { DomainError } from '@/lib/api';
import { getPaymentProvider } from '@/lib/providers/payments';
import { notify } from '@/lib/services/notifications';
import { formatMinor } from '@/lib/domain/money';

/**
 * Refunds.
 *
 * Called when a shop rejects or cancels an order that was paid online. Partial
 * refunds are supported because a shop may be able to supply part of an order.
 * The refund record is written whatever the provider says, so a failed refund
 * is visible and chaseable rather than silently lost.
 */
export async function refundOrder(orderId: string, options?: { amountMinor?: number; reason?: string }) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { payments: { where: { status: 'PAID' } } },
  });

  if (!order) throw new DomainError('That order could not be found.', 404);

  const payment = order.payments[0];
  if (!payment || !payment.providerRef) {
    throw new DomainError('There is no completed payment to refund on this order.', 409, 'nothing_to_refund');
  }

  const amountMinor = options?.amountMinor ?? payment.amountMinor;
  if (amountMinor <= 0 || amountMinor > payment.amountMinor) {
    throw new DomainError('That refund amount is not valid for this payment.', 422);
  }

  const provider = getPaymentProvider();
  const result = await provider.refund({
    reference: payment.providerRef,
    amountMinor,
    reason: options?.reason,
  });

  const isFull = amountMinor === payment.amountMinor;

  await db.$transaction([
    db.refund.create({
      data: {
        paymentId: payment.id,
        amountMinor,
        reason: options?.reason,
        provider: provider.name,
        providerRef: result.succeeded ? result.reference : null,
        status: result.succeeded ? 'REFUNDED' : 'FAILED',
      },
    }),
    db.payment.update({
      where: { id: payment.id },
      data: { status: result.succeeded ? (isFull ? 'REFUNDED' : 'PARTIALLY_REFUNDED') : payment.status },
    }),
    db.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: result.succeeded ? (isFull ? 'REFUNDED' : 'PARTIALLY_REFUNDED') : order.paymentStatus,
      },
    }),
  ]);

  if (result.succeeded) {
    await notify({
      userId: order.customerId,
      orderId: order.id,
      type: 'REFUND_INITIATED',
      title: `Refund of ${formatMinor(amountMinor)} for order ${order.code}`,
      body: 'Your refund has been initiated and should reach you within a few working days.',
      href: `/orders/${order.id}`,
    });
  } else {
    console.error(`[refunds] provider refund failed for order ${order.code}: ${result.failureReason}`);
  }

  return result;
}
