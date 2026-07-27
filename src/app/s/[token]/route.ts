import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { markPosterScan } from '@/lib/services/attribution';

/**
 * The URL behind the printed counter poster: `/s/<publicQrToken>`.
 *
 * Short on purpose — it has to survive being printed at 3 cm square and scanned
 * by a five-year-old phone camera in bad light. The opaque token also means the
 * poster keeps working if the shop later changes its slug.
 *
 * The redirect is what a customer sees; the cookie set on the way through is
 * what tells the platform the poster is doing anything.
 */
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;

  const shop = await db.shop.findUnique({
    where: { publicQrToken: token },
    select: { id: true, slug: true, isActive: true },
  });

  // A retired or unknown token: send them to discovery rather than a dead end.
  // Someone standing in front of a real shop with a real poster should still
  // land somewhere they can order tea.
  if (!shop) redirect('/shops');
  if (!shop.isActive) redirect('/shops');

  await markPosterScan(shop.id);
  redirect(`/shops/${shop.slug}`);
}
