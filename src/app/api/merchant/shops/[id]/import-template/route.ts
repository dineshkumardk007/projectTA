import { db } from '@/lib/db';
import { requireShopAccess, requireUser } from '@/lib/auth/guards';
import { DomainError, ok, route } from '@/lib/api';
import { CATALOG_TEMPLATES } from '@/lib/domain/templates';
import { z } from 'zod';

/**
 * Bulk-imports a starter catalogue into a shop.
 *
 * Lives under `[id]` rather than `[shopId]`: Next.js requires every route
 * sharing a dynamic path to use the same slug name, and the sibling
 * `shops/[id]/{board,status}` routes established `id` first. The public URL is
 * unchanged either way.
 */
const importSchema = z.object({
  templateId: z.string().min(1, 'Template ID is required'),
});

export const POST = route(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id: shopId } = await context.params;

  const user = await requireUser(['MERCHANT', 'STAFF', 'ADMIN']);
  await requireShopAccess(shopId, user);

  const body = importSchema.parse(await request.json());
  const template = CATALOG_TEMPLATES[body.templateId];

  if (!template) {
    throw new DomainError('Invalid template ID selected.', 400, 'invalid_template');
  }

  // Execute bulk insertion in a single transaction
  const importedCount = await db.$transaction(async (tx) => {
    let totalProductsCreated = 0;

    for (let i = 0; i < template.categories.length; i++) {
      const cat = template.categories[i]!;

      // Find or create MenuCategory
      let menuCategory = await tx.menuCategory.findFirst({
        where: { shopId, name: cat.categoryName },
      });

      if (!menuCategory) {
        menuCategory = await tx.menuCategory.create({
          data: {
            shopId,
            name: cat.categoryName,
            sortOrder: i * 10,
          },
        });
      }

      // Add products to menu category
      for (let j = 0; j < cat.products.length; j++) {
        const prod = cat.products[j]!;
        await tx.product.create({
          data: {
            shopId,
            menuCategoryId: menuCategory.id,
            name: prod.name,
            priceMinor: prod.priceMinor,
            prepMinutes: prod.prepMinutes,
            unitLabel: prod.unitLabel,
            description: prod.description ?? null,
            isPopular: prod.isPopular ?? false,
            sortOrder: j * 10,
          },
        });
        totalProductsCreated++;
      }
    }

    return totalProductsCreated;
  });

  return ok({ message: `Successfully imported ${importedCount} items into your shop catalog.`, importedCount });
});
