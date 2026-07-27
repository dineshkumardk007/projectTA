'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { Search, Zap, MapPin, Heart, History } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Search field, category rail and quick actions — shared by home and explore. */

export function SearchBar({
  defaultValue = '',
  autoFocus = false,
  placeholder = 'Search shops or food',
}: {
  defaultValue?: string;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(defaultValue);

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const query = value.trim();
        router.push(query ? `/shops?q=${encodeURIComponent(query)}` : '/shops');
      }}
      className="relative"
    >
      <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted" />
      <input
        type="search"
        name="q"
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        aria-label="Search shops or food"
        className={cn(
          'h-13 w-full rounded-[var(--radius-field)] border border-border bg-surface pl-11 pr-4',
          'text-[15px] shadow-[var(--shadow-card)] placeholder:text-ink-400',
          'focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-500/15',
        )}
      />
    </form>
  );
}

export function CategoryScroller({
  categories,
  activeSlug,
  basePath = '/shops',
}: {
  categories: { slug: string; name: string; emoji: string }[];
  activeSlug?: string;
  basePath?: string;
}) {
  return (
    <nav aria-label="Categories" className="scroll-rail -mx-4 px-4 py-1">
      {categories.map((category) => {
        const active = activeSlug === category.slug;
        return (
          <Link
            key={category.slug}
            href={active ? basePath : `${basePath}?category=${category.slug}`}
            aria-current={active ? 'true' : undefined}
            className={cn(
              'flex items-center gap-2 rounded-[var(--radius-pill)] border px-4 py-2.5 text-sm font-semibold transition-colors',
              active
                ? 'border-brand-500 bg-brand-500 text-white'
                : 'border-border bg-surface text-foreground hover:bg-surface-muted',
            )}
          >
            <span aria-hidden className="text-base">
              {category.emoji}
            </span>
            {category.name}
          </Link>
        );
      })}
    </nav>
  );
}

const QUICK_ACTIONS = [
  { href: '/shops?sort=nearest', label: 'Nearby', icon: MapPin },
  { href: '/shops?readyFast=1', label: 'Ready fast', icon: Zap },
  { href: '/shops?favorites=1', label: 'Favourites', icon: Heart },
  { href: '/orders', label: 'Recent orders', icon: History },
];

export function QuickActions() {
  return (
    <ul className="grid grid-cols-4 gap-2">
      {QUICK_ACTIONS.map((action) => {
        const Icon = action.icon;
        return (
          <li key={action.href}>
            <Link
              href={action.href}
              className="flex h-full flex-col items-center gap-2 rounded-[var(--radius-card)] border border-border bg-surface px-2 py-3 text-center transition-colors hover:bg-surface-muted"
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
                <Icon aria-hidden className="size-[18px]" />
              </span>
              <span className="text-[11px] font-semibold leading-tight">{action.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

