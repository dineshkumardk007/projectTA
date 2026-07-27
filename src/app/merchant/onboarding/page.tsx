import type { Metadata } from 'next';
import { Clock, Store } from 'lucide-react';
import { db } from '@/lib/db';
import { requireUserPage } from '@/lib/auth/guards';
import { Card } from '@/components/ui/primitives';
import { SignOutButton } from '@/components/auth/sign-out-button';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Getting started' };

/**
 * Where a merchant lands before they have a live shop.
 *
 * Shop creation in the MVP is a guided, human step (the launch plan is to
 * onboard 10–20 shops by hand and build their menus with them), so this screen
 * explains where things stand rather than pretending self-serve setup exists.
 */
export default async function MerchantOnboardingPage() {
  const user = await requireUserPage(['MERCHANT', 'STAFF', 'ADMIN'], '/signin?next=/merchant');
  const merchant = await db.merchant.findUnique({ where: { userId: user.id } });

  const pending = merchant?.verificationStatus === 'PENDING';
  const rejected = merchant?.verificationStatus === 'REJECTED';

  return (
    <div className="mx-auto max-w-lg py-8">
      <Card className="p-6">
        <span className="mb-4 flex size-12 items-center justify-center rounded-[16px] bg-brand-50 text-brand-600 dark:bg-brand-900/40">
          {pending ? <Clock aria-hidden className="size-6" /> : <Store aria-hidden className="size-6" />}
        </span>

        <h1 className="text-2xl font-extrabold">
          {rejected ? 'Your application was not approved' : pending ? 'We are reviewing your shop' : 'No shop yet'}
        </h1>

        <p className="mt-2 text-sm text-muted">
          {rejected
            ? merchant?.verificationNote ??
              'Please contact support if you think this was a mistake.'
            : pending
              ? `Thanks for signing up${merchant ? `, ${merchant.businessName}` : ''}. Our team verifies every shop before it appears to customers, and will set up your menu with you. This usually takes a day.`
              : 'Your account is not linked to a shop yet. Ask the shop owner to add you as staff, or contact support to list a new shop.'}
        </p>

        <dl className="mt-6 space-y-3 border-t border-border pt-5 text-sm">
          <div>
            <dt className="font-bold">What happens next</dt>
            <dd className="mt-1 text-muted">
              We confirm your details, help you build your menu, and give you a printed QR poster for your counter.
            </dd>
          </div>
          <div>
            <dt className="font-bold">What it costs</dt>
            <dd className="mt-1 text-muted">
              Onboarding is free while we are launching in your area. Pricing is confirmed with you before anything
              is charged.
            </dd>
          </div>
        </dl>

        <div className="mt-6">
          <SignOutButton />
        </div>
      </Card>
    </div>
  );
}
