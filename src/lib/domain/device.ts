/**
 * Which kind of device a request came from.
 *
 * Used only for engagement reporting — never for authorisation, and never to
 * change what a user is shown. User-agent strings are trivially forged, so the
 * answer here is a hint about a population, not a fact about a person.
 *
 * Pure, so it can be unit-tested without a request object.
 */

export type DeviceType = 'mobile' | 'desktop' | 'pwa';

const MOBILE_PATTERN = /android|iphone|ipad|ipod|iemobile|blackberry|opera mini|mobile/i;

/**
 * `display-mode` is the only reliable signal that the app is running installed:
 * a PWA's user agent is byte-identical to the browser's. Chromium sends it as
 * the `Sec-CH-UA-Mobile`-adjacent `display-mode` hint; the app's own client also
 * sets `x-display-mode` when it detects `standalone`, which is what actually
 * makes this work on iOS.
 */
export function detectDeviceType(headers: {
  userAgent?: string | null;
  displayMode?: string | null;
}): DeviceType {
  const displayMode = headers.displayMode?.toLowerCase() ?? '';
  if (displayMode.includes('standalone') || displayMode.includes('fullscreen') || displayMode.includes('minimal-ui')) {
    return 'pwa';
  }

  const userAgent = headers.userAgent ?? '';
  return MOBILE_PATTERN.test(userAgent) ? 'mobile' : 'desktop';
}

/** Reads the two headers `detectDeviceType` needs off a `Request`. */
export function detectDeviceTypeFromRequest(request: Request): DeviceType {
  return detectDeviceType({
    userAgent: request.headers.get('user-agent'),
    displayMode: request.headers.get('x-display-mode'),
  });
}
