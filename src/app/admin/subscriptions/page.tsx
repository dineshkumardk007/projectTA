import type { Metadata } from 'next';
import { IndianRupee, Rocket, TriangleAlert } from 'lucide-react';
import {
  getSubscriptionOverview,
  listMerchantSubscriptions,
  listSubscriptionPayments,
} from '@/lib/services/subscription';
import { getBoostOverview } from '@/lib/services/boosts';
import { db } from '@/lib/db';
import { Badge, Card, SectionHeader } from '@/components/ui/primitives';
import {
  BoostSaleForm,
  BoostToggle,
  SubscriptionActions,
  TierSelect,
} from '@/components/admin/subscription-actions';
import { formatMinor } from '@/lib/domain/money';
import { SUBSCRIPTION_PLANS } from '@/lib/domain/subscription-plans';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Subscriptions & boosts' };

const HEALTH_TONE = {
  active: 'success',
  trialing: 'info',
  expiring: 'warning',
  expired: 'danger',
  cancelled: 'neutral',
  unbilled: 'neutral',
} as const;

const HEALTH_LABEL = {
  active: 'Active',
  trialing: 'Trial',
  expiring: 'Expiring soon',
  expired: 'Expired',
  cancelled: 'Cancelled',
  unbilled: 'Not on a plan',
} as const;

