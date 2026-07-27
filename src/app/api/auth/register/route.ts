import { z } from 'zod';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { setSessionCookie, signSession } from '@/lib/auth/session';
import { DomainError, clientKey, ok, rateLimit, route } from '@/lib/api';
import { registerSchema } from '@/lib/validation';
import { recordSignIn } from '@/lib/services/auth';

/**
 * Customer and merchant self-registration.
 *
 * Staff and admin accounts are never created here — they are provisioned by an
 * admin, so `role` cannot be escalated from a public endpoint.
 */
const bodySchema = registerSchema.extend({
  accountType: z.enum(['CUSTOMER', 'MERCHANT']).default('CUSTOMER'),
  businessName: z.string().trim().min(2).max(120).optional(),
});

export const POST = route(async (request: Request) => {
  rateLimit(clientKey(request, 'register'), 5, 60_000);

  const body = bodySchema.parse(await request.json());

  if (body.accountType === 'MERCHANT' && !body.businessName) {
    throw new DomainError('Enter your business name.', 422);
  }

  const existing = await db.user.findFirst({
    where: { OR: [{ email: body.email }, { phone: body.phone }] },
    select: { email: true },
  });
  if (existing) {
    throw new DomainError('An account already exists with that email or mobile number.', 409, 'duplicate');
  }

  const passwordHash = await hashPassword(body.password);

  const user = await db.user.create({
    data: {
      name: body.name,
      email: body.email,
      phone: body.phone,
      passwordHash,
      role: body.accountType,
      ...(body.accountType === 'CUSTOMER'
        ? { customerProfile: { create: {} } }
        : {
            merchant: {
              create: {
                businessName: body.businessName!,
                contactPhone: body.phone,
                // New merchants wait for admin verification before their shops
                // become visible to customers.
                verificationStatus: 'PENDING',
              },
            },
          }),
    },
    select: { id: true, name: true, role: true, tokenVersion: true },
  });

  await setSessionCookie(
    await signSession({ sub: user.id, role: user.role, name: user.name, ver: user.tokenVersion }),
  );

  // Registration signs the user straight in, so it counts as their first visit.
  await recordSignIn(user.id, request);

  return ok({ id: user.id, name: user.name, role: user.role }, 201);
});
