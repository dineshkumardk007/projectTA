'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const LINKS = [
  { href: '/admin', label: 'Overview', exact: true },
  { href: '/admin/merchants', label: 'Merchants' },
  { href: '/admin/shops', label: 'Shops' },
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/settings', label: 'Settings' },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin sections" className="mx-auto max-w-6xl px-4">
      <ul className="scroll-rail -mx-1 pb-2">
        {LINKS.map((link) => {
          const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'block rounded-[var(--radius-pill)] px-3.5 py-2 text-sm font-semibold transition-colors',
                  active ? 'bg-brand-500 text-white' : 'text-muted hover:bg-surface-muted hover:text-foreground',
                )}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
