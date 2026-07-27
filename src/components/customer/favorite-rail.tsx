'use client';

import * as React from 'react';
import Link from 'next/link';
import { Heart } from 'lucide-react';
import { SectionHeader } from '@/components/ui/primitives';

export type FavoriteShopItem = {
  id: string;
  name: string;
  slug: string;
  emoji: string;
  tagline?: string | null;
};

export function FavoriteRail({ shops }: { shops: FavoriteShopItem[] }) {
  if (!shops || shops.length === 0) return null;

  return (
    <section aria-labelledby="favorites-heading" className="space-y-2">
      <SectionHeader
        title={
          <span id="favorites-heading" className="flex items-center gap-1.5 text-danger-600">
            <Heart className="size-4 fill-danger-500 text-danger-500" />
            My Daily Favorites
          </span>
        }
      />
      <div className="scroll-rail -mx-4 px-4 pb-2">
        {shops.map((shop) => (
          <Link
            key={shop.id}
            href={`/shops/${shop.slug}`}
            className="flex items-center gap-2.5 rounded-2xl border border-brand-500/20 bg-surface p-2.5 shadow-sm transition-all hover:scale-[1.02] hover:border-brand-500 shrink-0"
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-brand-500/10 text-xl">
              {shop.emoji}
            </span>
            <div className="min-w-0 pr-1">
              <p className="truncate text-xs font-bold text-foreground">{shop.name}</p>
              {shop.tagline ? <p className="truncate text-[10px] text-muted">{shop.tagline}</p> : null}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
