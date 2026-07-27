import type { Metadata } from 'next';
import { Rocket } from 'lucide-react';
import { requireMerchantContext } from '@/lib/services/merchant';
import { findLiveBoost, listBoostsForShop } from '@/lib/services/boosts';
import { buildPlatformPaymentLink } from '@/lib/services/platform-billing';
import { BOOST_PACKAGES, boostHoursRemaining } from '@/lib/domain/boost-plans';
import { BoostPurchase } from '@/components/merchant/boost-purchase';
import { Badge, Card, SectionHeader } from '@/components/ui/primitives';
import { formatMinor } from '@/lib/domain/money';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Boost my shop' };

function formatDateTime(date: Date): string {
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function MerchantBoostPage() {
  const { shop } = await requireMerchantContext();

  const [live, history, ...paymentLinks] = await Promise.all([
    findLiveBoost(shop.id),
    listBoostsForShop(shop.id, 10),
    // One link per package, because the amount is baked into a UPI deep link and
    // a merchant should never have to type it themselves.
    ...BOOST_PACKAGES.map((pkg) =>
      buildPlatformPaymentLink({
        amountMinor: pkg.priceMinor,
        note: `Takeaway boost ${pkg.durationDays}d`,
        reference: shop.id.slice(-10),
      }),
    ),
  ]);

  const first = paymentLinks[0];
  const payment = {
    configured: first.configured,
    upiId: first.upiId,
    payeeName: first.payeeName,
    supportPhone: first.supportPhone,
    qrByDuration: Object.fromEntries(
      BOOST_PACKAGES.map((pkg, index) => [pkg.durationDays, paymentLinks[index].qrDataUrl]),
    ),
    linksByDuration: Object.fromEntries(
      BOOST_PACKAGES.map((pkg, index) => [pkg.durationDays, paymentLinks[index].appLinks]),
    ),
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold">Boost my shop</h1>
        <p className="text-sm text-muted">
          Pay by the day to sit at the top of what nearby customers see. No contract, no auto-renewal.
        </p>
      </header>

      {live ? (
        <Card className="overflow-hidden">
          <div className="bg-warning-500 px-5 py-5 text-white">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-white/85">
              <Rocket aria-hidden className="size-4" />
              Boost running
            </p>
            <p className="mt-1.5 text-3xl font-extrabold">
              {boostHoursRemaining(live.endsAt)} hour{boostHoursRemaining(live.endsAt) === 1 ? '' : 's'} left
            </p>
            <p className="mt-1 text-sm text-white/85">Ends {formatDateTime(live.endsAt)}</p>
          </div>
          <p className="px-5 py-3 text-sm text-muted">
            Buying another boost now adds days to this one rather than starting a second — you never pay
            twice for the same position.
          </p>
        </Card>
      ) : null}

      <section>
        <SectionHeader title={live ? 'Extend your boost' : 'Start a boost'} />
        <BoostPurchase shopId={shop.id} shopName={shop.name} payment={payment} />
      </section>

      {history.length > 0 ? (
        <section>
          <SectionHeader title="Past boosts" />
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Started</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Ended</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Slot</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Paid</th>
                  <th scope="col" className="px-4 py-3 font-semibold">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.map((boost) => {
                  const isLive = boost.isActive && boost.endsAt > new Date();
                  return (
                    <tr key={boost.id}>
                      <td className="px-4 py-3 tabular-nums text-muted">{formatDateTime(boost.startsAt)}</td>
                      <td className="px-4 py-3 tabular-nums text-muted">{formatDateTime(boost.endsAt)}</td>
                      <td className="px-4 py-3 text-xs">
                        {boost.slotType.replace('_', ' ').toLowerCase()}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {formatMinor(boost.amountPaidMinor)}
                      </td>
                      <td className="px-4 py-3">
                        {isLive ? (
                          <Badge tone="success">Running</Badge>
                        ) : boost.isActive ? (
                          <Badge tone="neutral">Finished</Badge>
                        ) : (
                          <Badge tone="danger">Stopped</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
