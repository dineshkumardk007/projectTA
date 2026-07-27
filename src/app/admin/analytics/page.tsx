import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, MapPin, QrCode, TrendingUp } from 'lucide-react';
import {
  getDemandGrid,
  getGrowthSeries,
  getPeakHours,
  getReliabilityScorecard,
  getSourceBreakdown,
} from '@/lib/services/analytics';
import { Badge, Card, SectionHeader } from '@/components/ui/primitives';
import { DemandMap, PeakHoursChart, TimeSeriesChart } from '@/components/admin/charts';
import { formatMinor } from '@/lib/domain/money';
// From the pure domain module, not from `charts` — that file is a client
// component, and a server component cannot call a function exported from one.
import { formatHourOfDay as formatHour } from '@/lib/domain/prep-time';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Growth analytics' };

export default async function AdminAnalyticsPage() {
  const [growth, peakHours, demand, reliability, sources] = await Promise.all([
    getGrowthSeries(30),
    getPeakHours(30),
    getDemandGrid(60),
    getReliabilityScorecard(30),
    getSourceBreakdown(30),
  ]);

  const coldSpots = demand.filter((cell) => cell.isColdSpot);
  const flagged = reliability.filter((row) => row.totalOrders >= 5 && row.flags.length > 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold">Growth analytics</h1>
        <p className="text-sm text-muted">
          Last 30 days. &ldquo;Active&rdquo; means placed an order — not opened the app, which would be a
          bigger number and a weaker claim.
        </p>
      </div>

      <section>
        <SectionHeader title="Engagement" />
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Daily active (ordering)" value={growth.dau.toLocaleString('en-IN')} />
          <Kpi label="Monthly active (ordering)" value={growth.mau.toLocaleString('en-IN')} />
          <Kpi
            label="Stickiness (DAU/MAU)"
            value={`${growth.stickiness}%`}
            hint={growth.stickiness >= 20 ? 'Habitual use' : 'Occasional use'}
          />
          <Kpi
            label="Poster-scan orders"
            value={`${sources.posterShare}%`}
            hint={`${sources.posterQr} of ${sources.total} orders`}
          />
        </dl>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <TimeSeriesChart title="Orders placed per day" points={growth.orders} />
        <TimeSeriesChart title="Customer signups per day" points={growth.signups} tone="info" />
        <TimeSeriesChart
          title="Merchant onboarding per day"
          points={growth.merchantSignups}
          tone="success"
        />
        <TimeSeriesChart
          title="Collected order value per day"
          points={growth.revenueMinor}
          valueFormat="money"
        />
      </section>

      <section>
        <SectionHeader title="Peak hours" />
        <PeakHoursChart buckets={peakHours} />
      </section>

      <section>
        <SectionHeader
          title="Geo demand & expansion"
          action={
            coldSpots.length > 0 ? (
              <Badge tone="info">
                <MapPin aria-hidden className="size-3.5" />
                {coldSpots.length} recruitment lead{coldSpots.length === 1 ? '' : 's'}
              </Badge>
            ) : null
          }
        />
        <div className="space-y-3">
          <DemandMap cells={demand} />

          {coldSpots.length > 0 ? (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <caption className="px-4 pt-4 text-left text-sm font-bold">
                  Cold spots — customers ordering where no shop is listed
                  <span className="ml-2 font-normal text-muted">
                    The same data as the map, for anyone who cannot use it.
                  </span>
                </caption>
                <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Approximate area</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Orders (60 days)</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Shops listed</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Map</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {coldSpots.slice(0, 15).map((cell) => (
                    <tr key={`${cell.latitude},${cell.longitude}`}>
                      <td className="px-4 py-3 tabular-nums">
                        {cell.latitude.toFixed(2)}, {cell.longitude.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{cell.orders}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted">{cell.shops}</td>
                      <td className="px-4 py-3">
                        <a
                          className="text-sm font-semibold text-brand-600 hover:underline"
                          href={`https://www.openstreetmap.org/?mlat=${cell.latitude}&mlon=${cell.longitude}#map=15/${cell.latitude}/${cell.longitude}`}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          Open
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-border px-4 py-3 text-xs text-muted">
                Locations are rounded to ~1 km before grouping, so a cell describes a neighbourhood and never
                an address.
              </p>
            </Card>
          ) : (
            <Card className="p-4 text-sm text-muted">
              No cold spots yet. A cell needs at least three located orders and no listed shop before it
              counts as a lead — below that it is one customer passing through, not a market.
            </Card>
          )}
        </div>
      </section>

      <section>
        <SectionHeader
          title="Merchant reliability"
          action={
            flagged.length > 0 ? (
              <Badge tone="warning">
                <AlertTriangle aria-hidden className="size-3.5" />
                {flagged.length} shop{flagged.length === 1 ? '' : 's'} flagged
              </Badge>
            ) : null
          }
        />
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Shop</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Score</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Prep vs promised</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Rejected</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Out of stock</th>
                <th scope="col" className="px-4 py-3 font-semibold">Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {reliability.map((row) => (
                <tr key={row.shopId}>
                  <td className="px-4 py-3">
                    <Link href={`/shops/${row.slug}`} className="font-semibold hover:underline">
                      {row.name}
                    </Link>
                    <p className="text-xs text-muted">
                      {row.city} · {row.totalOrders} order{row.totalOrders === 1 ? '' : 's'}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ScoreBadge score={row.score} thin={row.totalOrders < 5} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.averagePrepMinutes != null && row.averagePromisedMinutes != null ? (
                      <>
                        <span className="font-semibold">{row.averagePrepMinutes} min</span>
                        <span className="text-muted"> vs {row.averagePromisedMinutes} promised</span>
                        {/* Spelled out rather than shown as a bare signed number:
                            "13 min-12" reads as a mangled figure, and the sign
                            alone does not say which direction is good. */}
                        {row.prepLatency != null && row.prepLatency !== 0 ? (
                          <span
                            className={
                              row.prepLatency > 0
                                ? 'mt-0.5 block text-xs font-semibold text-danger-600'
                                : 'mt-0.5 block text-xs font-semibold text-success-600'
                            }
                          >
                            {row.prepLatency > 0
                              ? `${row.prepLatency} min late`
                              : `${Math.abs(row.prepLatency)} min early`}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.rejectionRate}%
                    <span className="ml-1 text-xs text-muted">({row.rejected})</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.outOfStockRate}%
                    <span className="ml-1 text-xs text-muted">
                      ({row.outOfStockItems}/{row.menuSize})
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {row.flags.length > 0 ? (
                      <ul className="space-y-0.5 text-xs text-muted">
                        {row.flags.map((flag) => (
                          <li key={flag}>{flag}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-xs text-success-600">Healthy</span>
                    )}
                  </td>
                </tr>
              ))}
              {reliability.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    No verified shops yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>
      </section>

      <section>
        <SectionHeader title="Counter poster vs app discovery" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
              <QrCode aria-hidden className="size-4" />
              Poster scans
            </p>
            <p className="mt-1 text-2xl font-extrabold tabular-nums">{sources.posterQr}</p>
            <p className="mt-0.5 text-xs text-muted">{formatMinor(sources.posterRevenueMinor)} ordered</p>
          </Card>
          <Card className="p-4">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
              <TrendingUp aria-hidden className="size-4" />
              Found in the app
            </p>
            <p className="mt-1 text-2xl font-extrabold tabular-nums">{sources.app}</p>
            <p className="mt-0.5 text-xs text-muted">Search, browse and favourites</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Shared links</p>
            <p className="mt-1 text-2xl font-extrabold tabular-nums">{sources.directLink}</p>
            <p className="mt-0.5 text-xs text-muted">Direct links to a shop page</p>
          </Card>
        </div>

        {sources.topPosterShops.length > 0 ? (
          <Card className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <caption className="px-4 pt-4 text-left text-sm font-bold">
                Where the posters are working
              </caption>
              <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Shop</th>
                  <th scope="col" className="px-4 py-3 font-semibold">City</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Scanned orders</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sources.topPosterShops.map((shop) => (
                  <tr key={shop.shopId}>
                    <td className="px-4 py-3 font-semibold">{shop.name}</td>
                    <td className="px-4 py-3 text-muted">{shop.city}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{shop.orders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <Card className="mt-3 p-4 text-sm text-muted">
            No poster scans recorded yet. Orders count as a scan when the customer reaches the shop through
            the QR code printed on its counter poster, within two hours of scanning.
          </Card>
        )}
      </section>

      <section>
        <SectionHeader title="Peak hours in numbers" />
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <caption className="px-4 pt-4 text-left text-sm text-muted">
              The chart above, as figures.
            </caption>
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Hour</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Orders</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Order value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {peakHours
                .filter((bucket) => bucket.orders > 0)
                .map((bucket) => (
                  <tr key={bucket.hour}>
                    <td className="px-4 py-3">
                      {formatHour(bucket.hour)} – {formatHour((bucket.hour + 1) % 24)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{bucket.orders}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">
                      {formatMinor(bucket.revenueMinor)}
                    </td>
                  </tr>
                ))}
              {peakHours.every((bucket) => bucket.orders === 0) ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-muted">
                    No orders in the last 30 days.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-extrabold tabular-nums">{value}</dd>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </Card>
  );
}

/** Score plus the reason to distrust it, never the score alone. */
function ScoreBadge({ score, thin }: { score: number; thin: boolean }) {
  if (thin) {
    return (
      <span className="text-sm font-semibold text-muted" title="Too few orders to judge">
        {score}
        <span className="ml-1 text-xs font-normal">(thin)</span>
      </span>
    );
  }
  const tone = score >= 80 ? 'success' : score >= 60 ? 'warning' : 'danger';
  return <Badge tone={tone}>{score}</Badge>;
}
