/**
 * Which image URLs a merchant may save against their listing.
 *
 * Only images this platform stored. The temptation is to accept any URL — it is
 * one less feature to build — but a listing pointing at a third-party server is
 * an image whose *content* someone else controls after we approved it. The photo
 * of a dosa that passed review can quietly become anything at all, on every
 * discovery card showing that shop.
 *
 * It also breaks quietly in the ordinary case: the merchant's free image host
 * expires the link and the listing shows a broken picture nobody is watching for.
 *
 * Pure, so the rule is testable and identical for shops and products.
 */

/** Where the local storage provider writes. Relative, same-origin by definition. */
const LOCAL_PREFIX = '/uploads/';

export function isPlatformImageUrl(
  value: string | null | undefined,
  allowedOrigins: readonly string[] = [],
): boolean {
  // Absent and empty both mean "no image", which is always allowed — that is how
  // a merchant removes one.
  if (value == null || value === '') return true;

  // Local provider: a same-origin path. Reject traversal and protocol-relative
  // URLs ("//evil.com/x.jpg" is a *remote* URL despite starting with a slash).
  if (value.startsWith(LOCAL_PREFIX)) {
    return !value.includes('..') && !value.startsWith('//');
  }

  if (allowedOrigins.length === 0) return false;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:') return false;

  // Compared by parsed origin rather than string prefix: "https://cdn.example.com"
  // must not match "https://cdn.example.com.evil.net".
  return allowedOrigins.some((allowed) => {
    try {
      return new URL(allowed).origin === url.origin;
    } catch {
      return false;
    }
  });
}
