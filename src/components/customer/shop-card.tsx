'use client';

import Link from 'next/link';
import { Heart, Sparkles } from 'lucide-react';
import { formatMinor } from '@/lib/domain/money';
import { Card } from '@/components/ui/primitives';
import { ImageOrPlaceholder } from '@/components/ui/generated-image';
import { DistanceBadge, PreparationTimeBadge, ShopStatusBadge } from '@/components/shop/badges';
import { useLocation } from '@/components/customer/location-store';
import { haversineKm } from '@/lib/providers/maps';
import type { ShopSummary } from '@/lib/services/shops';
import { cn } from '@/lib/cn';

/**
 * The discovery card.
 *
 * Everything a customer needs to decide *without opening the shop* is on the
 * face of it: is it open, how long until my order is ready, how far away is it.
 * Distance is computed on the client from the shop's coordinates so it appears
 * the instant location is granted, with no extra request.
 */
export function ShopCard({ shop, className }: { shop: ShopSummary; className?: string }) {
  const { coords } = useLocation();
  const distanceKm = coords ? Number(haversineKm(coords, shop).toFixed(2)) : shop.distanceKm;
  const closed = !shop.orderability.canOrder;

  return (
    <Card
      className={cn(
        'group relative overflow-hidden transition-shadow duration-200 hover:shadow-[var(--shadow-raised)]',
        className,
      )}
    >
      <Link href={`/shops/${shop.slug}`} className="block focus-visible:outline-none">
        <div className="relative">
          <ImageOrPlaceholder
            src={shop.coverImageUrl}
            alt=""
            seed={shop.slug}
            emoji={shop.categoryEmoji}
            rounded="none"
            className={cn('h-32 w-full sm:h-36', closed && 'opacity-60 grayscale')}
          />
          <div className="absolute left-3 top-3">
            <ShopStatusBadge orderability={shop.orderability} className="shadow-sm backdrop-blur" />
          </div>
          {shop.isFavorite ? (
            <span className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full bg-surface/90 text-brand-600 shadow-sm">
              <Heart aria-hidden className="size-4 fill-current" />
              <span className="sr-only">Saved to favourites</span>
            </span>
          ) : null}
        </div>

        <div className="p-4">
          <h3 className="text-base font-bold leading-tight">{shop.name}</h3>
          <p className="mt-0.5 truncate text-sm text-muted">
            {shop.tags.length > 0 ? shop.tags.join(' • ') : shop.categoryName}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            {shop.orderability.canOrder ? (
              <PreparationTimeBadge rangeLow={shop.prepRangeLow} rangeHigh={shop.prepRangeHigh} />
            ) : (
              <span className="text-xs font-medium text-muted">{shop.orderability.reason}</span>
            )}
            <DistanceBadge km={distanceKm} />
          </div>

          {shop.todaysSpecials.length === 0 && shop.popularItems.length > 0 ? (
            <p className="mt-2.5 truncate text-xs text-muted">Popular: {shop.popularItems.join(', ')}</p>
          ) : null}
        </div>
      </Link>

      {/* Outside the card's own <Link>: nesting links is invalid HTML and breaks
          keyboard navigation. These chips are the shortcut the whole feature
          exists for — one tap from discovery to the exact item. */}
      {shop.todaysSpecials.length > 0 ? (
        <div className="px-4 pb-4">
          <p className="mb-1.5 flex items-center gap-1 text-xs font-bold text-brand-600">
            <Sparkles aria-hidden className="size-3.5" />
            Today&rsquo;s special
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {shop.todaysSpecials.map((special) => (
              <li key={special.id}>
                <Link
                  href={`/shops/${shop.slug}?item=${special.id}`}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-brand-200 bg-brand-50 px-2.5 py-1.5',
                    'text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-100',
                    'dark:border-brand-800 dark:bg-brand-900/40 dark:text-brand-200 dark:hover:bg-brand-900/60',
                  )}
                >
                  {special.name}
                  <span className="font-bold">{formatMinor(special.priceMinor)}</span>
                </Link>
              </li>
            ))}
          </ul>
          {shop.todaysSpecials[0]?.note ? (
            <p className="mt-1.5 truncate text-xs text-muted">{shop.todaysSpecials[0].note}</p>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

/** Compact horizontal variant used in "Ready fast" rails. */
export function ShopCardCompact({ shop }: { shop: ShopSummary }) {
  const { coords } = useLocation();
  const distanceKm = coords ? Number(haversineKm(coords, shop).toFixed(2)) : shop.distanceKm;

  return (
    <Card className="w-60 overflow-hidden transition-shadow hover:shadow-[var(--shadow-raised)]">
      <Link href={`/shops/${shop.slug}`} className="block">
        <ImageOrPlaceholder
          src={shop.coverImageUrl}
          alt=""
          seed={shop.slug}
          emoji={shop.categoryEmoji}
          rounded="none"
          className="h-24 w-full"
        />
        <div className="p-3">
          <h3 className="truncate text-sm font-bold">{shop.name}</h3>
          <div className="mt-2 flex items-center gap-2">
            <PreparationTimeBadge rangeLow={shop.prepRangeLow} rangeHigh={shop.prepRangeHigh} />
            <DistanceBadge km={distanceKm} />
          </div>
        </div>
      </Link>
    </Card>
  );
}
