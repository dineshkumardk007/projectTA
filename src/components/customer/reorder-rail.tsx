'use client';

import * as React from 'react';
import { Card, SectionHeader } from '@/components/ui/primitives';
import { formatMinor } from '@/lib/domain/money';
import { ReorderButton } from '@/components/customer/reorder-button';

/**
 * "Order again" rail for the daily-tea customer (persona 3).
 *
 * The rebuild itself lives in `ReorderButton`, which is shared with the order
 * history and the order detail screen, so all three behave identically.
 */

export type RecentOrder = {
  id: string;
  code: string;
  totalMinor: number;
  pickedUpAt: Date | null;
  shop: { id: string; name: string; slug: string };
  items: { nameSnapshot: string; quantity: number }[];
};

export function ReorderRail({ orders }: { orders: RecentOrder[] }) {
  return (
    <section aria-labelledby="reorder-heading">
      <SectionHeader title={<span id="reorder-heading">Order again</span>} />
      <div className="scroll-rail -mx-4 px-4 pb-1">
        {orders.map((order) => (
          <ReorderCard key={order.id} order={order} />
        ))}
      </div>
    </section>
  );
}

function ReorderCard({ order }: { order: RecentOrder }) {

  // The same product ordered with two different customisations is two rows.
  // Summed by name here, because "2 × Masala Dosa, 1 × Masala Dosa" reads as a
  // bug even though it is accurate.
  const summary = React.useMemo(() => {
    const totals = new Map<string, number>();
    for (const item of order.items) {
      totals.set(item.nameSnapshot, (totals.get(item.nameSnapshot) ?? 0) + item.quantity);
    }
    return [...totals].map(([name, quantity]) => `${quantity} × ${name}`).join(', ');
  }, [order.items]);

  return (
    <Card className="w-64 p-4">
      <p className="truncate text-sm font-bold">{order.shop.name}</p>
      <p className="mt-1 line-clamp-2 h-9 text-xs text-muted">{summary}</p>
      <p className="mt-2 text-sm font-bold">{formatMinor(order.totalMinor)}</p>
      <ReorderButton orderId={order.id} className="mt-3 w-full" />
    </Card>
  );
}
