import { z } from 'zod';
import { clientKey, ok, rateLimit, route } from '@/lib/api';
import { passwordSchema } from '@/lib/validation';
import { resetPassword } from '@/lib/services/password-reset';
import { clearSessionCookie } from '@/lib/auth/session';

const schema = z.object({
  token: z.string().min(1, 'That reset link is not valid.'),
  password: passwordSchema,
});

export const POST = route(async (request: Request) => {
  await rateLimit(clientKey(request, 'reset-password'), 10, 60_000);

  const body = schema.parse(await request.json());
  await resetPassword(body.token, body.password);

  // The reset invalidated every session for this user, including any this
  // browser is holding. Clear it so they sign in fresh with the new password.
  await clearSessionCookie();

  return ok({ reset: true });
});
