'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Send, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, Input, Label, Select, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { CAMPAIGN_TEMPLATES } from '@/lib/domain/campaign-templates';

/**
 * The campaign composer.
 *
 * Built so the audience size is visible *before* the send button does anything.
 * "Check audience" is the primary action on first load and sending only becomes
 * available once a real number has come back — a push tool where you find out
 * how many people you reached afterwards is a push tool that will one day reach
 * everybody.
 */
export function CampaignComposer({ cities }: { cities: string[] }) {
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [href, setHref] = React.useState('/shops?openNow=true');
  const [city, setCity] = React.useState('');
  const [latitude, setLatitude] = React.useState('');
  const [longitude, setLongitude] = React.useState('');
  const [radiusKm, setRadiusKm] = React.useState('3');
  const [orderedBefore, setOrderedBefore] = React.useState(false);

  /**
   * The counted audience, tagged with the targeting it was counted for.
   *
   * Stored together rather than invalidated in an effect so staleness is
   * *derived*: the moment any targeting field changes, `audienceKey` stops
   * matching and the count is no longer offered. An effect that nulled the count
   * would leave one render in which the old number was still on screen next to
   * an enabled Send button — the exact mistake this guard exists to prevent.
   */
  const [counted, setCounted] = React.useState<{
    key: string;
    total: number;
    reachable: number;
    willSendTo: number;
    truncated: boolean;
  } | null>(null);
  const [pending, setPending] = React.useState(false);

  const { toast } = useToast();
  const router = useRouter();

  const audienceKey = JSON.stringify([city, latitude, longitude, radiusKm, orderedBefore]);
  const audience = counted?.key === audienceKey ? counted : null;

  function buildTarget() {
    const lat = latitude.trim() ? Number(latitude) : undefined;
    const lng = longitude.trim() ? Number(longitude) : undefined;
    const usesGeo = Number.isFinite(lat) && Number.isFinite(lng);

    return {
      city: city || undefined,
      latitude: usesGeo ? lat : undefined,
      longitude: usesGeo ? lng : undefined,
      radiusKm: usesGeo && radiusKm.trim() ? Number(radiusKm) : undefined,
      orderedBefore: orderedBefore || undefined,
    };
  }

  async function post(previewOnly: boolean) {
    setPending(true);
    try {
      const response = await fetch('/api/admin/campaigns', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          href: href.trim() || undefined,
          target: buildTarget(),
          previewOnly,
        }),
      });
      const data = (await response.json()) as Record<string, number | boolean | string> & { error?: string };

      if (!response.ok) {
        toast(data.error ?? 'That campaign could not be sent.', 'error');
        return;
      }

      if (previewOnly) {
        setCounted({
          key: audienceKey,
          total: Number(data.total),
          reachable: Number(data.reachable),
          willSendTo: Number(data.willSendTo),
          truncated: Boolean(data.truncated),
        });
        return;
      }

      toast(
        `Sent to ${data.targetedUsers} customer(s) — ${data.deliveredPushes} push notification(s) delivered.`,
      );
      setCounted(null);
      router.refresh();
    } catch {
      toast('We could not reach the server.', 'error');
    } finally {
      setPending(false);
    }
  }

  const canSend = audience != null && audience.willSendTo > 0 && title.trim().length >= 3 && body.trim().length >= 5;

  return (
    <Card className="p-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <Label htmlFor="campaign-template">Start from a template</Label>
            <Select
              id="campaign-template"
              defaultValue=""
              onChange={(event) => {
                const template = CAMPAIGN_TEMPLATES.find((option) => option.id === event.target.value);
                if (!template) return;
                setTitle(template.title);
                setBody(template.body);
                setHref(template.href);
              }}
            >
              <option value="">Write my own</option>
              {CAMPAIGN_TEMPLATES.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="campaign-title">Title</Label>
            <Input
              id="campaign-title"
              value={title}
              maxLength={60}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Tea time ☕"
            />
          </div>

          <div>
            <Label htmlFor="campaign-body">Message</Label>
            <Textarea
              id="campaign-body"
              value={body}
              maxLength={240}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Order now and skip the 5 PM queue."
            />
            <p className="mt-1 text-xs text-muted">{body.length}/240</p>
          </div>

          <div>
            <Label htmlFor="campaign-href">Opens</Label>
            <Input
              id="campaign-href"
              value={href}
              onChange={(event) => setHref(event.target.value)}
              placeholder="/shops?openNow=true"
            />
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="campaign-city">City</Label>
            <Select id="campaign-city" value={city} onChange={(event) => setCity(event.target.value)}>
              <option value="">Every city</option>
              {cities.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold">Within a radius (optional)</legend>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label htmlFor="campaign-lat" className="text-xs">Latitude</Label>
                <Input
                  id="campaign-lat"
                  value={latitude}
                  onChange={(event) => setLatitude(event.target.value)}
                  placeholder="8.7642"
                  inputMode="decimal"
                />
              </div>
              <div>
                <Label htmlFor="campaign-lng" className="text-xs">Longitude</Label>
                <Input
                  id="campaign-lng"
                  value={longitude}
                  onChange={(event) => setLongitude(event.target.value)}
                  placeholder="78.1348"
                  inputMode="decimal"
                />
              </div>
              <div>
                <Label htmlFor="campaign-radius" className="text-xs">km</Label>
                <Input
                  id="campaign-radius"
                  value={radiusKm}
                  onChange={(event) => setRadiusKm(event.target.value)}
                  inputMode="decimal"
                />
              </div>
            </div>
            <p className="mt-1 text-xs text-muted">
              Matched against the home area each customer saved themselves — never a live location.
            </p>
          </fieldset>

          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={orderedBefore}
              onChange={(event) => setOrderedBefore(event.target.checked)}
              className="mt-0.5 size-4 accent-[var(--color-brand-500)]"
            />
            <span>
              Only customers who have ordered before
              <span className="block text-xs text-muted">
                Usually the right choice — people who have used the app once are far likelier to want this.
              </span>
            </span>
          </label>

          {audience ? (
            <Card className="bg-surface-muted p-4">
              <p className="flex items-center gap-2 text-sm font-bold">
                <Users aria-hidden className="size-4" />
                {audience.willSendTo.toLocaleString('en-IN')} customer
                {audience.willSendTo === 1 ? '' : 's'} match
              </p>
              <p className="mt-1 text-xs text-muted">
                {audience.reachable.toLocaleString('en-IN')} of them have push notifications switched on. The
                rest will see it in the app.
              </p>
              {audience.truncated ? (
                <p className="mt-1 text-xs font-semibold text-warning-600">
                  Capped at 2,000 recipients — narrow the audience to reach a specific group.
                </p>
              ) : null}
            </Card>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" loading={pending} onClick={() => post(true)}>
              <Users aria-hidden className="size-4" />
              Check audience
            </Button>
            <Button disabled={!canSend} loading={pending} onClick={() => post(false)}>
              <Send aria-hidden className="size-4" />
              Send now
            </Button>
          </div>
          {!canSend && audience == null ? (
            <p className="text-xs text-muted">Check the audience before sending.</p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
