'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Card, Input, Label } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

/**
 * Editable platform configuration — commission, subscription pricing,
 * cancellation policy, auto-expiry.
 *
 * Values are JSON so pricing and policy can change without a schema migration
 * or a deploy, which is the point: none of these numbers are settled yet.
 */
export function PlatformSettingsForm({
  settings,
}: {
  settings: { key: string; value: string; description: string | null }[];
}) {
  const [values, setValues] = React.useState(() =>
    Object.fromEntries(settings.map((s) => [s.key, s.value])),
  );
  const [savingKey, setSavingKey] = React.useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  async function save(key: string) {
    setSavingKey(key);
    try {
      // Validate here so an invalid value never reaches the database.
      let parsed: unknown;
      try {
        parsed = JSON.parse(values[key]);
      } catch {
        toast('That is not valid JSON. Numbers, "strings", true/false or {objects}.', 'error');
        return;
      }

      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key, value: parsed }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast(data.error ?? 'We could not save that setting.', 'error');
        return;
      }
      toast('Setting saved');
      router.refresh();
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <Card className="p-4">
      <h2 className="font-bold">Platform configuration</h2>
      <p className="mt-1 text-sm text-muted">
        Pricing and policy are stored as data, not hardcoded, so they can be tuned with real merchants.
      </p>

      <div className="mt-4 space-y-4">
        {settings.map((setting) => (
          <div key={setting.key}>
            <Label htmlFor={`setting-${setting.key}`}>
              <code className="font-mono text-xs">{setting.key}</code>
            </Label>
            {setting.description ? (
              <p className="mb-1.5 text-xs text-muted">{setting.description}</p>
            ) : null}
            <div className="flex gap-2">
              <Input
                id={`setting-${setting.key}`}
                value={values[setting.key] ?? ''}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [setting.key]: event.target.value }))
                }
                className="font-mono text-sm"
              />
              <Button
                variant="outline"
                size="lg"
                loading={savingKey === setting.key}
                onClick={() => save(setting.key)}
              >
                Save
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
