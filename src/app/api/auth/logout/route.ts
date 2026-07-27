import { clearSessionCookie } from '@/lib/auth/session';
import { ok, route } from '@/lib/api';

export const POST = route(async () => {
  await clearSessionCookie();
  return ok({ signedOut: true });
});
