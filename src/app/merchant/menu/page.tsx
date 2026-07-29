import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requireMerchantContext } from '@/lib/services/merchant';
import { MenuManager } from '@/components/merchant/menu-manager';
import { shopLocalDate } from '@/lib/domain/local-date';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Menu' };

export default async function MerchantMenuPage() {
  const { shop } = await requireMerchantContext();

  const [products, sections] = await Promise.all([
    db.product.findMany({
      where: { shopId: shop.id },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        menuCategory: { select: { name: true } },
        optionGroups: { orderBy: { sortOrder: 'asc' }, include: { options: { orderBy: { sortOrder: 'asc' } } } },
      },
    }),
    db.menuCategory.findMany({ where: { shopId: shop.id }, orderBy: { sortOrder: 'asc' } }),
  ]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-extrabold">Menu</h1>
        <p className="text-sm text-muted">
          Tap an item to edit it, or tap its availability chip to take it off the menu instantly.
        </p>
      </header>

      <MenuManager
        shopId={shop.id}
        sections={sections.map((s) => ({ id: s.id, name: s.name }))}
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          description: product.description,
          imageUrl: product.imageUrl,
          priceMinor: product.priceMinor,
          prepMinutes: product.prepMinutes,
          unitLabel: product.unitLabel,
          availability: product.availability,
          isPopular: product.isPopular,
          isTodaysSpecial: product.specialOn === shopLocalDate(shop.timeZone),
          specialNote: product.specialNote,
          menuCategoryId: product.menuCategoryId,
          sectionName: product.menuCategory?.name ?? 'Uncategorised',
          optionGroups: product.optionGroups.map((group) => ({
            id: group.id,
            name: group.name,
            minSelect: group.minSelect,
            maxSelect: group.maxSelect,
            options: group.options.map((option) => ({
              id: option.id,
              name: option.name,
              priceDeltaMinor: option.priceDeltaMinor,
              prepDeltaMinutes: option.prepDeltaMinutes,
              isAvailable: option.isAvailable,
            })),
          })),
        }))}
      />
    </div>
  );
}
