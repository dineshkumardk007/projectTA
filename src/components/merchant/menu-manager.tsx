'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import type { ProductAvailability } from '@prisma/client';
import { Badge, Card, Input, Label, Select, Textarea } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { useToast } from '@/components/ui/toast';
import { OptionGroupEditor, type EditableGroup } from '@/components/merchant/option-group-editor';
import { ImageUploadField } from '@/components/merchant/image-upload-field';
import { formatMinor } from '@/lib/domain/money';
import { cn } from '@/lib/cn';

/**
 * Menu management.
 *
 * Availability is the action a merchant performs constantly (the samosas ran
 * out), so it is a single tap directly on the row. Editing price or preparation
 * time is rarer and lives behind a sheet.
 */

export type ManagedProduct = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceMinor: number;
  prepMinutes: number;
  unitLabel: string;
  availability: ProductAvailability;
  isPopular: boolean;
  /** Flagged for today only — clears itself when the shop's day rolls over. */
  isTodaysSpecial: boolean;
  specialNote: string | null;
  menuCategoryId: string | null;
  sectionName: string;
  optionGroups: EditableGroup[];
};

const AVAILABILITY_LABEL: Record<ProductAvailability, string> = {
  AVAILABLE: 'Available',
  OUT_OF_STOCK: 'Out of stock',
  TEMPORARILY_UNAVAILABLE: 'Unavailable',
};

