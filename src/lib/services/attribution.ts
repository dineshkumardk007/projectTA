import 'server-only';
import { cookies } from 'next/headers';
import type { OrderSource } from '@prisma/client';

/**
 * Where an order came from.
 *
 * The only channel worth instrumenting carefully is the printed counter poster:
 * it is the platform's main offline acquisition route, and without this there is
 * no way to tell a poster that works from one that is quietly ignored next to a
 * till.
 *
 * The mechanism is a short-lived, shop-scoped cookie set by `/s/[token]` — the
 * URL the poster QR encodes. It is scoped to one shop so a customer who scans a
 * poster at the tea stall and then orders from the juice shop three doors down
 * does not credit the wrong poster.
 */

const SOURCE_COOKIE = 'takeaway_src';

/**
 * How long a scan stays credited.
 *
 * Two hours: long enough to cover reading the menu, deciding and ordering, short
 * enough that yesterday's scan cannot claim today's order. This is attribution,
 * not a persistent identifier — nothing here is used to recognise a person.
 */
const ATTRIBUTION_TTL_SECONDS = 2 * 60 * 60;

/** Cookie value is `<source>:<shopId>` — parsed defensively; it is client-held. */
function encode(source: OrderSource, shopId: string): string {
  return `${source}:${shopId}`;
}

export async function markPosterScan(shopId: string): Promise<void> {
  const store = await cookies();
  store.set(SOURCE_COOKIE, encode('POSTER_QR', shopId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ATTRIBUTION_TTL_SECONDS,
  });
}

/**
 * The source to record for an order at this shop.
 *
 * Defaults to `APP`. An unreadable, expired or differently-scoped cookie simply
 * means "no attribution", never an error: nobody's order fails because a
 * marketing number could not be worked out.
 */
export async function resolveOrderSource(shopId: string): Promise<OrderSource> {
  try {
    const raw = (await cookies()).get(SOURCE_COOKIE)?.value;
    if (!raw) return 'APP';

    const separator = raw.indexOf(':');
    if (separator < 1) return 'APP';

    const source = raw.slice(0, separator);
    const scopedShopId = raw.slice(separator + 1);
    if (scopedShopId !== shopId) return 'APP';

    return source === 'POSTER_QR' || source === 'DIRECT_LINK' ? source : 'APP';
  } catch {
    return 'APP';
  }
}
