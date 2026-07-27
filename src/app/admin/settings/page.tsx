import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { Card } from '@/components/ui/primitives';
import { env, providerReadiness } from '@/lib/env';
import { PlatformSettingsForm } from '@/components/admin/platform-settings-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Platform settings' };

export default async function AdminSettingsPage() {
  const settings = await db.platformSetting.findMany({ orderBy: { key: 'asc' } });

  const providers = [
    { name: 'Payments', configured: providerReadiness.payments, value: env.PAYMENTS_PROVIDER, fallback: 'mock' },
    { name: 'Maps / distance', configured: providerReadiness.maps, value: env.MAPS_PROVIDER, fallback: 'haversine' },
    { name: 'Push notifications', configured: providerReadiness.push, value: env.PUSH_PROVIDER, fallback: 'mock' },
    { name: 'Image storage', configured: providerReadiness.storage, value: env.STORAGE_PROVIDER, fallback: 'local' },
  ];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Platform settings</h1>

      <Card className="p-4">
        <h2 className="font-bold">Integrations</h2>
        <p className="mt-1 text-sm text-muted">
          Each integration falls back to a local implementation when credentials are absent, so the platform keeps
          working rather than failing at checkout.
        </p>
        <ul className="mt-4 divide-y divide-border">
          {providers.map((provider) => (
            <li key={provider.name} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-semibold">{provider.name}</p>
                <p className="text-xs text-muted">
                  Configured as <code className="font-mono">{provider.value}</code>
                  {!provider.configured ? ` · running on the built-in "${provider.fallback}" provider` : ''}
                </p>
              </div>
              <span
                className={`rounded-[var(--radius-pill)] px-2.5 py-1 text-xs font-bold ${
                  provider.configured
                    ? 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-100'
                    : 'bg-surface-muted text-muted'
                }`}
              >
                {provider.configured ? 'Live' : 'Local'}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <PlatformSettingsForm
        settings={settings.map((setting) => ({
          key: setting.key,
          value: JSON.stringify(setting.value),
          description: setting.description,
        }))}
      />
    </div>
  );
}