export function MenuManager({
  shopId,
  products: initialProducts,
  sections,
}: {
  shopId: string;
  products: ManagedProduct[];
  sections: { id: string; name: string }[];
}) {
  const [products, setProducts] = React.useState(initialProducts);
  const [editing, setEditing] = React.useState<ManagedProduct | null>(null);
  const [choicesFor, setChoicesFor] = React.useState<ManagedProduct | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [addingSection, setAddingSection] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  // Re-sync from the server after router.refresh(), so an open sheet shows the
  // choices that were just saved rather than the snapshot it opened with.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => setProducts(initialProducts), [initialProducts]);

  async function patch(product: ManagedProduct, changes: Partial<ManagedProduct>) {
    setBusyId(product.id);
    const previous = products;
    setProducts((current) => current.map((p) => (p.id === product.id ? { ...p, ...changes } : p)));

    try {
      const response = await fetch(`/api/merchant/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(changes),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setProducts(previous);
        toast(data.error ?? 'We could not save that change.', 'error');
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setProducts(previous);
      toast('We could not reach the server.', 'error');
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function remove(product: ManagedProduct) {
    setBusyId(product.id);
    try {
      const response = await fetch(`/api/merchant/products/${product.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        toast(data.error ?? 'We could not remove that item.', 'error');
        return;
      }
      setProducts((current) => current.filter((p) => p.id !== product.id));
      setEditing(null);
      toast(`${product.name} removed from the menu`);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  const grouped = sections
    .map((section) => ({ section, items: products.filter((p) => p.menuCategoryId === section.id) }))
    .filter((group) => group.items.length > 0);

  const uncategorised = products.filter((p) => !p.menuCategoryId);
  if (uncategorised.length > 0) {
    grouped.push({ section: { id: '__other', name: 'Uncategorised' }, items: uncategorised });
  }

  const [importingTemplate, setImportingTemplate] = React.useState(false);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Button size="action" className="flex-1" onClick={() => setCreating(true)}>
          <Plus aria-hidden className="size-4" />
          Add an item
        </Button>
        <Button size="action" variant="outline" className="flex-1" onClick={() => setAddingSection(true)}>
          <Plus aria-hidden className="size-4" />
          Add a section
        </Button>
        <Button size="action" variant="primary" className="w-full sm:w-auto" onClick={() => setImportingTemplate(true)}>
          ⚡ Import Standard Catalog
        </Button>
      </div>

      {grouped.map(({ section, items }) => (
        <section key={section.id}>
          <h2 className="mb-2 text-lg font-bold">{section.name}</h2>
          <Card className="divide-y divide-border">
            {items.map((product) => (
              <div key={product.id} className="flex items-center gap-3 p-3.5">
                <button
                  type="button"
                  onClick={() => setEditing(product)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="flex items-center gap-2">
                    <span className="truncate font-bold">{product.name}</span>
                    {product.isTodaysSpecial ? <Badge tone="brand">Today&rsquo;s special</Badge> : null}
                    {product.isPopular && !product.isTodaysSpecial ? <Badge tone="neutral">Popular</Badge> : null}
                  </span>
                  <span className="mt-0.5 block text-sm text-muted">
                    {formatMinor(product.priceMinor)}
                    {product.unitLabel ? ` · ${product.unitLabel}` : ''} · {product.prepMinutes} min
                  </span>
                </button>

                {/* One tap to put an item on the shop front. Sits on the row
                    rather than behind the edit sheet because a merchant decides
                    the day's special once each morning, in a hurry. */}
                <button
                  type="button"
                  disabled={busyId === product.id}
                  onClick={() => patch(product, { isTodaysSpecial: !product.isTodaysSpecial })}
                  aria-pressed={product.isTodaysSpecial}
                  title={
                    product.isTodaysSpecial
                      ? `Remove ${product.name} from today's special`
                      : `Make ${product.name} today's special`
                  }
                  className={cn(
                    'shrink-0 rounded-[var(--radius-pill)] px-2.5 py-2 text-xs font-bold transition-colors disabled:opacity-50',
                    product.isTodaysSpecial
                      ? 'bg-brand-500 text-white'
                      : 'bg-surface-muted text-muted hover:text-foreground',
                  )}
                >
                  ★<span className="sr-only">Today&rsquo;s special</span>
                </button>

                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0"
                  onClick={() => setChoicesFor(product)}
                >
                  {product.optionGroups.length > 0
                    ? `${product.optionGroups.length} choice${product.optionGroups.length === 1 ? '' : 's'}`
                    : 'Choices'}
                </Button>

                <button
                  type="button"
                  disabled={busyId === product.id}
                  onClick={() =>
                    patch(product, {
                      availability: product.availability === 'AVAILABLE' ? 'OUT_OF_STOCK' : 'AVAILABLE',
                    })
                  }
                  aria-pressed={product.availability === 'AVAILABLE'}
                  className={cn(
                    'shrink-0 rounded-[var(--radius-pill)] px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50',
                    product.availability === 'AVAILABLE'
                      ? 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-100'
                      : 'bg-danger-50 text-danger-700 dark:bg-danger-500/15 dark:text-danger-100',
                  )}
                >
                  {AVAILABILITY_LABEL[product.availability]}
                </button>
              </div>
            ))}
          </Card>
        </section>
      ))}

      {editing ? (
        <ProductSheet
          key={editing.id}
          product={editing}
          sections={sections}
          shopId={shopId}
          busy={busyId === editing.id}
          onClose={() => setEditing(null)}
          onSave={async (changes) => {
            const saved = await patch(editing, changes);
            if (saved) {
              toast('Menu updated');
              setEditing(null);
            }
          }}
          onDelete={() => remove(editing)}
        />
      ) : null}

      {choicesFor ? (
        <OptionGroupEditor
          key={choicesFor.id}
          productId={choicesFor.id}
          productName={choicesFor.name}
          groups={products.find((p) => p.id === choicesFor.id)?.optionGroups ?? choicesFor.optionGroups}
          onClose={() => setChoicesFor(null)}
        />
      ) : null}

      {addingSection ? (
        <SectionSheet
          shopId={shopId}
          onClose={() => setAddingSection(false)}
          onSaved={() => {
            setAddingSection(false);
            router.refresh();
          }}
        />
      ) : null}

      {creating ? (
        <ProductSheet
          sections={sections}
          shopId={shopId}
          busy={false}
          onClose={() => setCreating(false)}
          onSave={async (changes) => {
            const response = await fetch('/api/merchant/products', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ shopId, ...changes }),
            });
            const data = (await response.json()) as { error?: string };
            if (!response.ok) {
              toast(data.error ?? 'We could not add that item.', 'error');
              return;
            }
            toast('Item added to your menu');
            setCreating(false);
            router.refresh();
          }}
        />
      ) : null}

      {importingTemplate ? (
        <TemplateImportSheet
          shopId={shopId}
          onClose={() => setImportingTemplate(false)}
          onImported={() => {
            setImportingTemplate(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function SectionSheet({
  shopId,
  onClose,
  onSaved,
}: {
  shopId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const { toast } = useToast();

  async function save() {
    if (!name.trim()) return setError('Give the section a name.');
    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/merchant/menu-sections', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ shopId, name: name.trim() }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? 'We could not add that section.');
        return;
      }
      toast(`"${name.trim()}" added to your menu`);
      onSaved();
    } catch {
      setError('We could not reach the server.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Add a menu section"
      description="Sections group your menu — Tea, Snacks, Breakfast."
      footer={
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" loading={saving} onClick={save}>
            Add section
          </Button>
        </div>
      }
    >
      <Label htmlFor="section-name">Section name</Label>
      <Input
        id="section-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={40}
        placeholder="Snacks"
      />
      {error ? (
        <p role="alert" className="mt-2 text-sm font-medium text-danger-600">
          {error}
        </p>
      ) : null}
    </BottomSheet>
  );
}

function ProductSheet({
  product,
  sections,
  shopId,
  busy,
  onClose,
  onSave,
  onDelete,
}: {
  product?: ManagedProduct;
  sections: { id: string; name: string }[];
  /** Needed by the photo picker, which authorises the upload against this shop. */
  shopId: string;
  busy: boolean;
  onClose: () => void;
  onSave: (changes: Record<string, unknown>) => void | Promise<void>;
  onDelete?: () => void;
}) {
  const [saving, setSaving] = React.useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);

    // Merchants think in rupees; the API stores paise.
    const rupees = Number(form.get('price'));

    await onSave({
      name: String(form.get('name')).trim(),
      description: String(form.get('description') ?? '').trim() || null,
      // Empty means the merchant removed the photo, which must reach the server
      // as null rather than being omitted.
      imageUrl: String(form.get('imageUrl') ?? '').trim() || null,
      priceMinor: Math.round(rupees * 100),
      prepMinutes: Number(form.get('prepMinutes')),
      unitLabel: String(form.get('unitLabel') ?? '').trim(),
      menuCategoryId: String(form.get('menuCategoryId') || '') || null,
      isPopular: form.get('isPopular') === 'on',
      // Only present when editing — a brand-new item has no special controls yet.
      ...(product
        ? {
            isTodaysSpecial: form.get('isTodaysSpecial') === 'on',
            specialNote: String(form.get('specialNote') ?? '').trim() || null,
          }
        : {}),
    });
    setSaving(false);
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={product ? `Edit ${product.name}` : 'Add a menu item'}
      description={product ? undefined : 'Customers see this immediately once saved.'}
    >
      <form id="product-form" onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="p-name">Item name</Label>
          <Input id="p-name" name="name" required maxLength={80} defaultValue={product?.name} placeholder="Masala Dosa" />
        </div>

        <ImageUploadField
          name="imageUrl"
          label="Photo"
          hint="A clear photo of the item sells it better than any description."
          shopId={shopId}
          folder="products"
          initialUrl={product?.imageUrl ?? null}
          seed={product?.id ?? 'new-item'}
          aspect="square"
        />

        <div>
          <Label htmlFor="p-desc">Description</Label>
          <Textarea
            id="p-desc"
            name="description"
            maxLength={300}
            defaultValue={product?.description ?? ''}
            placeholder="Crispy dosa with chutney and sambar"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="p-price">Price (₹)</Label>
            <Input
              id="p-price"
              name="price"
              type="number"
              min={0}
              step="0.5"
              required
              inputMode="decimal"
              defaultValue={product ? product.priceMinor / 100 : ''}
            />
          </div>
          <div>
            <Label htmlFor="p-prep">Preparation (min)</Label>
            <Input
              id="p-prep"
              name="prepMinutes"
              type="number"
              min={0}
              max={180}
              required
              inputMode="numeric"
              defaultValue={product?.prepMinutes ?? 5}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="p-unit">Unit label</Label>
            <Input
              id="p-unit"
              name="unitLabel"
              maxLength={40}
              defaultValue={product?.unitLabel ?? ''}
              placeholder="1 plate / per kg"
            />
          </div>
          <div>
            <Label htmlFor="p-section">Menu section</Label>
            <Select id="p-section" name="menuCategoryId" defaultValue={product?.menuCategoryId ?? ''}>
              <option value="">No section</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <label className="flex items-center gap-3 rounded-[var(--radius-field)] border border-border p-3">
          <input
            type="checkbox"
            name="isPopular"
            defaultChecked={product?.isPopular}
            className="size-4 accent-brand-500"
          />
          <span className="text-sm font-semibold">Show in the Popular section</span>
        </label>

        {product ? (
          <>
            <label className="flex items-center gap-3 rounded-[var(--radius-field)] border border-border p-3">
              <input
                type="checkbox"
                name="isTodaysSpecial"
                defaultChecked={product.isTodaysSpecial}
                className="size-4 accent-brand-500"
              />
              <span className="text-sm font-semibold">
                Today&rsquo;s special
                <span className="block text-xs font-normal text-muted">
                  Shown on your shop card in search. Clears itself tomorrow.
                </span>
              </span>
            </label>

            <div>
              <Label htmlFor="p-special-note">
                Special note <span className="font-normal text-muted">(optional)</span>
              </Label>
              <Input
                id="p-special-note"
                name="specialNote"
                maxLength={80}
                defaultValue={product.specialNote ?? ''}
                placeholder="Fresh batch at 4 PM"
              />
            </div>
          </>
        ) : null}

        <div className="flex gap-2 pt-2">
          <Button type="submit" size="lg" className="flex-1" loading={saving || busy}>
            {product ? 'Save changes' : 'Add item'}
          </Button>
          {onDelete ? (
            <Button type="button" variant="ghost" size="lg" className="text-danger-600" onClick={onDelete}>
              <Trash2 aria-hidden className="size-4" />
              <span className="sr-only">Remove item</span>
            </Button>
          ) : null}
        </div>
      </form>
    </BottomSheet>
  );
}

const TEMPLATES_LIST = [
  { id: 'kirana-grocery', name: '🛒 Kirana & General Grocery', desc: '20+ essential items (Atta, Rice, Milk, Oils, Pulses, Soaps)' },
  { id: 'tea-coffee-snacks', name: '☕ Tea Stall & Refreshments', desc: 'Masala Chai, Coffee, Samosa, Bun Maska, Omelettes' },
  { id: 'fresh-juices-fruits', name: '🍊 Fresh Juices & Fruit Counter', desc: 'Sweet Lime Juice, Shakes, Smoothies, Fruit Bowls' },
  { id: 'bakery-sweets', name: '🥐 Bakery & Confectionery', desc: 'Sandwich Bread, Pav Rolls, Cookies, Cakes, Buns' },
];

function TemplateImportSheet({
  shopId,
  onClose,
  onImported,
}: {
  shopId: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [selected, setSelected] = React.useState('kirana-grocery');
  const [loading, setLoading] = React.useState(false);
  const { toast } = useToast();

  const handleImport = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/merchant/shops/${shopId}/import-template`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ templateId: selected }),
      });
      const data = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) {
        toast(data.error ?? 'Failed to import catalog template.', 'error');
        return;
      }
      toast(data.message ?? 'Catalog imported successfully!');
      onImported();
    } catch {
      toast('Network error during catalog import.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <BottomSheet open title="Import Standard Catalog Template" onClose={onClose}>
      <div className="space-y-4 py-2">
        <p className="text-sm text-muted">
          Select a pre-built master catalog template for your store type to populate 20+ items in 1 click.
        </p>

        <div className="space-y-2">
          {TEMPLATES_LIST.map((t) => (
            <label
              key={t.id}
              className={cn(
                'flex cursor-pointer flex-col rounded-lg border p-3 transition-colors',
                selected === t.id ? 'border-brand-500 bg-brand-500/10' : 'border-border bg-surface',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold">{t.name}</span>
                <input
                  type="radio"
                  name="template"
                  value={t.id}
                  checked={selected === t.id}
                  onChange={() => setSelected(t.id)}
                  className="accent-brand-500"
                />
              </div>
              <span className="mt-1 text-xs text-muted">{t.desc}</span>
            </label>
          ))}
        </div>

        <div className="pt-2">
          <Button size="action" className="w-full" loading={loading} onClick={handleImport}>
            ⚡ Import Selected Catalog (1-Click)
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
