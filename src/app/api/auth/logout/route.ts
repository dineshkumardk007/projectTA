import { clearSessionCookie } from '@/lib/auth/session';
import { ok, route } from '@/lib/api';
import { recordSignOut } from '@/lib/services/auth';

export const POST = route(async () => {
  // Closed before the cookie is cleared: after that we no longer know which
  // session log row belonged to this browser.
  await recordSignOut();
  await clearSessionCookie();
  return ok({ signedOut: true });
});
