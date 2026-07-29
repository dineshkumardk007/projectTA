import type { Metadata } from 'next';
import { AlertTriangle } from 'lucide-react';
import { db } from '@/lib/db';
import { Card } from '@/components/ui/primitives';
import { env, isDeployed, isServerless, providerReadiness } from '@/lib/env';
import { criticalProviders, describeProviders } from '@/lib/domain/provider-health';
import { PlatformSettingsForm } from '@/components/admin/platform-settings-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Platform settings' };

export default async function AdminSettingsPage() {
  const settings = await db.platformSetting.findMany({ orderBy: { key: 'asc' } });

  const providers = describeProviders({
    email: { configured: providerReadiness.email, value: env.EMAIL_PROVIDER },
    push: { configured: providerReadiness.push, value: env.PUSH_PROVIDER },
    storage: { configured: providerReadiness.storage, value: env.STORAGE_PROVIDER },
    payments: { configured: providerReadiness.payments, value: env.PAYMENTS_PROVIDER },
    maps: { configured: providerReadiness.maps, value: env.MAPS_PROVIDER },
    isDeployed,
    isServerless,
  });

  const broken = criticalProviders(providers);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Platform settings</h1>

      {/* Leads the page when something is silently failing. These break in a way
          nobody reports, because from inside the app everything succeeded. */}
      {broken.length > 0 ? (
        <Card className="border-danger-500/40 bg-danger-50 p-4 dark:bg-danger-500/10">
          <p className="flex items-center gap-2 text-sm font-bold text-danger-700 dark:text-danger-100">
            <AlertTriangle aria-hidden className="size-4 shrink-0" />
            {broken.length} integration{broken.length === 1 ? ' is' : 's are'} not configured and failing silently
          </p>
          <ul className="mt-2 space-y-1.5">
            {broken.map((provider) => (
              <li key={provider.key} className="text-sm text-danger-700 dark:text-danger-100">
                <span className="font-semibold">{provider.name}:</span> {provider.consequence}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="p-4">
        <h2 className="font-bold">Integrations</h2>
        <p className="mt-1 text-sm text-muted">
          Each falls back to a local implementation when credentials are absent, so the platform starts rather than
          refusing to boot. Where that fallback cannot do the job, the consequence is spelled out below.
        </p>
        <ul className="mt-4 divide-y divide-border">
          {providers.map((provider) => (
            <li key={provider.key} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{provider.name}</p>
                <p className="text-xs text-muted">
                  Configured as <code className="font-mono">{provider.value}</code>
                  {!provider.configured ? ` · running on the built-in "${provider.fallback}" provider` : ''}
                </p>
                {provider.consequence ? (
                  <p
                    className={`mt-1 text-xs ${
                      provider.severity === 'broken' ? 'font-medium text-danger-600' : 'text-muted'
                    }`}
                  >
                    {provider.consequence}
                  </p>
                ) : null}
              </div>
              <span
                className={`shrink-0 rounded-[var(--radius-pill)] px-2.5 py-1 text-xs font-bold ${
                  provider.severity === 'ok'
                    ? 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-100'
                    : provider.severity === 'broken'
                      ? 'bg-danger-50 text-danger-700 dark:bg-danger-500/15 dark:text-danger-100'
                      : 'bg-surface-muted text-muted'
                }`}
              >
                {provider.severity === 'ok' ? 'Live' : provider.severity === 'broken' ? 'Not working' : 'Local'}
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
