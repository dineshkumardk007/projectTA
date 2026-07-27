/**
 * Backfills `Order.codeDate` for orders created before the column existed.
 *
 * Order codes reset daily and are only unique within a day, so every order needs
 * to know which day its code belongs to. Existing rows are derived from
 * `placedAt` rendered in the owning shop's timezone.
 *
 * Safe to re-run: it only touches rows where `codeDate` is still empty.
 *
 * Run once after deploying the `codeDate` / `timeZone` schema change:
 *   pnpm exec tsx scripts/backfill-code-date.ts
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

function localDate(timeZone: string, at: Date): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

async function main() {
  const orders = await db.order.findMany({
    where: { codeDate: '' },
    select: { id: true, placedAt: true, shop: { select: { timeZone: true } } },
  });

  if (orders.length === 0) {
    console.log('• Nothing to backfill.');
    return;
  }

  console.log(`• Backfilling codeDate for ${orders.length} order(s) …`);

  // Grouped by target value so this is a handful of updateMany calls rather than
  // one round trip per order.
  const byDate = new Map<string, string[]>();
  for (const order of orders) {
    const date = localDate(order.shop.timeZone, order.placedAt);
    byDate.set(date, [...(byDate.get(date) ?? []), order.id]);
  }

  for (const [date, ids] of byDate) {
    const result = await db.order.updateMany({ where: { id: { in: ids } }, data: { codeDate: date } });
    console.log(`  ${date}: ${result.count}`);
  }

  console.log('• Done.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