function formatDate(date: Date | null): string {
  if (!date) return '—';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function AdminSubscriptionsPage() {
  const [overview, merchants, payments, boosts, boostableShops] = await Promise.all([
    getSubscriptionOverview(),
    listMerchantSubscriptions(),
    listSubscriptionPayments(50),
    getBoostOverview(),
    db.shop.findMany({
      where: { isVerified: true },
      select: { id: true, name: true, city: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold">Subscriptions &amp; boosts</h1>
        <p className="text-sm text-muted">
          Phase 1: payments arrive by UPI and are recorded here by hand. Auto-debit takes over the same rows
          when there are enough shops to justify a gateway.
        </p>
      </div>

      <section>
        <SectionHeader title="Recurring revenue" />
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="MRR" value={formatMinor(overview.mrrMinor)} hint="Entitled subscriptions only" />
          <Kpi label="Annual run rate" value={formatMinor(overview.arrMinor)} />
          <Kpi label="Active subscriptions" value={String(overview.activeSubscriptions)} />
          <Kpi
            label="Expired"
            value={String(overview.expiredSubscriptions)}
            hint={overview.expiredSubscriptions > 0 ? 'Their shops are hidden' : undefined}
          />
          <Kpi
            label="Collected this month"
            value={formatMinor(overview.collectedThisMonthMinor)}
            hint={`${overview.collectedThisMonthCount} payment${overview.collectedThisMonthCount === 1 ? '' : 's'}`}
          />
          <Kpi label="Collected all time" value={formatMinor(overview.collectedAllTimeMinor)} />
          <Kpi
            label="Boost revenue this month"
            value={formatMinor(boosts.revenueThisMonthMinor)}
            hint={`${boosts.soldThisMonth} sold · ${boosts.liveCount} running now`}
          />
          <Kpi
            label="Not on a plan"
            value={String(overview.unbilledMerchants)}
            hint={`of ${overview.totalMerchants} merchants`}
          />
        </dl>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {SUBSCRIPTION_PLANS.map((plan) => (
            <Card key={plan.tier} className="p-4">
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-bold">{plan.name}</h3>
                <span className="text-sm font-extrabold tabular-nums">
                  {formatMinor(plan.priceMinor)}
                  <span className="text-xs font-normal text-muted">/mo</span>
                </span>
              </div>
              <p className="mt-1 text-2xl font-extrabold tabular-nums">
                {overview.tierCounts[plan.tier]}
                <span className="ml-1.5 text-xs font-medium text-muted">active</span>
              </p>
              <p className="mt-0.5 text-xs text-muted">{plan.summary}</p>
            </Card>
          ))}
        </div>

        {overview.expiringSoon > 0 ? (
          <Card className="mt-3 flex items-center gap-3 border-warning-500/40 bg-warning-50 p-4 dark:bg-warning-500/10">
            <TriangleAlert aria-hidden className="size-5 shrink-0 text-warning-600" />
            <p className="text-sm font-semibold text-warning-700 dark:text-warning-100">
              {overview.expiringSoon} subscription{overview.expiringSoon === 1 ? '' : 's'} expiring within 5
              days. Chasing them now is cheaper than winning them back afterwards.
            </p>
          </Card>
        ) : null}
      </section>

      <section>
        <SectionHeader title="Merchants" />
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Merchant</th>
                <th scope="col" className="px-4 py-3 font-semibold">Plan</th>
                <th scope="col" className="px-4 py-3 font-semibold">State</th>
                <th scope="col" className="px-4 py-3 font-semibold">Renews</th>
                <th scope="col" className="px-4 py-3 font-semibold">Shops</th>
                <th scope="col" className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {merchants.map((merchant) => (
                <tr key={merchant.merchantId}>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{merchant.businessName}</p>
                    <p className="text-xs text-muted">{merchant.contactEmail}</p>
                    <p className="text-xs text-muted">{merchant.contactPhone}</p>
                  </td>
                  <td className="px-4 py-3">
                    {merchant.tier ? (
                      <TierSelect merchantId={merchant.merchantId} tier={merchant.tier} />
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                    {merchant.priceMinor > 0 ? (
                      <p className="mt-1 text-xs text-muted">{formatMinor(merchant.priceMinor)}/mo</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={HEALTH_TONE[merchant.health]}>{HEALTH_LABEL[merchant.health]}</Badge>
                    {merchant.provider ? (
                      <p className="mt-1 text-xs text-muted">
                        via {merchant.provider}
                        {merchant.subscriptionRef ? ` · ${merchant.subscriptionRef}` : ''}
                      </p>
                    ) : null}
                    {merchant.note ? (
                      <p className="mt-0.5 max-w-56 truncate text-xs text-muted" title={merchant.note}>
                        {merchant.note}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatDate(merchant.currentPeriodEnd)}
                    {merchant.daysRemaining != null ? (
                      <p className="text-xs text-muted">
                        {merchant.daysRemaining > 0
                          ? `${merchant.daysRemaining} day${merchant.daysRemaining === 1 ? '' : 's'} left`
                          : 'Lapsed'}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {merchant.visibleShopCount}/{merchant.shopCount}
                    <p className="text-xs text-muted">visible</p>
                  </td>
                  <td className="px-4 py-3">
                    <SubscriptionActions
                      merchantId={merchant.merchantId}
                      businessName={merchant.businessName}
                      tier={merchant.tier}
                      isOnAPlan={merchant.health !== 'unbilled'}
                    />
                  </td>
                </tr>
              ))}
              {merchants.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    No merchants yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>
        <p className="mt-2 text-xs text-muted">
          A merchant with no plan is never deactivated — billing starts the day you put them on one.
        </p>
      </section>

      <section>
        <SectionHeader
          title="Featured boosts"
          action={
            boosts.liveCount > 0 ? (
              <Badge tone="warning">
                <Rocket aria-hidden className="size-3.5" />
                {boosts.liveCount} running
              </Badge>
            ) : null
          }
        />
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-bold">Sell a boost</h3>
          <BoostSaleForm shops={boostableShops} />
        </Card>

        <Card className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[840px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Shop</th>
                <th scope="col" className="px-4 py-3 font-semibold">Slot</th>
                <th scope="col" className="px-4 py-3 font-semibold">Window</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Paid</th>
                <th scope="col" className="px-4 py-3 font-semibold">Reference</th>
                <th scope="col" className="px-4 py-3 font-semibold">State</th>
                <th scope="col" className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {boosts.recent.map((boost) => (
                <tr key={boost.id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{boost.shopName}</p>
                    <p className="text-xs text-muted">{boost.city}</p>
                  </td>
                  <td className="px-4 py-3 text-xs">{boost.slotType.replace('_', ' ').toLowerCase()}</td>
                  <td className="px-4 py-3 text-xs tabular-nums">
                    {formatDate(boost.startsAt)} → {formatDate(boost.endsAt)}
                    <p className="text-muted">{boost.durationDays} day(s)</p>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {formatMinor(boost.amountPaidMinor)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">{boost.paymentRef ?? '—'}</td>
                  <td className="px-4 py-3">
                    {boost.isLive ? (
                      <Badge tone="success">Live</Badge>
                    ) : boost.isActive ? (
                      <Badge tone="neutral">Finished</Badge>
                    ) : (
                      <Badge tone="danger">Stopped</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <BoostToggle boostId={boost.id} isActive={boost.isActive} />
                  </td>
                </tr>
              ))}
              {boosts.recent.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted">
                    No boosts sold yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>
      </section>

      <section>
        <SectionHeader title="Payment history" />
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Recorded</th>
                <th scope="col" className="px-4 py-3 font-semibold">Merchant</th>
                <th scope="col" className="px-4 py-3 font-semibold">Plan</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Amount</th>
                <th scope="col" className="px-4 py-3 font-semibold">Via</th>
                <th scope="col" className="px-4 py-3 font-semibold">Period</th>
                <th scope="col" className="px-4 py-3 font-semibold">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td className="px-4 py-3 text-xs tabular-nums text-muted">
                    {formatDate(payment.createdAt)}
                  </td>
                  <td className="px-4 py-3 font-semibold">{payment.businessName}</td>
                  <td className="px-4 py-3 text-xs">{payment.tier}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {formatMinor(payment.amountMinor)}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {payment.provider}
                    {payment.reference ? (
                      <p className="text-muted">{payment.reference.replace(/^manual:/, '')}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums text-muted">
                    {formatDate(payment.periodStart)} → {formatDate(payment.periodEnd)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">{payment.note ?? '—'}</td>
                </tr>
              ))}
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted">
                    <IndianRupee aria-hidden className="mx-auto mb-2 size-5" />
                    No payments recorded yet.
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
