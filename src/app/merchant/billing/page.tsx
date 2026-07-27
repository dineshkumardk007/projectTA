import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { Check, CircleAlert, Phone, Rocket } from 'lucide-react';
import { db } from '@/lib/db';
import { requireMerchantContext } from '@/lib/services/merchant';
import { getBillingSummary } from '@/lib/services/subscription';
import { buildPlatformPaymentLink } from '@/lib/services/platform-billing';
import { SUBSCRIPTION_PLANS, priceMinorFor } from '@/lib/domain/subscription-plans';
import { Badge, Card, SectionHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { formatMinor } from '@/lib/domain/money';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Billing' };

function formatDate(date: Date | null): string {
  if (!date) return '—';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function MerchantBillingPage() {
  const { shop } = await requireMerchantContext();

  const merchant = await db.merchant.findUnique({
    where: { id: shop.merchantId },
    select: { id: true, businessName: true },
  });
  if (!merchant) {
    // A shop always has a merchant; this only fires if the row was deleted
    // underneath an open session.
    return <p className="text-sm text-muted">Your merchant account could not be loaded.</p>;
  }

  const billing = await getBillingSummary(merchant.id);
  const tier = billing.plan?.tier ?? 'STARTER';
  const amountMinor = priceMinorFor(tier);

  const payment = await buildPlatformPaymentLink({
    amountMinor,
    note: `Takeaway ${billing.plan?.name ?? 'Starter'} plan`,
    reference: merchant.id.slice(-10),
  });

  const isExpiring = billing.daysRemaining != null && billing.daysRemaining <= 5 && billing.isActive;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold">Billing</h1>
        <p className="text-sm text-muted">{merchant.businessName}</p>
      </header>

      {billing.isUnbilled ? (
        <Card className="p-5">
          <Badge tone="neutral">No plan yet</Badge>
          <h2 className="mt-2 text-lg font-bold">Your shops are live and free for now</h2>
          <p className="mt-1 text-sm text-muted">
            You are not on a subscription, so nothing is charged and nothing expires. When we put you on a
            plan you will see the renewal date here, and we will tell you first.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div
            className={
              billing.isActive
                ? 'bg-brand-500 px-5 py-5 text-white'
                : 'bg-danger-600 px-5 py-5 text-white'
            }
          >
            <p className="text-xs font-bold uppercase tracking-wide text-white/80">
              {billing.plan?.name ?? 'Plan'} · {formatMinor(amountMinor)} a month
            </p>
            <p className="mt-1.5 text-3xl font-extrabold">
              {billing.isActive ? (
                <>
                  {billing.daysRemaining} day{billing.daysRemaining === 1 ? '' : 's'} left
                </>
              ) : (
                'Subscription expired'
              )}
            </p>
            <p className="mt-1 text-sm text-white/85">
              {billing.isActive
                ? `Renews on ${formatDate(billing.currentPeriodEnd)}`
                : `Ended on ${formatDate(billing.currentPeriodEnd)} — your shops are hidden from customers until you renew.`}
            </p>
          </div>

          {billing.status === 'TRIALING' && billing.trialEndsAt ? (
            <p className="border-t border-border px-5 py-3 text-sm text-muted">
              Free trial — ends {formatDate(billing.trialEndsAt)}. Nothing is charged automatically.
            </p>
          ) : null}

          {isExpiring ? (
            <p className="flex items-center gap-2 border-t border-border bg-warning-50 px-5 py-3 text-sm font-semibold text-warning-700 dark:bg-warning-500/10 dark:text-warning-100">
              <CircleAlert aria-hidden className="size-4 shrink-0" />
              Renew in the next few days to stay listed.
            </p>
          ) : null}
        </Card>
      )}

      <section>
        <SectionHeader title="Renew" />
        <Card className="p-5">
          {payment.configured ? (
            <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-start">
              {payment.qrDataUrl ? (
                <Image
                  src={payment.qrDataUrl}
                  alt={`UPI QR code to pay ${formatMinor(amountMinor)} to ${payment.payeeName}`}
                  width={180}
                  height={180}
                  className="rounded-[var(--radius-field)] border border-border bg-white p-2"
                  unoptimized
                />
              ) : null}

              <div>
                <p className="text-sm">
                  Pay <span className="font-bold">{formatMinor(amountMinor)}</span> to{' '}
                  <span className="font-bold">{payment.upiId}</span> ({payment.payeeName}), then send us the
                  UPI reference number.
                </p>
                <p className="mt-1.5 text-xs text-muted">
                  A UPI transfer gives us no automatic confirmation, so your plan is extended once we have
                  matched your reference against our account — usually the same day. We will not charge you
                  automatically.
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {payment.appLinks.slice(0, 3).map((link) => (
                    <Button key={link.app} asChild size="sm" variant="outline">
                      <a href={link.href}>{link.label}</a>
                    </Button>
                  ))}
                  {payment.supportPhone ? (
                    <Button asChild size="sm">
                      <a href={`https://wa.me/${payment.supportPhone.replace(/[^\d]/g, '')}`}>
                        <Phone aria-hidden className="size-4" />
                        Send reference
                      </a>
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm">Renewals are handled by our team directly.</p>
              {payment.supportPhone ? (
                <Button asChild className="mt-3" size="sm">
                  <a href={`https://wa.me/${payment.supportPhone.replace(/[^\d]/g, '')}`}>
                    <Phone aria-hidden className="size-4" />
                    Message support
                  </a>
                </Button>
              ) : (
                <p className="mt-1 text-xs text-muted">
                  Payment details are not configured yet — contact us and we will send them to you.
                </p>
              )}
            </div>
          )}
        </Card>
      </section>

      <section>
        <SectionHeader
          title="Plans"
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/merchant/boost">
                <Rocket aria-hidden className="size-4" />
                Boost my shop
              </Link>
            </Button>
          }
        />
        <div className="grid gap-3 sm:grid-cols-3">
          {SUBSCRIPTION_PLANS.map((plan) => {
            const current = billing.plan?.tier === plan.tier;
            return (
              <Card
                key={plan.tier}
                className={current ? 'border-brand-400 p-4 ring-2 ring-brand-500/20' : 'p-4'}
              >
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-bold">{plan.name}</h3>
                  {current ? <Badge tone="brand">Your plan</Badge> : null}
                </div>
                <p className="mt-1 text-2xl font-extrabold tabular-nums">
                  {formatMinor(plan.priceMinor)}
                  <span className="text-xs font-medium text-muted">/month</span>
                </p>
                <p className="mt-1 text-xs text-muted">{plan.summary}</p>
                <ul className="mt-3 space-y-1.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2 text-xs">
                      <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-success-600" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">
          We take no commission on your orders on any plan. Customers pay you directly.
        </p>
      </section>

      {billing.payments.length > 0 ? (
        <section>
          <SectionHeader title="Your payments" />
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Date</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Plan</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Amount</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Covers</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {billing.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="px-4 py-3 tabular-nums text-muted">{formatDate(payment.createdAt)}</td>
                    <td className="px-4 py-3">{payment.tier}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {formatMinor(payment.amountMinor)}
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums text-muted">
                      {formatDate(payment.periodStart)} → {formatDate(payment.periodEnd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
