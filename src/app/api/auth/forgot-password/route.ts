import { z } from 'zod';
import { clientKey, ok, rateLimit, route } from '@/lib/api';
import { emailSchema } from '@/lib/validation';
import { requestPasswordReset } from '@/lib/services/password-reset';

const schema = z.object({ email: emailSchema });

/**
 * Always returns the same success response, whether or not the address is
 * registered — anything else turns this into an account-enumeration oracle.
 */
export const POST = route(async (request: Request) => {
  await rateLimit(clientKey(request, 'forgot-password'), 5, 60_000);

  const body = schema.parse(await request.json());
  await requestPasswordReset(body.email);

  return ok({ sent: true });
});
