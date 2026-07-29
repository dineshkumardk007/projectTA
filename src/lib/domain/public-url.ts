/**
 * Is the configured public address one a stranger's phone can actually open?
 *
 * `NEXT_PUBLIC_APP_URL` is baked into the printed counter poster QR code and
 * into password-reset links. A poster is paper: once it is stuck to a counter it
 * cannot be reissued, so a `localhost` or LAN address reaching production is not
 * a setting you correct later — it is a stack of dead posters.
 *
 * Pure, so the rule can be tested without booting the app.
 */

/** Loopback and the three private IPv4 ranges (RFC 1918). */
const UNREACHABLE_HOST =
  /^(localhost$|127\.|0\.0\.0\.0$|\[?::1\]?$|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i;

export function isUnreachableHost(hostname: string): boolean {
  return UNREACHABLE_HOST.test(hostname);
}

/**
 * Returns a human-readable problem with the URL, or null if it is fine.
 *
 * Development is deliberately exempt: testing on a phone over Wi-Fi is exactly
 * why a LAN address is the right value there. Note that a *local* production
 * build is also a legitimate way to test on a phone, which is why the caller —
 * not this function — decides whether a problem is fatal. See `appUrlSeverity`.
 */
export function describeAppUrlProblem(rawUrl: string, nodeEnv: string): string | null {
  if (nodeEnv !== 'production') return null;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return `NEXT_PUBLIC_APP_URL ("${rawUrl}") is not a valid URL.`;
  }

  if (isUnreachableHost(url.hostname)) {
    return (
      `NEXT_PUBLIC_APP_URL points at "${url.hostname}", which only resolves on your own machine or network. ` +
      'Set it to the public site address, e.g. https://your-app.vercel.app.'
    );
  }

  if (url.protocol !== 'https:') {
    // A QR opening an insecure page warns the customer, and installability,
    // push notifications and camera access all require https.
    return (
      `NEXT_PUBLIC_APP_URL uses ${url.protocol}//. Installable apps, push notifications and ` +
      'camera access all require https.'
    );
  }

  return null;
}

/**
 * How hard to complain about a bad public URL.
 *
 * A production *build* is not the same thing as a production *deployment*. A
 * developer running `next build` to test the optimised bundle on their phone
 * over Wi-Fi has a LAN address on purpose, and refusing to build would be
 * obstructive. A real deployment serving real customers is a different matter:
 * there the posters are about to be printed, so it should refuse to boot.
 *
 * `VERCEL_ENV` is set to "production" only on a production deployment (previews
 * get "preview"). Self-hosted deployments have no such marker, so `DEPLOYED=1`
 * is honoured as an explicit opt-in — the Dockerfile sets it.
 */
export function appUrlSeverity(vars: {
  vercelEnv?: string;
  deployed?: string;
}): 'fatal' | 'warn' {
  const isRealDeployment = vars.vercelEnv === 'production' || vars.deployed === '1';
  return isRealDeployment ? 'fatal' : 'warn';
}
