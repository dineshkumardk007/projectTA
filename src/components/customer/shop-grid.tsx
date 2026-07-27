'use client';

import * as React from 'react';
import Link from 'next/link';
import { Store } from 'lucide-react';
import { ShopCard } from '@/components/customer/shop-card';
import { EmptyState } from '@/components/ui/states';
import { Button } from '@/components/ui/button';
import { useLocation } from '@/components/customer/location-store';
import { haversineKm } from '@/lib/providers/maps';
import type { ShopSummary } from '@/lib/services/shops';

/**
 * Renders a list of shops, re-sorting by true distance the moment the browser
 * reports a position. Doing this on the client means granting location
 * permission reorders the list instantly instead of triggering a refetch.
 */
export function ShopGrid({
  shops,
  sort = 'nearest',
  emptyTitle = 'No shops found nearby',
  emptyDescription = 'Try a different category, or search for something specific.',
  emptyAction,
}: {
  shops: ShopSummary[];
  sort?: 'nearest' | 'fastest' | 'popular';
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
}) {
  const { coords, status } = useLocation();

  const ordered = React.useMemo(() => {
    if (sort !== 'nearest' || status !== 'granted' || !coords) return shops;

    return [...shops].sort((a, b) => {
      if (a.orderability.canOrder !== b.orderability.canOrder) return a.orderability.canOrder ? -1 : 1;
      return haversineKm(coords, a) - haversineKm(coords, b);
    });
  }, [shops, sort, coords, status]);

  if (ordered.length === 0) {
    return (
      <EmptyState
        icon={<Store aria-hidden className="size-7" />}
        title={emptyTitle}
        description={emptyDescription}
        action={
          emptyAction ?? (
            <Button asChild variant="outline">
              <Link href="/shops">Browse all shops</Link>
            </Button>
          )
        }
      />
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {ordered.map((shop) => (
        <ShopCard key={shop.id} shop={shop} />
      ))}
    </div>
  );
}
