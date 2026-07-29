'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Card, Input, Label, Textarea } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ImageUploadField } from '@/components/merchant/image-upload-field';

const DAYS =['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export type EditableShop = {
  id: string;
  slug: string;
  name: string;
  categoryEmoji: string;
  coverImageUrl: string | null;
  logoImageUrl: string | null;
  tagline: string | null;
  description: string | null;
  addressLine: string;
  phone: string;
  basePrepMinutes: number;
  maxActiveOrders: number;
  acceptsCashOnPickup: boolean;
  acceptsOnlinePayment: boolean;
  upiId: string | null;
  upiPayeeName: string | null;
  upiDepositPercent: number;
  allowUpiDeposit: boolean;
  operatingHours: { dayOfWeek: number; opensAt: number; closesAt: number; isClosed: boolean }[];
};

function toTimeInput(minutes: number): string {
  const clamped = Math.min(minutes, 1439);
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

function fromTimeInput(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

export function ShopSettingsForm({ shop }: { shop: EditableShop }) {
  const [saving, setSaving] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const [hours, setHours] = React.useState(() =>
    DAYS.map((_, dayOfWeek) => {
      const existing = shop.operatingHours.find((h) => h.dayOfWeek === dayOfWeek);
      return existing ?? { dayOfWeek, opensAt: 6 * 60, closesAt: 22 * 60, isClosed: false };
    }),
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch(`/api/merchant/shops/${shop.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: String(form.get('name')).trim(),
          tagline: String(form.get('tagline') ?? '').trim() || null,
          description: String(form.get('description') ?? '').trim() || null,
          // Empty string means "removed", which has to reach the server as null
          // rather than being dropped, or clearing a photo would silently fail.
          coverImageUrl: String(form.get('coverImageUrl') ?? '').trim() || null,
          logoImageUrl: String(form.get('logoImageUrl') ?? '').trim() || null,
          addressLine: String(form.get('addressLine')).trim(),
          phone: String(form.get('phone')).trim(),
          basePrepMinutes: Number(form.get('basePrepMinutes')),
          maxActiveOrders: Number(form.get('maxActiveOrders')),
          acceptsCashOnPickup: form.get('acceptsCashOnPickup') === 'on',
          acceptsOnlinePayment: form.get('acceptsOnlinePayment') === 'on',
          upiId: String(form.get('upiId') ?? '').trim(),
          upiPayeeName: String(form.get('upiPayeeName') ?? '').trim(),
          upiDepositPercent: Number(form.get('upiDepositPercent')),
          allowUpiDeposit: form.get('allowUpiDeposit') === 'on',
          operatingHours: hours,
        }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast(data.error ?? 'We could not save your shop settings.', 'error');
        return;
      }

      toast('Shop settings saved');
      router.refresh();
    } catch {
      toast('We could not reach the server.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Card className="space-y-4 p-4">
        <h2 className="font-bold">Shop profile</h2>

        {/* Photographs first: a listing with none converts worse than one with
            them, whatever the menu says. */}
        <ImageUploadField
          name="coverImageUrl"
          label="Cover photo"
          hint="Shown across the top of your shop page and on discovery cards."
          shopId={shop.id}
          folder="shops"
          initialUrl={shop.coverImageUrl}
          seed={shop.slug}
          emoji={shop.categoryEmoji}
          aspect="wide"
        />

        <ImageUploadField
          name="logoImageUrl"
          label="Logo"
          hint="Square works best — a sign, a logo, or the shopfront."
          shopId={shop.id}
          folder="shops"
          initialUrl={shop.logoImageUrl}
          seed={`${shop.slug}-logo`}
          emoji={shop.categoryEmoji}
          aspect="square"
        />

        <div>
          <Label htmlFor="s-name">Shop name</Label>
          <Input id="s-name" name="name" required defaultValue={shop.name} maxLength={80} />
        </div>

        <div>
          <Label htmlFor="s-tagline">Tagline</Label>
          <Input
            id="s-tagline"
            name="tagline"
            defaultValue={shop.tagline ?? ''}
            maxLength={120}
            placeholder="The 4 o'clock chai everyone queues for"
          />
        </div>

        <div>
          <Label htmlFor="s-description">Description</Label>
          <Textarea id="s-description" name="description" defaultValue={shop.description ?? ''} maxLength={600} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="s-address">Address</Label>
            <Input id="s-address" name="addressLine" required defaultValue={shop.addressLine} maxLength={160} />
          </div>
          <div>
            <Label htmlFor="s-phone">Phone</Label>
            <Input id="s-phone" name="phone" type="tel" required defaultValue={shop.phone} />
          </div>
        </div>
      </Card>

      <Card className="space-y-4 p-4">
        <div>
          <h2 className="font-bold">Preparation and capacity</h2>
          <p className="mt-0.5 text-sm text-muted">
            These drive the ready time customers are promised. Being slightly pessimistic here is better than
            being late.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="s-prep">Typical preparation (min)</Label>
            <Input
              id="s-prep"
              name="basePrepMinutes"
              type="number"
              min={1}
              max={180}
              required
              defaultValue={shop.basePrepMinutes}
            />
          </div>
          <div>
            <Label htmlFor="s-cap">Max orders at once</Label>
            <Input
              id="s-cap"
              name="maxActiveOrders"
              type="number"
              min={0}
              max={500}
              required
              defaultValue={shop.maxActiveOrders}
            />
            <p className="mt-1 text-xs text-muted">0 means no limit.</p>
          </div>
        </div>

        <div className="rounded-[var(--radius-field)] border border-border p-3">
          <p className="text-sm font-bold">Collect by UPI</p>
          <p className="mt-0.5 text-xs text-muted">
            Customers pay this UPI ID directly from Google Pay, PhonePe or any UPI app. The money reaches your
            account — Takeaway never holds it and takes no commission. Leave blank to switch UPI off.
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="s-upi">Your UPI ID</Label>
              <Input
                id="s-upi"
                name="upiId"
                defaultValue={shop.upiId ?? ''}
                placeholder="shopname@okaxis"
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div>
              <Label htmlFor="s-upi-name">Name shown to payers</Label>
              <Input
                id="s-upi-name"
                name="upiPayeeName"
                defaultValue={shop.upiPayeeName ?? ''}
                placeholder={shop.name}
                maxLength={99}
              />
            </div>
          </div>

          <label className="mt-3 flex items-center gap-3 rounded-[var(--radius-field)] border border-border p-3">
            <input
              type="checkbox"
              name="allowUpiDeposit"
              defaultChecked={shop.allowUpiDeposit}
              className="size-4 accent-brand-500"
            />
            <span className="text-sm font-semibold">
              Allow part payment
              <span className="block text-xs font-normal text-muted">
                Customer pays a deposit now and the rest in cash at your counter.
              </span>
            </span>
          </label>

          <div className="mt-3 max-w-[12rem]">
            <Label htmlFor="s-upi-deposit">Deposit (%)</Label>
            <Input
              id="s-upi-deposit"
              name="upiDepositPercent"
              type="number"
              min={5}
              max={100}
              defaultValue={shop.upiDepositPercent}
            />
          </div>

          <p className="mt-3 rounded-[var(--radius-field)] bg-warning-50 px-3 py-2 text-xs text-warning-700 dark:bg-warning-500/10 dark:text-warning-100">
            UPI apps do not tell us when a payment lands. You will see each payment on your order board with the
            customer&rsquo;s reference — check it in your own UPI app, then tap <strong>Payment received</strong>.
          </p>
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-semibold">Payment methods you accept</legend>
          <label className="flex items-center gap-3 rounded-[var(--radius-field)] border border-border p-3">
            <input
              type="checkbox"
              name="acceptsCashOnPickup"
              defaultChecked={shop.acceptsCashOnPickup}
              className="size-4 accent-brand-500"
            />
            <span className="text-sm font-semibold">Cash or UPI at the counter</span>
          </label>
          <label className="flex items-center gap-3 rounded-[var(--radius-field)] border border-border p-3">
            <input
              type="checkbox"
              name="acceptsOnlinePayment"
              defaultChecked={shop.acceptsOnlinePayment}
              className="size-4 accent-brand-500"
            />
            <span className="text-sm font-semibold">Pay online before preparation</span>
          </label>
        </fieldset>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 font-bold">Opening hours</h2>
        <div className="space-y-2">
          {hours.map((day, index) => (
            <div key={day.dayOfWeek} className="flex flex-wrap items-center gap-2">
              <span className="w-24 text-sm font-semibold">{DAYS[day.dayOfWeek]}</span>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!day.isClosed}
                  onChange={(event) =>
                    setHours((current) =>
                      current.map((h, i) => (i === index ? { ...h, isClosed: !event.target.checked } : h)),
                    )
                  }
                  className="size-4 accent-brand-500"
                />
                Open
              </label>

              <input
                type="time"
                aria-label={`${DAYS[day.dayOfWeek]} opening time`}
                value={toTimeInput(day.opensAt)}
                disabled={day.isClosed}
                onChange={(event) =>
                  setHours((current) =>
                    current.map((h, i) => (i === index ? { ...h, opensAt: fromTimeInput(event.target.value) } : h)),
                  )
                }
                className="h-10 rounded-[var(--radius-field)] border border-border bg-surface px-2 text-sm disabled:opacity-50"
              />
              <span className="text-sm text-muted">to</span>
              <input
                type="time"
                aria-label={`${DAYS[day.dayOfWeek]} closing time`}
                value={toTimeInput(day.closesAt)}
                disabled={day.isClosed}
                onChange={(event) =>
                  setHours((current) =>
                    current.map((h, i) => (i === index ? { ...h, closesAt: fromTimeInput(event.target.value) } : h)),
                  )
                }
                className="h-10 rounded-[var(--radius-field)] border border-border bg-surface px-2 text-sm disabled:opacity-50"
              />
            </div>
          ))}
        </div>
      </Card>

      <Button type="submit" size="action" loading={saving}>
        Save shop settings
      </Button>
    </form>
  );
}
