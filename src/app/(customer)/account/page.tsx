import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Heart, LayoutDashboard, LogIn, Receipt, Shield, Store } from 'lucide-react';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/guards';
import { Card } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { PushToggle } from '@/components/customer/push-toggle';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your account' };

export default async function AccountPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-extrabold">Your account</h1>
        <Card className="p-6 text-center">
          <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-surface-muted text-muted">
            <LogIn aria-hidden className="size-6" />
          </span>
          <p className="font-bold">Sign in to order ahead</p>
          <p className="mt-1 text-sm text-muted">
            Track orders, save favourite shops and reorder in one tap.
          </p>
          <div className="mt-5 grid gap-2">
            <Button asChild>
              <Link href="/signin">Sign in</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/signup">Create an account</Link>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const [favoriteCount, orderCount, savedMinutes] = await Promise.all([
    db.favoriteShop.count({ where: { userId: user.id } }),
    db.order.count({ where: { customerId: user.id } }),
    db.order.aggregate({ where: { customerId: user.id }, _sum: { waitMinutesSaved: true } }),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">Your account</h1>

      <Card className="p-5">
        <p className="text-lg font-bold">{user.name}</p>
        <p className="text-sm text-muted">{user.email}</p>
        {user.phone ? <p className="text-sm text-muted">{user.phone}</p> : null}

        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-[var(--radius-field)] bg-surface-muted p-3">
            <dt className="text-xs text-muted">Orders</dt>
            <dd className="text-lg font-extrabold">{orderCount}</dd>
          </div>
          <div className="rounded-[var(--radius-field)] bg-surface-muted p-3">
            <dt className="text-xs text-muted">Favourites</dt>
            <dd className="text-lg font-extrabold">{favoriteCount}</dd>
          </div>
          <div className="rounded-[var(--radius-field)] bg-surface-muted p-3">
            <dt className="text-xs text-muted">Minutes saved</dt>
            <dd className="text-lg font-extrabold">{savedMinutes._sum.waitMinutesSaved ?? 0}</dd>
          </div>
        </dl>
      </Card>

      <PushToggle vapidPublicKey={env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} />

      <Card className="divide-y divide-border">
        <AccountLink href="/orders" icon={<Receipt aria-hidden className="size-[18px]" />} label="Your orders" />
        <AccountLink
          href="/shops?favorites=1"
          icon={<Heart aria-hidden className="size-[18px]" />}
          label="Favourite shops"
        />
        {user.role === 'MERCHANT' || user.role === 'STAFF' ? (
          <AccountLink
            href="/merchant"
            icon={<Store aria-hidden className="size-[18px]" />}
            label="Merchant dashboard"
          />
        ) : null}
        {user.role === 'ADMIN' ? (
          <AccountLink
            href="/admin"
            icon={<Shield aria-hidden className="size-[18px]" />}
            label="Admin dashboard"
          />
        ) : null}
        {user.role === 'CUSTOMER' ? (
          <AccountLink
            href="/signup"
            icon={<LayoutDashboard aria-hidden className="size-[18px]" />}
            label="List your shop on Takeaway"
          />
        ) : null}
      </Card>

      <SignOutButton />
    </div>
  );
}

function AccountLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-muted">
      <span className="flex size-9 items-center justify-center rounded-full bg-surface-muted text-muted">{icon}</span>
      <span className="flex-1 text-sm font-semibold">{label}</span>
      <ChevronRight aria-hidden className="size-4 text-muted" />
    </Link>
  );
}
