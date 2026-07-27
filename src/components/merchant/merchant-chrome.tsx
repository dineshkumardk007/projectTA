'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardList, CreditCard, LayoutGrid, QrCode, Rocket, Settings, UtensilsCrossed } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Billing and Boost are deliberately last on the phone bar and grouped at the
 * bottom on desktop: during service the only things that matter are orders and
 * the menu, and a mis-tap should never land on a payment screen.
 */
const NAV = [
  { href: '/merchant', label: 'Today', icon: LayoutGrid, exact: true },
  { href: '/merchant/orders', label: 'Orders', icon: ClipboardList, exact: false },
  { href: '/merchant/menu', label: 'Menu', icon: UtensilsCrossed, exact: false },
  { href: '/merchant/scan', label: 'Scan', icon: QrCode, exact: false },
  { href: '/merchant/boost', label: 'Boost', icon: Rocket, exact: false },
  { href: '/merchant/billing', label: 'Billing', icon: CreditCard, exact: false },
  { href: '/merchant/settings', label: 'Shop', icon: Settings, exact: false },
];

/**
 * Bottom navigation on phones, sidebar on desktop — merchants run this on
 * whatever they have, from a propped-up phone to a counter tablet.
 */
export function MerchantNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Merchant sections"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg',
        'lg:inset-y-0 lg:right-auto lg:w-56 lg:border-r lg:border-t-0 lg:pt-6',
      )}
    >
      <p className="hidden px-5 pb-6 text-lg font-extrabold lg:block">Takeaway</p>
      <ul className="mx-auto flex max-w-3xl overflow-x-auto lg:mx-0 lg:max-w-none lg:flex-col lg:gap-1 lg:overflow-visible lg:px-3">
        {NAV.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            // `min-w` keeps the tap target usable once there are seven items;
            // the bar scrolls rather than squeezing them into thumbnails.
            <li key={item.href} className="min-w-[68px] flex-1 lg:min-w-0 lg:flex-none">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors',
                  'lg:h-11 lg:flex-row lg:justify-start lg:gap-3 lg:rounded-[var(--radius-field)] lg:px-3 lg:text-sm',
                  active
                    ? 'text-brand-600 lg:bg-brand-50 dark:lg:bg-brand-900/30'
                    : 'text-muted hover:text-foreground lg:hover:bg-surface-muted',
                )}
              >
                <Icon aria-hidden className="size-5" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
