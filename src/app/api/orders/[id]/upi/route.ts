import { z } from 'zod';
import { clientKey, ok, rateLimit, route } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { buildOrderUpiIntent, submitUpiReference } from '@/lib/services/upi';
import { isPlausibleUpiReference } from '@/lib/domain/upi';

/**
 * GET  — the pay screen: deep links, QR and the amount outstanding.
 * POST — the customer's claim that they have paid, with their UPI reference.
 *
 * The POST deliberately does *not* mark the order paid. A `upi://` link produces
 * no callback, so the only thing this can record is an unverified claim; the
 * shop confirms it against their own UPI app afterwards.
 */

export const GET = route(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const user = await requireUser(['CUSTOMER']);

  const intent = await buildOrderUpiIntent(id, user.id);
  return ok(intent);
});

const submitSchema = z.object({
  reference: z
    .string()
    .trim()
    .min(1, 'Enter the UPI reference number from your payment app.')
    .refine(isPlausibleUpiReference, 'That does not look like a UPI reference number.'),
});

export const POST = route(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const user = await requireUser(['CUSTOMER']);

  // Someone guessing reference numbers should not be able to spray them.
  await rateLimit(clientKey(request, `upi-ref:${user.id}`), 10, 60_000);

  const body = submitSchema.parse(await request.json());
  const result = await submitUpiReference(id, user.id, body.reference);

  return ok({
    submitted: true,
    alreadySubmitted: result.alreadySubmitted,
    // Said plainly so the UI cannot imply the payment is settled.
    status: 'AWAITING_VERIFICATION',
  });
});
