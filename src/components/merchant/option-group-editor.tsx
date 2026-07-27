'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { Card, Input, Label, Select } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { useToast } from '@/components/ui/toast';
import { formatMinor } from '@/lib/domain/money';

/**
 * Customisations and add-ons for one product.
 *
 * Merchants think in terms of "pick one" and "pick any", not min/max integers,
 * so the form asks that question and derives the numbers. The underlying model
 * is the same for both, which is why one editor covers spice levels and extra
 * chutney alike.
 */

export type EditableOption = {
  id?: string;
  name: string;
  priceDeltaMinor: number;
  prepDeltaMinutes: number;
  isAvailable: boolean;
};

export type EditableGroup = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: EditableOption[];
};

type Kind = 'pick-one-required' | 'pick-one-optional' | 'pick-many';

function kindOf(group: { minSelect: number; maxSelect: number }): Kind {
  if (group.maxSelect > 1) return 'pick-many';
  return group.minSelect > 0 ? 'pick-one-required' : 'pick-one-optional';
}

const KIND_LABELS: Record<Kind, string> = {
  'pick-one-required': 'Customer must pick exactly one',
  'pick-one-optional': 'Customer may pick one',
  'pick-many': 'Customer may pick several',
};

export function OptionGroupEditor({
  productId,
  productName,
  groups,
  onClose,
}: {
  productId: string;
  productName: string;
  groups: EditableGroup[];
  onClose: () => void;
}) {
  const [editing, setEditing] = React.useState<EditableGroup | 'new' | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  async function remove(group: EditableGroup) {
    setBusyId(group.id);
    try {
      const response = await fetch(`/api/merchant/option-groups/${group.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        toast(data.error ?? 'We could not remove that.', 'error');
        return;
      }
      toast(`"${group.name}" removed`);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (editing) {
    return (
      <GroupForm
        productId={productId}
        group={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          router.refresh();
        }}
      />
    );
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={`Choices for ${productName}`}
      description="Spice levels, sugar, extras — anything the customer picks when ordering."
      footer={
        <Button size="lg" className="w-full" onClick={() => setEditing('new')}>
          <Plus aria-hidden className="size-4" />
          Add a choice group
        </Button>
      }
    >
      {groups.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          No choices yet. Customers add this item in one tap.
        </p>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <Card key={group.id} className="p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold">{group.name}</p>
                  <p className="text-xs text-muted">{KIND_LABELS[kindOf(group)]}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="outline" onClick={() => setEditing(group)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger-600"
                    loading={busyId === group.id}
                    onClick={() => remove(group)}
                    aria-label={`Remove ${group.name}`}
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </Button>
                </div>
              </div>

              <ul className="mt-2 flex flex-wrap gap-1.5">
                {group.options.map((option) => (
                  <li
                    key={option.name}
                    className="rounded-[var(--radius-pill)] bg-surface-muted px-2.5 py-1 text-xs font-medium"
                  >
                    {option.name}
                    {option.priceDeltaMinor !== 0 ? ` +${formatMinor(option.priceDeltaMinor)}` : ''}
                    {!option.isAvailable ? ' · off' : ''}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </BottomSheet>
  );
}

function GroupForm({
  productId,
  group,
  onClose,
  onSaved,
}: {
  productId: string;
  group: EditableGroup | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = React.useState(group?.name ?? '');
  const [kind, setKind] = React.useState<Kind>(group ? kindOf(group) : 'pick-one-required');
  const [maxSelect, setMaxSelect] = React.useState(group && group.maxSelect > 1 ? group.maxSelect : 3);
  const [options, setOptions] = React.useState<EditableOption[]>(
    group?.options.map((o) => ({ ...o })) ?? [
      { name: '', priceDeltaMinor: 0, prepDeltaMinutes: 0, isAvailable: true },
    ],
  );
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function updateOption(index: number, patch: Partial<EditableOption>) {
    setOptions((current) => current.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  }

  async function save() {
    setError(null);

    const cleaned = options
      .map((o) => ({ ...o, name: o.name.trim() }))
      .filter((o) => o.name.length > 0);

    if (!name.trim()) return setError('Give this group a name, such as “Spice level”.');
    if (cleaned.length === 0) return setError('Add at least one choice.');

    const minSelect = kind === 'pick-one-required' ? 1 : 0;
    const resolvedMax = kind === 'pick-many' ? Math.min(maxSelect, cleaned.length) : 1;

    setSaving(true);
    try {
      const url = group
        ? `/api/merchant/option-groups/${group.id}`
        : `/api/merchant/products/${productId}/option-groups`;

      const response = await fetch(url, {
        method: group ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          minSelect,
          maxSelect: resolvedMax,
          options: cleaned,
        }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? 'We could not save that.');
        return;
      }

      toast(group ? 'Choices updated' : 'Choices added');
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
      title={group ? `Edit ${group.name}` : 'Add a choice group'}
      footer={
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" loading={saving} onClick={save}>
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="group-name">Group name</Label>
          <Input
            id="group-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            placeholder="Spice level, Sugar, Extras…"
          />
        </div>

        <div>
          <Label htmlFor="group-kind">How many can the customer pick?</Label>
          <Select id="group-kind" value={kind} onChange={(event) => setKind(event.target.value as Kind)}>
            <option value="pick-one-required">Exactly one — required</option>
            <option value="pick-one-optional">One — optional</option>
            <option value="pick-many">Several — optional</option>
          </Select>
        </div>

        {kind === 'pick-many' ? (
          <div>
            <Label htmlFor="group-max">Maximum they can pick</Label>
            <Input
              id="group-max"
              type="number"
              min={1}
              max={10}
              value={maxSelect}
              onChange={(event) => setMaxSelect(Number(event.target.value))}
            />
          </div>
        ) : null}

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Choices</legend>
          <div className="space-y-2">
            {options.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  aria-label={`Choice ${index + 1} name`}
                  value={option.name}
                  onChange={(event) => updateOption(index, { name: event.target.value })}
                  placeholder="Regular"
                  className="flex-1"
                />
                <div className="flex w-28 items-center gap-1">
                  <span aria-hidden className="text-sm text-muted">
                    +₹
                  </span>
                  <Input
                    aria-label={`Choice ${index + 1} extra cost in rupees`}
                    type="number"
                    min={0}
                    step="0.5"
                    inputMode="decimal"
                    value={option.priceDeltaMinor / 100}
                    onChange={(event) =>
                      updateOption(index, { priceDeltaMinor: Math.round(Number(event.target.value) * 100) })
                    }
                  />
                </div>
                <button
                  type="button"
                  aria-label={`Remove choice ${index + 1}`}
                  onClick={() => setOptions((current) => current.filter((_, i) => i !== index))}
                  disabled={options.length === 1}
                  className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-field)] text-danger-600 disabled:opacity-40"
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
              </div>
            ))}
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() =>
              setOptions((current) => [
                ...current,
                { name: '', priceDeltaMinor: 0, prepDeltaMinutes: 0, isAvailable: true },
              ])
            }
          >
            <Plus aria-hidden className="size-4" />
            Add a choice
          </Button>
        </fieldset>

        {error ? (
          <p role="alert" className="text-sm font-medium text-danger-600">
            {error}
          </p>
        ) : null}
      </div>
    </BottomSheet>
  );
}
