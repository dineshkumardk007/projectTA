import { describe, expect, it } from 'vitest';
import { criticalProviders, describeProviders } from '@/lib/domain/provider-health';

const OFF = { configured: false, value: 'mock' };
const ON = { configured: true, value: 'live' };

function build(overrides: Partial<Parameters<typeof describeProviders>[0]> = {}) {
  return describeProviders({
    email: OFF,
    push: OFF,
    storage: OFF,
    payments: OFF,
    maps: OFF,
    isDeployed: false,
    isServerless: false,
    ...overrides,
  });
}

const find = (list: ReturnType<typeof describeProviders>, key: string) => list.find((p) => p.key === key)!;

describe('describeProviders', () => {
  it('does not cry wolf on a developer machine', () => {
    // Everything unconfigured locally is normal and must not read as an outage.
    expect(criticalProviders(build())).toHaveLength(0);
  });

  it('flags email and push as broken once deployed', () => {
    const deployed = build({ isDeployed: true });
    expect(find(deployed, 'email').severity).toBe('broken');
    expect(find(deployed, 'push').severity).toBe('broken');
  });

  it('explains the consequence rather than naming the setting', () => {
    const email = find(build({ isDeployed: true }), 'email');
    // An operator should learn what happens to a person, not which env var is unset.
    expect(email.consequence).toMatch(/cannot get back in/i);
    expect(find(build({ isDeployed: true }), 'push').consequence).toMatch(/wait at the counter/i);
  });

  it('goes quiet once configured', () => {
    const good = build({ isDeployed: true, email: ON, push: ON, storage: ON });
    expect(find(good, 'email').severity).toBe('ok');
    expect(find(good, 'email').consequence).toBe('');
    expect(criticalProviders(good)).toHaveLength(0);
  });

  it('treats local storage as broken only where the disk is not writable', () => {
    // A normal server can write to disk; serverless cannot.
    expect(find(build({ isDeployed: true, isServerless: false }), 'storage').severity).toBe('degraded');
    expect(find(build({ isDeployed: true, isServerless: true }), 'storage').severity).toBe('broken');
  });

  it('does not call a missing payment gateway broken', () => {
    // Direct UPI and cash are the primary paths and need no gateway.
    const payments = find(build({ isDeployed: true }), 'payments');
    expect(payments.severity).toBe('degraded');
    expect(payments.consequence).toMatch(/still pay/i);
  });

  it('never flags maps, whose fallback is the intended default', () => {
    expect(find(build({ isDeployed: true }), 'maps').severity).toBe('ok');
  });

  it('reports every provider so the admin list is complete', () => {
    expect(build().map((p) => p.key).sort()).toEqual(['email', 'maps', 'payments', 'push', 'storage']);
  });
});

describe('criticalProviders', () => {
  it('returns only the silently-failing ones', () => {
    const deployed = build({ isDeployed: true, isServerless: true });
    expect(criticalProviders(deployed).map((p) => p.key).sort()).toEqual(['email', 'push', 'storage']);
  });
});
