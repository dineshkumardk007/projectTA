'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { Bell, Home, Receipt, Search, ShoppingBag, User, MapPin, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useLocation } from '@/components/customer/location-store';
import { useCart } from '@/components/customer/cart-store';
import { formatMinor } from '@/lib/domain/money';

/** Header, bottom navigation and the floating cart bar. */

export function CustomerHeader({
  unreadCount,
  signedIn,
}: {
  /**
   * Unresolved on purpose. The layout hands the query over rather than awaiting
   * it, so a slow count cannot hold up the page behind it — the badge streams in
   * on its own once the database answers.
   */
  unreadCount: Promise<number>;
  signedIn: boolean;
}) {
  const { label, status, request } = useLocation();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-canvas/85 backdrop-blur-lg">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={request}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          aria-label="Set your location"
        >
          {status === 'requesting' ? (
            <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-brand-500" />
          ) : (
            <MapPin aria-hidden className="size-4 shrink-0 text-brand-500" />
          )}
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold leading-tight">{label}</span>
            <span className="block text-[11px] leading-tight text-muted">
              {status === 'granted'
                ? 'Showing shops near you'
                : status === 'denied'
                  ? 'Location off — tap to retry'
                  : 'Tap to use your location'}
            </span>
          </span>
        </button>

        <Link
          href="/notifications"
          className="relative flex size-10 items-center justify-center rounded-full bg-surface text-foreground shadow-[var(--shadow-card)]"
          aria-label="Notifications"
        >
          <Bell aria-hidden className="size-[18px]" />
          {/* No fallback: an empty bell is the right thing to show while the
              count is still in flight, and it never shifts the layout. */}
          <React.Suspense fallback={null}>
            <UnreadBadge countPromise={unreadCount} />
          </React.Suspense>
        </Link>

        <Link
          href={signedIn ? '/account' : '/signin'}
          className="flex size-10 items-center justify-center rounded-full bg-surface text-foreground shadow-[var(--shadow-card)]"
          aria-label={signedIn ? 'Your account' : 'Sign in'}
        >
          <User aria-hidden className="size-[18px]" />
        </Link>
      </div>
    </header>
  );
}

function UnreadBadge({ countPromise }: { countPromise: Promise<number> }) {
  const count = React.use(countPromise);
  if (count <= 0) return null;

  return (
    <span className="absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">
      {count > 9 ? '9+' : count}
      <span className="sr-only"> unread notifications</span>
    </span>
  );
}

const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: Home, exact: true },
  { href: '/shops', label: 'Explore', icon: Search, exact: false },
  { href: '/orders', label: 'Orders', icon: Receipt, exact: false },
  { href: '/account', label: 'Account', icon: User, exact: false },
];

export function CustomerBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg"
    >
      <ul className="mx-auto flex max-w-3xl">
        {NAV_ITEMS.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors',
                  active ? 'text-brand-600' : 'text-muted hover:text-foreground',
                )}
              >
                <Icon aria-hidden className={cn('size-5', active && 'scale-110')} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Sticky cart bar. Stays visible while browsing so the cart is never more than
 * one tap away, and sits above the bottom nav rather than covering it.
 */
export function FloatingCartBar() {
  const { cart, itemCount, subtotalMinor, hydrated } = useCart();
  const pathname = usePathname();

  // Hidden where it would be noise or a duplicate action.
  const hiddenOn = ['/cart', '/checkout'];
  if (!hydrated || !cart || itemCount === 0 || hiddenOn.some((p) => pathname.startsWith(p))) return null;

  return (
    <div className="fixed inset-x-0 bottom-16 z-40 px-3 pb-2">
      <Link
        href="/cart"
        className={cn(
          'animate-rise mx-auto flex max-w-3xl items-center gap-3 rounded-[var(--radius-field)]',
          'bg-brand-500 px-4 py-3.5 text-white shadow-[var(--shadow-raised)]',
          'transition-transform active:scale-[0.99]',
        )}
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-white/20">
          <ShoppingBag aria-hidden className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold leading-tight">
            {itemCount} {itemCount === 1 ? 'item' : 'items'} · {formatMinor(subtotalMinor)}
          </span>
          <span className="block truncate text-xs leading-tight text-white/80">{cart.shopName}</span>
        </span>
        <span className="rounded-[var(--radius-pill)] bg-white/20 px-3 py-1.5 text-sm font-bold">View cart</span>
      </Link>
    </div>
  );
}
