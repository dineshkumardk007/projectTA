import { db } from '@/lib/db';
import { verifyPassword } from '@/lib/auth/password';
import { setSessionCookie, signSession } from '@/lib/auth/session';
import { DomainError, clientKey, ok, rateLimit, route } from '@/lib/api';
import { loginSchema } from '@/lib/validation';
import { recordSignIn } from '@/lib/services/auth';

export const POST = route(async (request: Request) => {
  rateLimit(clientKey(request, 'login'), 10, 60_000);

  const body = loginSchema.parse(await request.json());

  const user = await db.user.findUnique({
    where: { email: body.email },
    select: { id: true, name: true, role: true, passwordHash: true, isActive: true, tokenVersion: true },
  });

  // Identical message and comparable timing whether the email exists or not, so
  // this endpoint cannot be used to enumerate accounts.
  const passwordOk = user ? await verifyPassword(body.password, user.passwordHash) : false;
  if (!user || !passwordOk) {
    throw new DomainError('That email and password do not match.', 401, 'invalid_credentials');
  }
  if (!user.isActive) {
    throw new DomainError('This account has been deactivated. Contact support.', 403, 'deactivated');
  }

  await setSessionCookie(
    await signSession({ sub: user.id, role: user.role, name: user.name, ver: user.tokenVersion }),
  );

  // Engagement bookkeeping only, and it swallows its own failures — nobody is
  // kept out of their account because a counter could not be written.
  await recordSignIn(user.id, request);

  return ok({ id: user.id, name: user.name, role: user.role });
});
