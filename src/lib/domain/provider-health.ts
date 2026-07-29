/**
 * What actually happens to a person when an integration is not configured.
 *
 * Every provider in this codebase falls back to a local implementation, which is
 * the right design — the platform should not refuse to start because an API key
 * is missing. But "falls back" covers two very different situations, and the
 * admin screen was presenting them identically:
 *
 *  • **Degraded**: the fallback does the job. Straight-line distance instead of
 *    routed distance is a slightly worse estimate, not a broken feature.
 *
 *  • **Broken**: the fallback does nothing a user is waiting for, and nobody is
 *    told. A password reset "sent" to the server log is not a slower reset; it
 *    is a customer permanently locked out, with the app cheerfully claiming an
 *    email is on its way.
 *
 * The second kind is what this module exists to name, because it is invisible
 * from inside the app — everything returns success.
 *
 * Pure, so the severity rules can be tested.
 */

export type ProviderSeverity = 'ok' | 'degraded' | 'broken';

export type ProviderHealth = {
  key: 'email' | 'push' | 'storage' | 'payments' | 'maps';
  name: string;
  configured: boolean;
  /** The configured provider name, e.g. "resend". */
  value: string;
  /** What runs instead when credentials are absent. */
  fallback: string;
  severity: ProviderSeverity;
  /** Plain description of the user-visible consequence. Empty when fine. */
  consequence: string;
};

export type ProviderInput = {
  configured: boolean;
  value: string;
};

export function describeProviders(input: {
  email: ProviderInput;
  push: ProviderInput;
  storage: ProviderInput;
  payments: ProviderInput;
  maps: ProviderInput;
  /** Deployed for real, as opposed to a laptop. Raises severity. */
  isDeployed: boolean;
  /** Serverless hosting has no writable disk, so local storage cannot work. */
  isServerless: boolean;
}): ProviderHealth[] {
  const live = input.isDeployed;

  return [
    {
      key: 'email',
      name: 'Email',
      configured: input.email.configured,
      value: input.email.value,
      fallback: 'console',
      // The worst of the set: it fails silently *and* locks people out.
      severity: input.email.configured ? 'ok' : live ? 'broken' : 'degraded',
      consequence: input.email.configured
        ? ''
        : 'Password reset links are printed to the server log instead of being emailed. Anyone who forgets their password cannot get back in, and the app still tells them to check their inbox.',
    },
    {
      key: 'push',
      name: 'Push notifications',
      configured: input.push.configured,
      value: input.push.value,
      fallback: 'mock',
      severity: input.push.configured ? 'ok' : live ? 'broken' : 'degraded',
      consequence: input.push.configured
        ? ''
        : '"Your order is ready" never reaches the customer, so they wait at the counter anyway — which is the delay this product exists to remove.',
    },
    {
      key: 'storage',
      name: 'Image storage',
      configured: input.storage.configured,
      value: input.storage.value,
      fallback: 'local disk',
      // Writing to disk is fine on a normal server and impossible on serverless.
      severity: input.storage.configured ? 'ok' : input.isServerless ? 'broken' : 'degraded',
      consequence: input.storage.configured
        ? ''
        : input.isServerless
          ? 'Photo uploads are refused. This hosting has no writable disk, so shops and menu items cannot have pictures until object storage is configured.'
          : 'Photos are written to local disk, which is fine here but will not survive a move to serverless hosting.',
    },
    {
      key: 'payments',
      name: 'Card / gateway payments',
      configured: input.payments.configured,
      value: input.payments.value,
      fallback: 'mock',
      // Direct UPI is the primary path and needs no gateway, so this is a
      // missing option rather than a broken one.
      severity: input.payments.configured ? 'ok' : 'degraded',
      consequence: input.payments.configured
        ? ''
        : 'Gateway payments are simulated. Direct UPI and cash on pickup are unaffected, so customers can still pay.',
    },
    {
      key: 'maps',
      name: 'Maps / distance',
      configured: input.maps.configured,
      value: input.maps.value,
      fallback: 'haversine',
      // The default, not a compromise.
      severity: 'ok',
      consequence: '',
    },
  ];
}

/** The ones that need saying out loud — broken first. */
export function criticalProviders(providers: ProviderHealth[]): ProviderHealth[] {
  return providers.filter((provider) => provider.severity === 'broken');
}
