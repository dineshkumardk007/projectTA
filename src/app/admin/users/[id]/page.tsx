import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { getCustomerDetail } from '@/lib/services/analytics';
import { getEngagementSummary } from '@/lib/services/auth';
import { Badge, Card, SectionHeader } from '@/components/ui/primitives';
import { CashOnPickupAction, UserActiveAction } from '@/components/admin/row-actions';
import { formatMinor } from '@/lib/domain/money';
import { humanStatus } from '@/lib/domain/order-status';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Customer detail' };

const SOURCE_LABEL: Record<string, string> = {
  APP: 'App',
  POSTER_QR: 'Counter poster',
  DIRECT_LINK: 'Shared link',
};

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours === 0) return `${minutes} min`;
  return `${hours} h ${minutes} min`;
}

function formatDateTime(date: Date | null): string {
  if (!date) return 'Never';
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function AdminCustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const detail = await getCustomerDetail(id);
  if (!detail) notFound();

  const engagement = await getEngagementSummary(id);
  const { user } = detail;
  const profile = user.customerProfile;

  const abandonRate =
    detail.totalOrders > 0
      ? Math.round(((detail.cancelledOrders + (profile?.abandonedOrderCount ?? 0)) / detail.totalOrders) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/users" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600">
          <ArrowLeft aria-hidden className="size-4" />
          All users
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold">{user.name}</h1>
          <Badge tone={user.role === 'ADMIN' ? 'brand' : 'neutral'}>{user.role}</Badge>
          <Badge tone={user.isActive ? 'success' : 'danger'}>
            {user.isActive ? 'Active' : 'Deactivated'}
          </Badge>
          {profile?.isCashOnPickupBlocked ? (
            <Badge tone="warning">
              <ShieldAlert aria-hidden className="size-3.5" />
              Cash on pickup blocked
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted">
          {user.email}
          {user.phone ? ` · ${user.phone}` : ''} · joined{' '}
          {user.createdAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      </div>

      <section>
        <SectionHeader title="Lifetime" />
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi
            label="Lifetime spend"
            value={formatMinor(detail.lifetimeSpendMinor)}
            hint="Collected orders only"
          />
          <Kpi label="Average order" value={formatMinor(detail.averageOrderMinor)} />
          <Kpi
            label="Completed orders"
            value={String(detail.completedOrders)}
            hint={`of ${detail.totalOrders} placed`}
          />
          <Kpi
            label="Cancelled / rejected"
            value={`${detail.cancelledOrders} / ${detail.rejectedOrders}`}
            hint={abandonRate > 0 ? `${abandonRate}% of orders fell through` : undefined}
          />
          <Kpi label="Sign-ins" value={String(engagement.loginCount)} />
          <Kpi label="Last seen" value={formatDateTime(engagement.lastLoginAt)} />
          <Kpi
            label="Total session time"
            value={formatDuration(engagement.totalSessionSeconds)}
            hint={`${engagement.measuredSessions} closed session${engagement.measuredSessions === 1 ? '' : 's'}`}
          />
          <Kpi
            label="Average session"
            value={formatDuration(engagement.averageSessionSeconds)}
            hint={engagement.openSessions > 0 ? `${engagement.openSessions} still open, excluded` : undefined}
          />
        </dl>
        <p className="mt-2 text-xs text-muted">
          Session time counts only sessions that ended with a sign-out or were closed at the four-hour cap.
          Most people close a tab instead, so the real figure is higher than this — it is reported low on
          purpose rather than guessed upward.
        </p>
      </section>

      <section>
        <SectionHeader title="Reliability & fraud guard" />
        <Card className="p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-bold">Internal reliability counters</h3>
              {profile ? (
                <dl className="mt-2 space-y-1 text-sm">
                  <Row label="Orders placed" value={String(profile.ordersPlaced)} />
                  <Row label="Completed" value={String(profile.ordersCompleted)} />
                  <Row label="Cancelled" value={String(profile.ordersCancelled)} />
                  <Row label="Not collected" value={String(profile.ordersAbandoned)} />
                  <Row label="Abandoned cash orders" value={String(profile.abandonedOrderCount)} />
                </dl>
              ) : (
                <p className="mt-2 text-sm text-muted">
                  This account has no customer profile — merchants and staff do not order.
                </p>
              )}
              <p className="mt-2 text-xs text-muted">
                Never shown to customers or merchants.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-bold">Restrictions</h3>
              <p className="mt-1 text-sm text-muted">
                Blocking cash on pickup does not stop this customer ordering. It requires them to pay before
                a shop starts cooking, so repeated no-shows stop costing merchants food.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {profile ? (
                  <CashOnPickupAction userId={user.id} isBlocked={profile.isCashOnPickupBlocked} />
                ) : null}
                <UserActiveAction userId={user.id} isActive={user.isActive} />
              </div>
            </div>
          </div>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div>
          <SectionHeader title="Favourite shops" />
          <Card className="p-4">
            {detail.favoriteShops.length > 0 ? (
              <ul className="space-y-2">
                {detail.favoriteShops.map((shop) => (
                  <li key={shop.id} className="flex items-center justify-between text-sm">
                    <Link href={`/shops/${shop.slug}`} className="font-semibold hover:underline">
                      {shop.name}
                    </Link>
                    <span className="text-xs text-muted">{shop.city}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No saved shops.</p>
            )}
          </Card>
        </div>

        <div>
          <SectionHeader title="Orders most often from" />
          <Card className="p-4">
            {detail.mostOrderedShops.length > 0 ? (
              <ul className="space-y-2">
                {detail.mostOrderedShops.map((shop) => (
                  <li key={shop.shopId} className="flex items-center justify-between text-sm">
                    <span className="font-semibold">{shop.name}</span>
                    <span className="text-xs text-muted">
                      {shop.orders} order{shop.orders === 1 ? '' : 's'} · {formatMinor(shop.spendMinor)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No collected orders yet.</p>
            )}
          </Card>
        </div>
      </section>

      <section>
        <SectionHeader title="Devices" />
        <Card className="p-4">
          {engagement.deviceBreakdown.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {engagement.deviceBreakdown.map((device) => (
                <li key={device.deviceType}>
                  <Badge tone="neutral">
                    {device.deviceType} · {device.count} session{device.count === 1 ? '' : 's'}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No sessions recorded since sign-in tracking was added.</p>
          )}
        </Card>
      </section>

      <section>
        <SectionHeader title="Recent orders" />
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Order</th>
                <th scope="col" className="px-4 py-3 font-semibold">Shop</th>
                <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                <th scope="col" className="px-4 py-3 font-semibold">Found via</th>
                <th scope="col" className="px-4 py-3 font-semibold">Payment</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Total</th>
                <th scope="col" className="px-4 py-3 font-semibold">Placed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {detail.recentOrders.map((order) => (
                <tr key={order.id}>
                  <td className="px-4 py-3 font-semibold">{order.code}</td>
                  <td className="px-4 py-3">{order.shop.name}</td>
                  <td className="px-4 py-3">{humanStatus(order.status)}</td>
                  <td className="px-4 py-3 text-xs text-muted">{SOURCE_LABEL[order.source] ?? order.source}</td>
                  <td className="px-4 py-3 text-xs text-muted">{order.paymentMethod.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {formatMinor(order.totalMinor)}
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums text-muted">
                    {order.placedAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </td>
                </tr>
              ))}
              {detail.recentOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted">
                    No orders yet.
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
      <dd className="mt-1 text-xl font-extrabold tabular-nums">{value}</dd>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
