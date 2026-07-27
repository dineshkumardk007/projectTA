import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/guards';
import { listCategories, listShops, type DiscoveryFilters } from '@/lib/services/shops';
import { CategoryScroller, SearchBar } from '@/components/customer/discovery-bits';
import { ShopGrid } from '@/components/customer/shop-grid';
import { ShopCardSkeleton } from '@/components/ui/states';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Explore shops' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const SORTS = [
  { key: 'nearest', label: 'Nearest' },
  { key: 'fastest', label: 'Ready fastest' },
  { key: 'popular', label: 'Most popular' },
] as const;

async function ShopResults({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const user = await getCurrentUser();

  const filters: DiscoveryFilters = {
    query: single(params.q),
    categorySlug: single(params.category),
    openNow: single(params.openNow) === '1',
    readyFast: single(params.readyFast) === '1',
    favoritesOnly: single(params.favorites) === '1',
    sort: (single(params.sort) as DiscoveryFilters['sort']) ?? 'nearest',
  };

  const [categories, shops] = await Promise.all([
    listCategories(),
    listShops({ filters, viewerId: user?.id }),
  ]);

  // Rebuilds the current URL with one filter flipped, preserving the rest.
  function hrefWith(changes: Record<string, string | undefined>): string {
    const next = new URLSearchParams();
    const current: Record<string, string | undefined> = {
      q: filters.query,
      category: filters.categorySlug,
      openNow: filters.openNow ? '1' : undefined,
      readyFast: filters.readyFast ? '1' : undefined,
      favorites: filters.favoritesOnly ? '1' : undefined,
      sort: filters.sort,
      ...changes,
    };
    for (const [key, value] of Object.entries(current)) {
      if (value) next.set(key, value);
    }
    const query = next.toString();
    return query ? `/shops?${query}` : '/shops';
  }

  const activeFilterCount = [filters.openNow, filters.readyFast, filters.favoritesOnly].filter(Boolean).length;

  return (
    <div className="space-y-5">
      <SearchBar defaultValue={filters.query} />

      <CategoryScroller categories={categories} activeSlug={filters.categorySlug} />

      <div className="scroll-rail -mx-4 px-4">
        <FilterChip href={hrefWith({ openNow: filters.openNow ? undefined : '1' })} active={Boolean(filters.openNow)}>
          Open now
        </FilterChip>
        <FilterChip href={hrefWith({ readyFast: filters.readyFast ? undefined : '1' })} active={Boolean(filters.readyFast)}>
          Ready fast
        </FilterChip>
        <FilterChip
          href={hrefWith({ favorites: filters.favoritesOnly ? undefined : '1' })}
          active={Boolean(filters.favoritesOnly)}
        >
          Favourites
        </FilterChip>
        <span aria-hidden className="mx-1 w-px shrink-0 self-stretch bg-border" />
        {SORTS.map((sort) => (
          <FilterChip key={sort.key} href={hrefWith({ sort: sort.key })} active={filters.sort === sort.key}>
            {sort.label}
          </FilterChip>
        ))}
      </div>

      <div className="flex items-baseline justify-between">
        <p className="text-sm text-muted">
          {shops.length} {shops.length === 1 ? 'shop' : 'shops'}
          {filters.query ? ` matching “${filters.query}”` : ''}
        </p>
        {activeFilterCount > 0 || filters.query || filters.categorySlug ? (
          <Link href="/shops" className="text-sm font-semibold text-brand-600">
            Clear filters
          </Link>
        ) : null}
      </div>

      <ShopGrid
        shops={shops}
        sort={filters.sort}
        emptyTitle={filters.query ? `Nothing matched “${filters.query}”` : 'No shops match those filters'}
        emptyDescription="Try widening your search, or clear the filters to see everything nearby."
        emptyAction={
          <Button asChild variant="outline">
            <Link href="/shops">Clear filters</Link>
          </Button>
        }
      />
    </div>
  );
}

function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-pressed={active}
      className={cn(
        'rounded-[var(--radius-pill)] border px-3.5 py-2 text-sm font-semibold transition-colors',
        active
          ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
          : 'border-border bg-surface text-muted hover:text-foreground',
      )}
    >
      {children}
    </Link>
  );
}

export default function ShopsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense
      fallback={
        <div className="grid gap-3 sm:grid-cols-2">
          <ShopCardSkeleton />
          <ShopCardSkeleton />
          <ShopCardSkeleton />
          <ShopCardSkeleton />
        </div>
      }
    >
      <ShopResults searchParams={searchParams} />
    </Suspense>
  );
}
